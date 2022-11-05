<script lang="ts">
	import { fade } from "svelte/transition"
	import { page } from "$app/stores"

	import { Button, InlineLoading, Modal, ProgressBar } from "carbon-components-svelte"

	import { getAllMods, getConfig, getManifestFromModID, modIsFramework, getModFolder, mergeConfig, FrameworkVersion, getAllModWarnings } from "$lib/utils"

	import { v4 } from "uuid"
	import { marked } from "marked"

	import semver from "semver"
	import json5 from "json5"

	import List from "carbon-icons-svelte/lib/List.svelte"
	import Settings from "carbon-icons-svelte/lib/Settings.svelte"
	import Info from "carbon-icons-svelte/lib/Information.svelte"
	import Checkmark from "carbon-icons-svelte/lib/Checkmark.svelte"
	import Download from "carbon-icons-svelte/lib/Download.svelte"
	import Edit from "carbon-icons-svelte/lib/Edit.svelte"

	let cannotFindConfig = false
	let cannotFindRuntime = false
	let cannotFindRetail = false
	let cannotFindGameConfig = false
	let cannotFindHITMAN3 = false
	let errorReportingPrompt = false

	let invalidModOpen = false
	let invalidModText = ""

	try {
		getConfig()
	} catch {
		cannotFindConfig = true
	}

	if (typeof getConfig().retailPath === "undefined") {
		mergeConfig({
			retailPath: "..\\Retail"
		})
	}

	if (!cannotFindConfig) {
		if (!window.fs.existsSync(window.path.resolve("..", getConfig().runtimePath))) {
			if (window.fs.existsSync(window.path.join(getConfig().retailPath, "Runtime", "chunk0.rpkg")) && getConfig().runtimePath == "..\\Runtime") {
				mergeConfig({
					runtimePath: "..\\Retail\\Runtime"
				})
			} else {
				cannotFindRuntime = true
			}
		} else {
			if (!window.fs.existsSync(window.path.resolve("..", getConfig().retailPath))) {
				cannotFindRetail = true
			} else {
				if (
					!window.fs.existsSync(window.path.join(getConfig().retailPath, "Runtime", "chunk0.rpkg")) &&
					!window.fs.existsSync(window.path.join(window.path.resolve("..", getConfig().retailPath), "HITMAN3.exe"))
				) {
					cannotFindHITMAN3 = true
				}

				if (
					window.fs.existsSync(window.path.join(getConfig().retailPath, "Runtime", "chunk0.rpkg")) &&
					!window.fs.existsSync(window.path.join(window.path.resolve("..", getConfig().retailPath), "..", "MicrosoftGame.Config"))
				) {
					cannotFindGameConfig = true
				}
			}
		}
	}

	if (!cannotFindConfig && !cannotFindRuntime && !cannotFindRetail && !cannotFindGameConfig && !cannotFindHITMAN3) {
		if (typeof getConfig().reportErrors == "undefined") {
			errorReportingPrompt = true
		}
	}

	try {
		getAllMods().map((a) => (modIsFramework(a) ? getManifestFromModID(a) : a))
	} catch {
		invalidModText =
			window.fs
				.readdirSync(window.path.join("..", "Mods"))
				.map((a) => window.path.resolve(window.path.join("..", "Mods", a)))
				.find((a) => window.fs.existsSync(window.path.join(a, "manifest.json")) && !json5.parse(window.fs.readFileSync(window.path.join(a, "manifest.json"), "utf8")).id)
				?.split(window.path.sep)
				?.pop() || "<can't find which one>"
		invalidModOpen = true
	}

	let latestGithubRelease = checkForUpdates()

	let githubReleaseMarkdownBody = ""

	async function checkForUpdates(): Promise<any> {
		const release = await (
			await fetch("https://api.github.com/repos/atampy25/simple-mod-framework/releases/latest", {
				headers: {
					Accept: "application/vnd.github.v3+json"
				}
			})
		).json()

		githubReleaseMarkdownBody = marked(release.body, { gfm: true }).replaceAll("Bugfixes", "Bug Fixes")
		canAutomaticallyUpdate = !release.body.includes("CANNOT AUTOMATICALLY UPDATE")

		return release
	}

	let canAutomaticallyUpdate = false
	let updatingFramework = false
	let frameworkDownloadProgress = 0
	let frameworkDownloadSize = 0
	let frameworkExtracting = false

	async function startFrameworkUpdate() {
		const response = await fetch("https://github.com/atampy25/simple-mod-framework/releases/latest/download/Release.zip")
		const reader = response.body!.getReader()

		frameworkDownloadSize = +response.headers.get("Content-Length")!

		let receivedLength = 0
		let chunks = []
		while (true) {
			const { done, value } = await reader.read()

			if (done) {
				break
			}

			chunks.push(value)
			receivedLength += value.length

			frameworkDownloadProgress = receivedLength
		}

		let chunksAll = new Uint8Array(receivedLength)
		let position = 0
		for (let chunk of chunks) {
			chunksAll.set(chunk, position)
			position += chunk.length
		}

		frameworkExtracting = true

		window.fs.emptyDirSync("./staging")

		window.fs.writeFileSync("./temp.zip", chunksAll)

		new window.AdmZip("./temp.zip", { fs: window.originalFs }).extractAllTo("./staging")

		window.fs.removeSync("./staging/Mods")
		window.fs.removeSync("./staging/cleanPackageDefinition.txt")
		window.fs.removeSync("./staging/cleanThumbs.dat")
		window.fs.removeSync("./staging/config.json")
		window.fs.removeSync("./staging/Mod Manager/chrome_100_percent.pak")
		window.fs.removeSync("./staging/Mod Manager/chrome_200_percent.pak")
		window.fs.removeSync("./staging/Mod Manager/d3dcompiler_47.dll")
		window.fs.removeSync("./staging/Mod Manager/ffmpeg.dll")
		window.fs.removeSync("./staging/Mod Manager/icudtl.dat")
		window.fs.removeSync("./staging/Mod Manager/libEGL.dll")
		window.fs.removeSync("./staging/Mod Manager/libGLESv2.dll")
		window.fs.removeSync("./staging/Mod Manager/Mod Manager.exe")
		window.fs.removeSync("./staging/Mod Manager/locales")
		window.fs.removeSync("./staging/Mod Manager/resources.pak")
		window.fs.removeSync("./staging/Mod Manager/snapshot_blob.bin")
		window.fs.removeSync("./staging/Mod Manager/v8_context_snapshot.bin")
		window.fs.removeSync("./staging/Mod Manager/vk_swiftshader.dll")
		window.fs.removeSync("./staging/Mod Manager/vk_swiftshader_icd.json")
		window.fs.removeSync("./staging/Mod Manager/vulkan_1.dll")

		window.fs.removeSync("../Load Order Manager")

		window.originalFs.renameSync("./staging/Mod Manager/resources/app.asar", "./temp.asar")
		window.originalFs.cpSync("./staging", "..", { recursive: true })
		window.originalFs.copyFileSync("./temp.asar", "./resources/app.asar")

		window.fs.removeSync("./staging")
		window.fs.removeSync("./temp.zip")
		window.fs.removeSync("./temp.asar")

		updatingFramework = false

		window.ipc.send("relaunchApp")
	}

	let modUpdates = checkForModUpdates()

	async function checkForModUpdates(): Promise<any> {
		let modUpdateJSONs = []

		for (let mod of getAllMods()) {
			if (modIsFramework(mod) && getManifestFromModID(mod).updateCheck) {
				modUpdateJSONs.push([mod, await (await fetch(getManifestFromModID(mod).updateCheck!)).json()])
			}
		}

		return modUpdateJSONs
	}

	let updatingMod: {
		id: string
		version: string
		url: string
		changelog: string
		managedFilesAndFolders: string[]
	} | null = null
	let modDownloadProgress = 0
	let modDownloadSize = 0
	let modExtracting = false

	async function startModUpdate() {
		const response = await fetch(updatingMod!.url)
		const reader = response.body!.getReader()

		modDownloadSize = +response.headers.get("Content-Length")!

		let receivedLength = 0
		let chunks = []
		while (true) {
			const { done, value } = await reader.read()

			if (done) {
				break
			}

			chunks.push(value)
			receivedLength += value.length

			modDownloadProgress = receivedLength
		}

		let chunksAll = new Uint8Array(receivedLength)
		let position = 0
		for (let chunk of chunks) {
			chunksAll.set(chunk, position)
			position += chunk.length
		}

		modExtracting = true

		window.fs.emptyDirSync("./staging")

		window.fs.writeFileSync("./temp.zip", chunksAll)

		new window.AdmZip("./temp.zip").extractAllTo("./staging")

		window.fs.removeSync(getModFolder(updatingMod!.id))

		window.fs.copySync("./staging", "../Mods")
		window.fs.removeSync("./staging")
		window.fs.removeSync("./temp.zip")

		updatingMod = null

		window.location.reload()
	}

	let modDiagnosticsComplete = false
	let removeModDiagnosticsElemYet = false

	if (!$page.url.searchParams.get("doNotRunDiagnostics")) {
		setTimeout(async () => {
			window.fs.removeSync("./warnings.json")

			await getAllModWarnings()
			modDiagnosticsComplete = true
			setTimeout(() => (removeModDiagnosticsElemYet = true), 1000)
		}, 1000)
	} else {
		modDiagnosticsComplete = true
		removeModDiagnosticsElemYet = true
	}
</script>

<div class="w-full h-full overflow-y-auto flex items-center justify-center gap-96">
	<div>
		<h1 in:fade>Welcome to the Simple Mod Framework</h1>
		<br />
		<div class="inline" in:fade={{ delay: 400 }}>
			<Button kind="primary" icon={List} href="/modList" sveltekit:reload>Enable/disable mods</Button>
		</div>
		<div class="inline" in:fade={{ delay: 800 }}>
			<Button kind="primary" icon={Settings} href="/settings" sveltekit:reload>Configure mods</Button>
		</div>
		<div class="inline" in:fade={{ delay: 800 }}>
			<Button kind="primary" icon={Edit} href="/authoring" sveltekit:reload>Author mods</Button>
		</div>
		<div class="inline" in:fade={{ delay: 1200 }}>
			<Button kind="primary" icon={Info} href="/info" sveltekit:reload>More information</Button>
		</div>
		<p class="mt-4" in:fade={{ delay: 1600 }}>Need help using mods? Consult the pinned post on the Nexus Mods page.</p>
		<p class="mt-2" in:fade={{ delay: 2000 }}>Need help making mods? There's extensive documentation available in the Info folder.</p>
		<div class="mt-4 bg-neutral-900 rounded-md p-4" in:fade={{ delay: 2400 }}>
			{#await latestGithubRelease}
				<div class="flex items-center">
					<p class="flex-grow">Checking for framework updates...</p>
					<div>
						<InlineLoading />
					</div>
				</div>
			{:then release}
				{#if semver.lt(FrameworkVersion, release.tag_name)}
					<div class="flex items-center">
						<h3 class="flex-grow">
							{({ patch: "Framework patch available", minor: "Minor framework update available", major: "Major framework update available" })[
								semver.diff(FrameworkVersion, release.tag_name)
							] || "Update available"}
						</h3>
						<p>{FrameworkVersion} → {release.tag_name}</p>
					</div>
					<hr class="bg-gray-500 border-none h-px" />
					<div class="mt-2">
						{@html githubReleaseMarkdownBody}
					</div>
					<br />
					<Button
						kind="primary"
						icon={Download}
						on:click={() => {
							updatingFramework = true

							startFrameworkUpdate()
						}}
					>
						Update
					</Button>
				{:else}
					<div class="flex items-center">
						<p class="flex-grow">Up to date (version {FrameworkVersion})</p>
						<Checkmark />
					</div>
				{/if}
			{:catch error}
				<div class="flex items-center">
					<p class="flex-grow">Couldn't check for framework updates</p>
					<div>
						<InlineLoading status="error" />
					</div>
				</div>
			{/await}
		</div>
		<div class="mt-4 bg-neutral-900 rounded-md p-4" in:fade={{ delay: 2800 }}>
			{#await modUpdates}
				<div class="flex items-center">
					<p class="flex-grow">Checking for mod updates...</p>
					<div>
						<InlineLoading />
					</div>
				</div>
			{:then updates}
				{#each updates.filter(([modID, update]) => !semver.lt(getManifestFromModID(modID).version, update.version)) as [modID, update] (modID)}
					<div class="flex items-center">
						<p class="flex-grow">{getManifestFromModID(modID).name} is up to date</p>
						<Checkmark />
					</div>
				{/each}
				{#each updates.filter(([modID, update]) => semver.lt(getManifestFromModID(modID).version, update.version)) as [modID, update] (modID)}
					<div class="my-4">
						<div class="flex items-center">
							<h3 class="flex-grow">
								{getManifestFromModID(modID).name}
							</h3>
							<p>{getManifestFromModID(modID).version} → {update.version}</p>
						</div>
						<hr class="bg-gray-500 border-none h-px" />
						<div class="mt-2">
							{@html window.sanitizeHtml(marked(update.changelog, { gfm: true }).replaceAll("Bugfixes", "Bug Fixes"))}
						</div>
						{#if canAutomaticallyUpdate}
							<br />
							<Button
								kind="primary"
								icon={Download}
								on:click={() => {
									updatingMod = {
										id: modID,
										...update
									}

									startModUpdate()
								}}
							>
								Update
							</Button>
						{/if}
					</div>
				{/each}
			{:catch error}
				<div class="flex items-center">
					<p class="flex-grow">Couldn't check for mod updates</p>
					<div>
						<InlineLoading status="error" />
					</div>
				</div>
			{/await}
		</div>
	</div>
	{#if !removeModDiagnosticsElemYet}
		<div in:fade out:fade={{ duration: 1000 }}>
			<div class="flex items-center gap-16">
				<h1 class="flex-grow">Running mod diagnostics - don't leave this page...</h1>
				<div>
					{#if !modDiagnosticsComplete}
						<InlineLoading />
					{:else}
						<InlineLoading status="finished" />
					{/if}
				</div>
			</div>
			<p>We're checking all the mods you have installed for possible issues. This shouldn't take too long.</p>
		</div>
	{/if}
</div>

<Modal alert bind:open={cannotFindConfig} modalHeading="Can't find config.json" primaryButtonText="OK" on:submit={() => (cannotFindConfig = false)}>
	<p>The framework wasn't installed correctly. Please re-read the installation instructions.</p>
</Modal>

<Modal alert bind:open={cannotFindRuntime} modalHeading="Can't find Runtime" primaryButtonText="OK" on:submit={() => (cannotFindRuntime = false)}>
	<p>The framework wasn't installed correctly. Please re-read the installation instructions.</p>
</Modal>

<Modal alert bind:open={cannotFindRetail} modalHeading="Can't find Retail" primaryButtonText="OK" on:submit={() => (cannotFindRetail = false)}>
	<p>The framework wasn't installed correctly. Please re-read the installation instructions.</p>
</Modal>

<Modal alert bind:open={cannotFindGameConfig} modalHeading="Can't find the game config" primaryButtonText="OK" on:submit={() => (cannotFindGameConfig = false)}>
	<p>The framework wasn't installed correctly. Please re-read the installation instructions.</p>
</Modal>

<Modal alert bind:open={cannotFindHITMAN3} modalHeading="Can't find HITMAN3.exe" primaryButtonText="OK" on:submit={() => (cannotFindHITMAN3 = false)}>
	<p>The framework wasn't installed correctly. Please re-read the installation instructions.</p>
</Modal>

<Modal alert bind:open={invalidModOpen} modalHeading="Invalid mod" primaryButtonText="OK" on:submit={() => (invalidModOpen = false)}>
	<p>The mod {invalidModText} is broken. Ensure it has all of the required keys in the manifest (see the documentation), and if that fails, contact Atampy26 on Hitman Forum.</p>
</Modal>

<Modal
	bind:open={errorReportingPrompt}
	modalHeading="Error and performance reporting"
	primaryButtonText="Yes"
	secondaryButtonText="No"
	on:click:button--secondary={() => {
		mergeConfig({
			reportErrors: false,
			errorReportingID: undefined
		})

		errorReportingPrompt = false
	}}
	on:submit={() => {
		mergeConfig({
			reportErrors: true,
			errorReportingID: v4()
		})

		errorReportingPrompt = false
	}}
>
	<p>
		Would you like to send anonymous performance and error reporting data to the internet to improve the framework?
		<br />
		This can be changed later in the information page.
		<br />
		<br />
		It is recommended you enable this; it helps with resolving problems and improving the framework's features.
	</p>
</Modal>

<Modal passiveModal open={updatingFramework} modalHeading="Updating the framework" preventCloseOnClickOutside>
	<div class="mb-2">
		{@html githubReleaseMarkdownBody}
	</div>
	<br />
	{#if !frameworkExtracting}
		<ProgressBar kind="inline" value={frameworkDownloadProgress} max={frameworkDownloadSize} labelText="Downloading..." />
	{:else}
		<p>Extracting files...</p>
	{/if}
</Modal>

<Modal passiveModal open={!!updatingMod} modalHeading={updatingMod ? "Updating " + getManifestFromModID(updatingMod.id).name : "Updating the mod"} preventCloseOnClickOutside>
	<div class="mb-2">{updatingMod?.changelog}</div>
	<br />
	{#if !modExtracting}
		<ProgressBar kind="inline" value={modDownloadProgress} max={modDownloadSize} labelText="Downloading..." />
	{:else}
		<p>Extracting files...</p>
	{/if}
</Modal>

<style>
	:global(h2) {
		margin-bottom: 0.25rem;
	}

	:global(li) {
		margin-bottom: 0.5rem;
	}

	:global(.bx--modal-close) {
		display: none;
	}
</style>
