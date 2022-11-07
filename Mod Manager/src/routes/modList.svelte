<script lang="ts">
	import { scale } from "svelte/transition"
	import { flip } from "svelte/animate"

	import SortableList from "svelte-sortable-list"
	import json5 from "json5"
	import { Button, Modal } from "carbon-components-svelte"

	import { getAllMods, getConfig, mergeConfig, getManifestFromModID, modIsFramework, getModFolder, sortMods } from "$lib/utils"
	import Mod from "$lib/Mod.svelte"
	import TextInputModal from "$lib/TextInputModal.svelte"
	import { goto } from "$app/navigation"

	import Add from "carbon-icons-svelte/lib/Add.svelte"
	import AddAlt from "carbon-icons-svelte/lib/AddAlt.svelte"
	import SubtractAlt from "carbon-icons-svelte/lib/SubtractAlt.svelte"
	import Rocket from "carbon-icons-svelte/lib/Rocket.svelte"
	import Settings from "carbon-icons-svelte/lib/Settings.svelte"
	import TrashCan from "carbon-icons-svelte/lib/TrashCan.svelte"
	import Close from "carbon-icons-svelte/lib/Close.svelte"
	import { OptionType } from "../../../src/types"

	let enabledMods: { value: string }[] = [],
		disabledMods: { value: string }[] = []

	let deleteModModalOpen = false
	let deleteModInProgress: string

	let forceModListsUpdate: number = Math.random()

	$: enabledMods = getConfig().loadOrder.map((a) => {
		return { value: a, dummy: forceModListsUpdate }
	})

	$: disabledMods = getAllMods()
		.filter((a) => !getConfig().loadOrder.includes(a))
		.map((a) => {
			return { value: a, dummy: forceModListsUpdate }
		})

	let changed = false

	let dependencyCycleModalOpen = false
	let frameworkDeployModalOpen = false
	let deployOutput = ""
	let deployFinished = false

	window.ipc.receive("frameworkDeployModalOpen", () => {
		frameworkDeployModalOpen = true
	})

	window.ipc.receive("frameworkDeployOutput", (output: string) => {
		deployOutput = output
		setTimeout(() => {
			document.getElementById("deployOutputCodeElement")?.scrollIntoView({
				behavior: "smooth",
				block: "end"
			})
		}, 100)
	})

	window.ipc.receive("frameworkDeployFinished", () => {
		deployFinished = true
	})

	let modNameInputModal: TextInputModal
	let modNameInputModalOpen = false

	let modChunkInputModal: TextInputModal
	let modChunkInputModalOpen = false

	let rpkgModExtractionInProgress = false
	let frameworkModExtractionInProgress = false

	let invalidFrameworkZipModalOpen = false

	let modFilePath = ""

	let rpkgModName: string
	let rpkgModChunk: string

	let frameworkModScriptsWarningOpen = false

	async function addMod() {
		window.ipc.send("modFileOpenDialog")

		window.ipc.receive("modFileOpenDialogResult", (modFilePopupResult: string[] | undefined) => {
			if (!modFilePopupResult) {
				return
			}

			modFilePath = modFilePopupResult[0]

			if (modFilePath.endsWith(".rpkg")) {
				modNameInputModalOpen = true
			} else {
				window.fs.emptyDirSync("./staging")

				new window.AdmZip(modFilePath).extractAllTo("./staging")

				if (window.fs.readdirSync("./staging").length == 1 && window.fs.readdirSync("./staging").every((a) => a.endsWith(".rpkg"))) {
					modFilePath = window.path.resolve(window.path.join("./staging", window.fs.readdirSync("./staging")[0]))
					modNameInputModalOpen = true
				} else {
					// framework mod

					frameworkModExtractionInProgress = true

					if (window.klaw("./staging", { depthLimit: 0, nodir: true }).length) {
						frameworkModExtractionInProgress = false
						invalidFrameworkZipModalOpen = true
						return
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
						frameworkModExtractionInProgress = false

						frameworkModScriptsWarningOpen = true
					} else {
						window.fs.copySync("./staging", "../Mods")

						window.fs.removeSync("./staging")

						window.location.reload()

						frameworkModExtractionInProgress = false
					}
				}
			}
		})
	}

	async function installRPKGMod() {
		rpkgModExtractionInProgress = true

		window.fs.ensureDirSync(window.path.join("..", "Mods", rpkgModName, rpkgModChunk))
		window.fs.copyFileSync(modFilePath, window.path.join("..", "Mods", rpkgModName, rpkgModChunk, window.path.basename(modFilePath)))

		window.fs.removeSync("./staging")

		window.location.reload()

		rpkgModExtractionInProgress = false
	}
</script>

<div class="grid grid-cols-2 gap-4 w-full mb-16">
	<div class="w-full">
		<div class="flex gap-4 items-center justify-center" transition:scale>
			<h1 class="flex-grow">Available Mods</h1>
			<Button
				kind="primary"
				icon={Add}
				on:click={() => {
					addMod()
				}}
			>
				Add a Mod
			</Button>
		</div>
		<br />
		<div class="h-[90vh] overflow-y-auto">
			{#each disabledMods as item (item.value)}
				<div animate:flip={{ duration: 300 }}>
					<div transition:scale>
						<Mod
							isFrameworkMod={modIsFramework(item.value)}
							manifest={modIsFramework(item.value) ? getManifestFromModID(item.value) : undefined}
							rpkgModName={!modIsFramework(item.value) ? item.value : undefined}
						>
							<Button
								kind="primary"
								icon={AddAlt}
								on:click={() => {
									mergeConfig({
										loadOrder: [...getConfig().loadOrder, item.value]
									})
									forceModListsUpdate = Math.random()
								}}
							>
								Enable
							</Button>
							<Button
								kind="danger"
								icon={TrashCan}
								on:click={() => {
									deleteModInProgress = item.value
									deleteModModalOpen = true
								}}
							>
								Delete
							</Button>
						</Mod>
					</div>
					<br />
				</div>
			{/each}
		</div>
	</div>
	<div class="w-full">
		<div class="flex gap-4 items-center justify-center" transition:scale>
			<h1 class="flex-grow">{changed && !deployFinished ? "To Be Applied" : "Enabled Mods"}</h1>
			<Button
				kind="primary"
				style={changed && !deployFinished ? "background-color: green" : ""}
				icon={Rocket}
				on:click={() => {
					if (sortMods()) {
						deployOutput = ""
						deployFinished = false
						window.ipc.send("deploy")
					} else {
						dependencyCycleModalOpen = true
					}
				}}
			>
				Apply
			</Button>
		</div>
		<br />
		<div class="h-[90vh] overflow-y-auto">
			<SortableList
				list={enabledMods}
				key="value"
				on:sort={(event) => {
					mergeConfig({
						loadOrder: event.detail.map((a) => a.value)
					})
					forceModListsUpdate = Math.random()
					changed = true
				}}
				let:item
			>
				<div class="cursor-grab">
					<Mod
						isFrameworkMod={modIsFramework(item.value)}
						manifest={modIsFramework(item.value) ? getManifestFromModID(item.value) : undefined}
						rpkgModName={!modIsFramework(item.value) ? item.value : undefined}
					>
						{#if modIsFramework(item.value) && getManifestFromModID(item.value)?.options?.filter(a=>a.type != OptionType.conditional)?.length}
							<Button
								kind="ghost"
								icon={Settings}
								iconDescription="Adjust this mod's settings"
								on:click={() => {
									goto(`/settings?mod=${getManifestFromModID(item.value).id}`)
								}}
							/>
						{/if}
						<Button
							kind="danger"
							icon={SubtractAlt}
							on:click={() => {
								mergeConfig({
									loadOrder: getConfig().loadOrder.filter((a) => a != item.value)
								})
								forceModListsUpdate = Math.random()
							}}
						>
							Disable
						</Button>
					</Mod>
					<br />
				</div>
			</SortableList>
		</div>
	</div>
</div>

<Modal
	danger
	bind:open={deleteModModalOpen}
	modalHeading="Delete mod"
	primaryButtonText="Delete the mod"
	secondaryButtonText="Cancel"
	on:click:button--secondary={() => (deleteModModalOpen = false)}
	on:submit={() => {
		window.fs.removeSync(getModFolder(deleteModInProgress))
		deleteModModalOpen = false
		window.location.reload()
	}}
	shouldSubmitOnEnter={false}
>
	<p>
		{#if deleteModInProgress}
			Are you sure you want to permanently remove the <i>{modIsFramework(deleteModInProgress) ? getManifestFromModID(deleteModInProgress).name : deleteModInProgress}</i>
			mod from the Mods folder? You cannot undo this.
		{/if}
	</p>
</Modal>

<Modal alert bind:open={dependencyCycleModalOpen} modalHeading="Dependency cycle (couldn't sort mods)" primaryButtonText="OK" shouldSubmitOnEnter={false}>
	<p>The framework couldn't sort your mods! Ask the developer of whichever mod you most recently installed to investigate this. Also, report this to Atampy26 on Hitman Forum or Discord.</p>
</Modal>

<Modal passiveModal open={frameworkDeployModalOpen} modalHeading="Applying your mods" preventCloseOnClickOutside>
	Your mods are being deployed. This may take a while - grab a coffee or something.
	<br />
	<pre class="mt-2 h-[10vh] overflow-y-auto whitespace-pre-wrap">
		<code class="block -mt-4" id="deployOutputCodeElement">{deployOutput}</code>
	</pre>

	{#if deployFinished}
		<br />
		<div class="flex gap-4 items-center">
			{#if deployOutput.includes("Deployed all mods successfully.")}
				<Button kind="primary" icon={Close} on:click={() => (frameworkDeployModalOpen = false)}>Close</Button>
				<span class="text-green-300">Deploy successful</span>
			{:else}
				<Button kind="primary" icon={Close} on:click={() => (frameworkDeployModalOpen = false)}>Close</Button>
				<span class="text-red-300">Deploy unsuccessful</span>
			{/if}
		</div>
	{/if}
</Modal>

<TextInputModal
	bind:this={modNameInputModal}
	showingModal={modNameInputModalOpen}
	modalText="Mod name"
	modalPlaceholder="Amazing RPKG Mod"
	on:close={() => {
		rpkgModName = modNameInputModal.value

		try {
			var result = [...modFilePath.matchAll(/(chunk[0-9]*(?:patch.*)?)\.rpkg/g)]
			result = [...result[result.length - 1][result[result.length - 1].length - 1].matchAll(/(chunk[0-9]*)/g)]
			rpkgModChunk = result[result.length - 1][result[result.length - 1].length - 1]

			if (!rpkgModChunk) {
				throw new Error()
			}

			installRPKGMod()
		} catch {
			modChunkInputModalOpen = true
		}
	}}
/>

<TextInputModal
	bind:this={modChunkInputModal}
	showingModal={modChunkInputModalOpen}
	modalText="Mod chunk (if it advises you to name it chunk0patch3 or the file is named chunk0patchX, for example, then it's chunk0)"
	modalPlaceholder="chunk0"
	on:close={() => {
		rpkgModChunk = modChunkInputModal.value

		installRPKGMod()
	}}
/>

<Modal passiveModal open={rpkgModExtractionInProgress} modalHeading="Installing {rpkgModName}" preventCloseOnClickOutside>The mod is being installed - please wait.</Modal>

<Modal passiveModal open={frameworkModExtractionInProgress} modalHeading="Installing the mod" preventCloseOnClickOutside>The mod is being installed - please wait.</Modal>

<Modal alert bind:open={invalidFrameworkZipModalOpen} modalHeading="Invalid framework ZIP" primaryButtonText="OK" shouldSubmitOnEnter={false}>
	<p>The framework ZIP file contains files in the root directory. Contact the mod author.</p>
</Modal>

<Modal
	danger
	bind:open={frameworkModScriptsWarningOpen}
	modalHeading="Mod contains scripts"
	primaryButtonText="I'm sure"
	secondaryButtonText="Cancel"
	shouldSubmitOnEnter={false}
	on:click:button--secondary={() => (frameworkModScriptsWarningOpen = false)}
	on:click:button--primary={() => {
		window.fs.copySync("./staging", "../Mods")

		window.fs.removeSync("./staging")

		window.location.reload()
	}}
>
	<p>
		This mod contains scripts; that means it effectively has full control over your PC whenever you apply your mods. Scripts can do cool things and make a lot of mods possible, but they can also
		do bad things like installing malware on your computer. Make sure you trust whoever developed this mod, and wherever you downloaded it from. Are you sure you want to add this mod?
	</p>
</Modal>

<style>
	:global(.bx--btn--ghost) {
		color: inherit;
		@apply bg-neutral-800;
	}

	:global(.bx--btn--ghost:hover, .bx--btn--ghost:active) {
		color: inherit;
	}

	/* Remove the weird spacing; it's created by the border, which can't be seen due to the dark background */
	:global(li) {
		border: inherit !important;
		transition: inherit !important;
	}

	:global(.over) {
		border-color: inherit !important;
	}

	:global(.bx--modal-close) {
		display: none;
	}
</style>
