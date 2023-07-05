<script lang="ts">
	import { fade } from "svelte/transition"
	import { page } from "$app/stores"

	import { Button, InlineLoading, Modal, ProgressBar } from "carbon-components-svelte"

	import { getAllMods, getConfig, getManifestFromModID, modIsFramework, getModFolder, mergeConfig, FrameworkVersion } from "$lib/utils"

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
	import Asterisk from "carbon-icons-svelte/lib/Asterisk.svelte"

	let cannotFindConfig = false
	let cannotFindRuntime = false
	let cannotFindRetail = false
	let cannotFindGameConfig = false
	let cannotFindHITMAN3 = false
	let errorReportingPrompt = false
	let developerModePrompt = false

	let invalidModOpen = false
	let invalidModText = ""

	let fileInModFolder = false

	let mustRedownloadFrameworkModalOpen = false

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
			if (window.fs.existsSync(window.path.join(window.path.resolve("..", getConfig().retailPath), "Runtime", "chunk0.rpkg")) && getConfig().runtimePath == "..\\Runtime") {
				mergeConfig({
					runtimePath: "..\\Retail\\Runtime"
				})
				window.fs.copyFileSync(window.path.join("..", "cleanMicrosoftThumbs.dat"), window.path.join("..", "cleanThumbs.dat"))
			} else {
				cannotFindRuntime = true
			}
		} else {
			if (!window.fs.existsSync(window.path.resolve("..", getConfig().retailPath))) {
				cannotFindRetail = true
			} else {
				if (
					!window.fs.existsSync(window.path.join(window.path.resolve("..", getConfig().retailPath), "Runtime", "chunk0.rpkg")) &&
					!window.fs.existsSync(window.path.join(window.path.resolve("..", getConfig().retailPath), "HITMAN3.exe"))
				) {
					cannotFindHITMAN3 = true
				}

				if (
					window.fs.existsSync(window.path.join(window.path.resolve("..", getConfig().retailPath), "Runtime", "chunk0.rpkg")) &&
					!window.fs.existsSync(window.path.join(window.path.resolve("..", getConfig().retailPath), "..", "MicrosoftGame.Config"))
				) {
					cannotFindGameConfig = true
				}
			}
		}
	}

	if (!cannotFindConfig && !cannotFindRuntime && !cannotFindRetail && !cannotFindGameConfig && !cannotFindHITMAN3) {
		if (typeof getConfig().knownMods == "undefined") {
			mergeConfig({ knownMods: [] })
		}

		if (typeof getConfig().reportErrors == "undefined") {
			errorReportingPrompt = true
		}

		if (typeof getConfig().developerMode == "undefined") {
			developerModePrompt = true
		}
	}

	if (
		window.fs
			.readdirSync(window.path.join("..", "Mods"))
			.filter((a) => a != "Managed by SMF, do not touch")
			.map((a) => window.path.resolve(window.path.join("..", "Mods", a)))
			.some((a) => window.isFile(a))
	) {
		fileInModFolder = true
	}

	if (!fileInModFolder) {
		try {
			getAllMods().map((a) => (modIsFramework(a) ? getManifestFromModID(a) : a))
		} catch {
			invalidModText =
				window.fs
					.readdirSync(window.path.join("..", "Mods"))
					.filter((a) => a != "Managed by SMF, do not touch")
					.map((a) => window.path.resolve(window.path.join("..", "Mods", a)))
					.find((a) => window.fs.existsSync(window.path.join(a, "manifest.json")) && !json5.parse(window.fs.readFileSync(window.path.join(a, "manifest.json"), "utf8")).id)
					?.split(window.path.sep)
					?.pop() || "<can't find which one>"
			invalidModOpen = true
		}
	}

	let installedViaZIP = false
	if (window.originalFs.existsSync("../config.json:Zone.Identifier")) {
		installedViaZIP = true
		window.originalFs.unlinkSync("../config.json:Zone.Identifier")
	}

	if (!window.nodeVersion.startsWith("18")) {
		mustRedownloadFrameworkModalOpen = true
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

		const releases = await (
			await fetch("https://api.github.com/repos/atampy25/simple-mod-framework/releases", {
				headers: {
					Accept: "application/vnd.github.v3+json"
				}
			})
		).json()

		if (semver.lt(FrameworkVersion, release.tag_name)) {
			const allNewReleases = releases.filter((a) => semver.lt(FrameworkVersion, a.tag_name)).map((a) => a.body)
			allNewReleases.reverse()

			const sections: Record<string, string[]> = { "": [] }
			let currentSection = ""
			for (const item of allNewReleases) {
				for (const line of item.split("\n")) {
					if (line.trim() !== "") {
						if (line.trim().startsWith("##")) {
							sections[line.trim()] ??= []
							currentSection = line.trim()
						} else {
							sections[currentSection].push(line.trim())
						}
					}
				}
			}

			githubReleaseMarkdownBody = marked(
				Object.entries(sections)
					.map(([a, b]) => a + "\n" + b.join("\n"))
					.join("\n"),
				{ gfm: true }
			)

			canAutomaticallyUpdate = !githubReleaseMarkdownBody.includes("CANNOT AUTOMATICALLY UPDATE")
		}

		return { release, releases }
	}

	let canAutomaticallyUpdate = false
	let updatingFramework = false
	let frameworkDownloadProgress = 0
	let frameworkDownloadSize = 0
	let frameworkExtracting = false

	async function startFrameworkUpdate() {
		let chunksAll

		try {
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

			chunksAll = new Uint8Array(receivedLength)
			let position = 0
			for (let chunk of chunks) {
				chunksAll.set(chunk, position)
				position += chunk.length
			}
		} catch (e) {
			window.alert("Couldn't download the update! Check your internet connection.\n\n" + e)
			updatingFramework = false
			return
		}

		try {
			frameworkExtracting = true

			window.fs.emptyDirSync("./staging")

			window.fs.writeFileSync("./tempArchive", chunksAll)

			window.child_process.execSync(`"..\\Third-Party\\7z.exe" x "./tempArchive" -aoa -y -o"./staging"`)

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
		} catch (e) {
			window.alert("Couldn't extract the update! You may want to report this to Atampy26 on Hitman Forum.\n\n" + e)
			updatingFramework = false
			return
		}

		try {
			window.fs.removeSync("../Load Order Manager")

			window.originalFs.renameSync("./staging/Mod Manager/resources/app.asar", "./temp.asar")
			window.originalFs.cpSync("./staging", "..", { recursive: true })
			window.originalFs.copyFileSync("./temp.asar", "./resources/app.asar")

			window.fs.removeSync("./staging")
			window.fs.removeSync("./tempArchive")
			window.fs.removeSync("./temp.asar")
		} catch (e) {
			window.alert("Couldn't apply the update! You may want to report this to Atampy26 on Hitman Forum.\n\n" + e)
			updatingFramework = false
			return
		}

		updatingFramework = false

		window.ipc.send("relaunchApp")
	}

	let modUpdates = checkForModUpdates()

	async function checkForModUpdates(): Promise<[string, { version: string; changelog: string; url: string; check_url: string } | false][]> {
		let modUpdateJSONs = []

		for (let mod of getAllMods()) {
			if (modIsFramework(mod) && getManifestFromModID(mod).updateCheck) {
				try {
					const updateJSON = await (await fetch(getManifestFromModID(mod).updateCheck! + "?t=" + Date.now())).json()

					let changelog = updateJSON.changelog

					if (getManifestFromModID(mod).updateCheck!.match("https://github.com/(.*)/releases/latest/download/updates.json")) {
						// GitHub based mod, we can check its previous releases

						const releases = await (
							await fetch(`https://api.github.com/repos/${getManifestFromModID(mod).updateCheck!.match("https://github.com/(.*)/releases/latest/download/updates.json")[1]}/releases`, {
								headers: {
									Accept: "application/vnd.github.v3+json"
								}
							})
						).json()

						const allNewReleases = releases.filter((a) => semver.lt(getManifestFromModID(mod).version, a.tag_name)).map((a) => a.body)
						allNewReleases.reverse()

						const sections: Record<string, string[]> = { "": [] }
						let currentSection = ""
						for (const item of allNewReleases) {
							for (const line of item.split("\n")) {
								if (line.trim() !== "" && !line.includes("hitman-resources.netlify.app/smf-install-link")) {
									if (line.trim().startsWith("##")) {
										sections[line.trim()] ??= []
										currentSection = line.trim()
									} else {
										sections[currentSection].push(line.trim())
									}
								}
							}
						}

						changelog = Object.entries(sections)
							.map(([a, b]) => a + "\n" + b.join("\n"))
							.join("\n")
					}

					if (!changelog) {
						throw new Error()
					}

					if (!updateJSON.url) {
						throw new Error()
					}

					if (!semver.valid(updateJSON.version, { loose: false })) {
						throw new Error()
					}

					modUpdateJSONs.push([mod, { ...updateJSON, changelog, check_url: getManifestFromModID(mod).updateCheck! }])
				} catch {
					modUpdateJSONs.push([mod, false])
				}
			}
		}

		return modUpdateJSONs
	}

	let updatingMod: {
		id: string
		version: string
		url: string
		changelog: string
	} | null = null
	let modDownloadProgress = 0
	let modDownloadSize = 0
	let modExtracting = false

	async function startModUpdate() {
		let chunksAll

		try {
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

			chunksAll = new Uint8Array(receivedLength)
			let position = 0
			for (let chunk of chunks) {
				chunksAll.set(chunk, position)
				position += chunk.length
			}
		} catch (e) {
			window.alert("Couldn't download the mod update! Check your internet connection, or contact the mod author for help.\n\n" + e)
			updatingMod = null
			return
		}

		try {
			modExtracting = true

			window.fs.emptyDirSync("./staging")

			window.fs.writeFileSync("./tempArchive", chunksAll)

			window.child_process.execSync(`"..\\Third-Party\\7z.exe" x "./tempArchive" -aoa -y -o"./staging"`)

			if (window.klaw("./staging", { depthLimit: 0, nodir: true }).length) {
				window.alert("Error: mod update ZIP has files in the root!")
				throw new Error("Mod update ZIP has files in the root!")
			}

			if (
				window.fs
					.readdirSync("./staging")
					.some(
						(a) =>
							json5.parse(window.fs.readFileSync(window.path.join("./staging", a, "manifest.json"), "utf8")).scripts ||
							json5.parse(window.fs.readFileSync(window.path.join("./staging", a, "manifest.json"), "utf8")).options?.some((b) => b.scripts)
					)
			) {
				updatingModScriptsWarningOpen = true
			} else {
				window.fs.removeSync(getModFolder(updatingMod!.id))

				window.fs.copySync("./staging", "../Mods")

				window.fs.removeSync("./staging")
				window.fs.removeSync("./tempArchive")
			}
		} catch (e) {
			window.alert("Couldn't extract and apply the mod update! Contact the mod author for help.\n\n" + e)
			updatingMod = null
			return
		}

		updatingMod = null

		window.location.reload()
	}

	let updatingModScriptsWarningOpen = false

	const trustedHosts = new Set(["github.com", "raw.githubusercontent.com", "dropbox.com", "dl.dropboxusercontent.com", "drive.google.com", "hitman-resources.netlify.app"])
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
		{#if getConfig().developerMode}
			<div class="inline" in:fade={{ delay: 800 }}>
				<Button kind="primary" icon={Edit} href="/authoring" sveltekit:reload>Author mods</Button>
			</div>
		{/if}
		<div class="inline" in:fade={{ delay: getConfig().developerMode ? 1200 : 800 }}>
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
			{:then { release, releases }}
				{#if semver.lt(FrameworkVersion, release.tag_name)}
					<div class="flex items-center">
						<h3 class="flex-grow">
							{{ patch: "Patch update available", minor: "Feature update available", major: "Major update available" }[semver.diff(FrameworkVersion, release.tag_name)] ||
								"Update available"}
						</h3>
						<p>{FrameworkVersion} → {release.tag_name}</p>
					</div>
					<hr class="bg-gray-500 border-none h-px" />
					<div class="mt-2">
						{@html githubReleaseMarkdownBody}
					</div>
					<br />
					{#if canAutomaticallyUpdate}
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
					{/if}
				{:else}
					<div class="flex items-center">
						<p class="flex-grow">The framework is up to date (version {FrameworkVersion})</p>
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
				{@const upToDateMods = updates.filter(([modID, update]) => update && !semver.lt(getManifestFromModID(modID).version, update.version))}

				{#each updates.filter(([modID, update]) => !update) as [modID, update] (modID)}
					<div class="flex items-center">
						<p class="flex-grow">Couldn't check {getManifestFromModID(modID).name} for updates</p>
						<div>
							<InlineLoading status="error" />
						</div>
					</div>
				{/each}
				{#each updates.filter(([modID, update]) => update && (!(trustedHosts.has(new URL(update.check_url).hostname) || new URL(update.check_url).hostname
								.split(".")
								.slice(1)
								.join(".") === "github.io") || !(trustedHosts.has(new URL(update.url).hostname) || new URL(update.url).hostname
									.split(".")
									.slice(1)
									.join(".") === "github.io"))) as [modID, update]}
					<div class="flex items-center">
						<p class="flex-grow">The author of {getManifestFromModID(modID).name} may be able to find which IPs have their mod downloaded</p>
						<Asterisk />
					</div>
				{/each}
				{#each updates.filter(([modID, update]) => update && Object.keys(update).length !== 4) as [modID, update]}
					<div class="flex items-center">
						<p class="flex-grow">{getManifestFromModID(modID).name} has an unused update key</p>
						<Asterisk />
					</div>
				{/each}
				{#if upToDateMods.length < 6}
					{#each upToDateMods as [modID, update] (modID)}
						<div class="flex items-center">
							<p class="flex-grow">{getManifestFromModID(modID).name} is up to date</p>
							<Checkmark />
						</div>
					{/each}
				{:else}
					<div class="flex items-center">
						<p class="flex-grow">{upToDateMods.length != updates.length ? upToDateMods.length : "All"} mods are up to date</p>
						<Checkmark />
					</div>
				{/if}
				{#each updates.filter(([modID, update]) => update && semver.lt(getManifestFromModID(modID).version, update.version)) as [modID, update] (modID)}
					<div class="my-4">
						<div class="flex items-center">
							<h3 class="flex-grow">
								{getManifestFromModID(modID).name}
							</h3>
							<p>{getManifestFromModID(modID).version} → {update.version}</p>
						</div>
						<hr class="bg-gray-500 border-none h-px" />
						<div class="mt-2">
							{@html window.sanitizeHtml(marked(update.changelog, { gfm: true }))}
						</div>
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

<Modal alert bind:open={fileInModFolder} modalHeading="File in Mods folder" primaryButtonText="OK" on:submit={() => (fileInModFolder = false)}>
	<p>
		There's a file in the Mods folder. You should be using the Add a Mod button in the mod manager to manage your mods - not doing so exposes you to several risks, including your computer's
		security.
	</p>
</Modal>

<Modal alert bind:open={mustRedownloadFrameworkModalOpen} modalHeading="Reinstall the framework" primaryButtonText="OK" on:submit={() => (mustRedownloadFrameworkModalOpen = false)}>
	<p>
		The framework needs to be reinstalled due to a change in its internals which can't be automatically updated. Please download the Release.zip file from
		<code>https://github.com/atampy25/simple-mod-framework/releases/latest</code>
		and extract it over the existing framework files, overwriting everything except for config.json.
	</p>
</Modal>

<Modal alert bind:open={invalidModOpen} modalHeading="Invalid mod" primaryButtonText="OK" on:submit={() => (invalidModOpen = false)}>
	<p>The mod {invalidModText} is broken. Ensure it has all of the required keys in the manifest (see the documentation), and if that fails, contact Atampy26 on Hitman Forum.</p>
</Modal>

<Modal alert bind:open={installedViaZIP} modalHeading="Installed via alternate means" primaryButtonText="OK" on:submit={() => (installedViaZIP = false)}>
	<p>
		The framework has been installed via alternate means (likely by extracting a ZIP file). This could be because you installed the framework before the installer EXE existed (in which case you
		can safely ignore this warning), because you manually updated the framework (which is also OK, though the auto-updater is more convenient when possible), or because you deliberately downloaded
		a ZIP file version from a site other than Nexus Mods. In that case, while it might not affect the functioning of the framework, it's still best to use the officially supported installer
		available on Nexus Mods.
	</p>
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

<Modal
	bind:open={developerModePrompt}
	modalHeading="Developer mode"
	primaryButtonText="I'm a mod developer"
	secondaryButtonText="I'm a mod user"
	on:click:button--secondary={() => {
		mergeConfig({
			developerMode: false
		})

		developerModePrompt = false
	}}
	on:submit={() => {
		mergeConfig({
			developerMode: true
		})

		developerModePrompt = false
	}}
>
	<p>
		Would you like to enable developer mode? Developer mode improves the experience if you're planning on creating mods; otherwise, you can leave it disabled.
		<br />
		This can be changed later in the information page.
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
	<div class="mb-2">
		{#if updatingMod}{@html window.sanitizeHtml(marked(updatingMod.changelog, { gfm: true }))}{/if}
	</div>
	<br />
	{#if !modExtracting}
		<ProgressBar kind="inline" value={modDownloadProgress} max={modDownloadSize} labelText="Downloading..." />
	{:else}
		<p>Extracting files...</p>
	{/if}
</Modal>

<Modal
	danger
	bind:open={updatingModScriptsWarningOpen}
	modalHeading="Mod now contains scripts"
	primaryButtonText="I'm sure"
	secondaryButtonText="Cancel"
	shouldSubmitOnEnter={false}
	on:click:button--secondary={() => {
		updatingMod = null
		updatingModScriptsWarningOpen = false
	}}
	on:click:button--primary={() => {
		window.fs.removeSync(getModFolder(updatingMod.id))

		window.fs.copySync("./staging", "../Mods")

		window.fs.removeSync("./staging")
		window.fs.removeSync("./tempArchive")

		updatingMod = null

		window.location.reload()
	}}
>
	<p>
		The mod you're updating has added scripts; that means it is able to execute its own (external to the framework) code whenever you apply your mods. Scripts can do cool things and make a lot of
		mods possible, but it's possible for them to cause problems, or even install malware (though the framework tries its best to avoid this). Make sure you trust whoever developed this mod, and
		wherever you downloaded it from. Are you sure you want to add this mod?
	</p>
</Modal>

<style>
	:global(h2) {
		font-size: 1.5rem;
		font-weight: 300;
		margin-bottom: 0.25rem;
	}

	:global(li) {
		margin-bottom: 0.5rem;
		list-style-position: inside;
		list-style-type: disclosure-closed;
	}

	:global(.bx--modal-close) {
		display: none;
	}
</style>
