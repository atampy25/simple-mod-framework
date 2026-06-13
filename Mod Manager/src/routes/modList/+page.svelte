<script lang="ts">
	import { scale, fade } from "svelte/transition"
	import { flip } from "svelte/animate"

	import json5 from "json5"
	import { Button, CodeSnippet, InlineNotification, Modal, ProgressBar, Search } from "carbon-components-svelte"
	import AnsiToHTML from "ansi-to-html"
	import throttle from "lodash/throttle"

	const convertAnsi = new AnsiToHTML({
		newline: true,
		escapeXML: true,
		colors: {
			// Qualia by u/starlig-ht, slightly modified for background colour
			"0": "#101010",
			"1": "#EFA6A2",
			"2": "#80C990",
			"3": "#C8C874",
			"4": "#A3B8EF",
			"5": "#E6A3DC",
			"6": "#50CACD",
			"7": "#808080",
			"8": "#878787",
			"9": "#E0AF85",
			"10": "#5ACCAF",
			"11": "#C8C874",
			"12": "#CCACED",
			"13": "#F2A1C2",
			"14": "#74C3E4",
			"15": "#C0C0C0"
		},
		fg: "#f4f4f4",
		bg: "#262626"
	})

	import { getAllMods, getConfig, mergeConfig, getManifestFromModID, modIsFramework, getModFolder, sortMods, validateModFolder } from "$lib/utils"
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
	import CloudUpload from "carbon-icons-svelte/lib/CloudUpload.svelte"
	import Filter from "carbon-icons-svelte/lib/Filter.svelte"
	import { OptionType } from "../../../../src/types"
	import { page } from "$app/stores"
	import SortableList from "$lib/SortableList.svelte"

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
		.sort((a, b) => (modIsFramework(a) ? getManifestFromModID(a).name : a).localeCompare(modIsFramework(b) ? getManifestFromModID(b).name : b, undefined, { numeric: true, sensitivity: "base" }))
		.map((a) => {
			return { value: a, dummy: forceModListsUpdate }
		})

	let changed = false
	let showDropHint = false
	let dependencyCycleModalOpen = false
	let frameworkDeployModalOpen = false
	let deployOutput = ""
	let deployOutputBuffer = ""
	let deployFinished = false
	let ignoreScrollEvent = false
    let autoScrollDeployOutput = true
    let userHasScrolledDeployOutput = false
	let autoScrollNotifications = true
    let userHasScrolledNotifications = false
    let notifications = []
	let outputLines: string | any[] = []


	$: outputLines = deployOutput.split(/\r?\n/).filter(line => line.trim() !== '');
	$: if (outputLines.length > 0 && autoScrollDeployOutput) {
		requestAnimationFrame(() => {
			const outputElement = document.getElementById('deployOutputElement');
			if (outputElement) {
				outputElement.scrollTop = outputElement.scrollHeight;
			}
		});
	}
	$: { let combinedNotifications = [...warnings, ...errors];
        if (combinedNotifications.length !== notifications.length) {
            notifications = combinedNotifications;
            scrollToBottom('notificationElement');
        }
    }
    $: if (outputLines.length > 0 && autoScrollDeployOutput) {
        scrollToBottom('deployOutputElement');
    }
    $: if (notifications.length > 0 && autoScrollNotifications) {
        scrollToBottom('notificationElement');
    }

	const updateDeployOutput = throttle(() => {
		deployOutput += deployOutputBuffer;
		deployOutputBuffer = "";
		outputLines = deployOutput.split(/\r?\n/).filter(line => line.trim() !== '');

		if (!userHasScrolledDeployOutput) {
			scrollToBottom('deployOutputElement');
		}
	}, 150);

    function handleScroll(event: UIEvent & { currentTarget: EventTarget & HTMLDivElement }, elementId: string) {
        if (ignoreScrollEvent) {
            return;
        }

        const element = event.target;
        const nearBottom = element.scrollHeight - element.clientHeight <= element.scrollTop + 10; 
		// The VSC error is right, so do not add a non-null assertion for it. If you do, the user will not be able to scroll in the deploy and notification output anymore. - Knew

		if (elementId === 'deployOutputElement') {
			if (!nearBottom) {
				userHasScrolledDeployOutput = true;
				autoScrollDeployOutput = false;
			}
		} else if (elementId === 'notificationElement') {
			if (!nearBottom) {
				userHasScrolledNotifications = true;
				autoScrollNotifications = false;
			}
		}
    }

	function scrollToBottom(elementId: string) {
		requestAnimationFrame(() => {
			requestAnimationFrame(() => { // The double requestAnimationFrame is intentional!! Without it, there is a chance the output will stop scrolling when the user didn't request it. - Knew
				const element = document.getElementById(elementId);
				if (element) {
					element.scrollTop = element.scrollHeight;
				}
				setTimeout(() => ignoreScrollEvent = false, 100);
			});
		});
	}

    function enableAutoScrollDeployOutput() {
        autoScrollDeployOutput = true;
        userHasScrolledDeployOutput = false;
        scrollToBottom('deployOutputElement');
    }

    function enableAutoScrollNotifications() {
        autoScrollNotifications = true;
        userHasScrolledNotifications = false;
        scrollToBottom('notificationElement');
    }

    window.ipc.receive("frameworkDeployModalOpen", () => {
        frameworkDeployModalOpen = true
    })

	window.ipc.receive("frameworkDeployOutput", (output: string) => {
		ignoreScrollEvent = true;
		deployOutputBuffer += output + "\n";
		updateDeployOutput();
	});

	window.ipc.receive("frameworkDeployFinished", () => {
		deployFinished = true
	})

    let warnings: any[] = [];
    let errors: any[] = [];

    $: {
        let warningIndex = 1;
        let errorIndex = 1;
        warnings = [];
        errors = [];
        
        deployOutput.split(/\r?\n/).forEach(line => {
            if (line.match(/.*WARN.*?\t/)) {
                warnings.push({ message: line.replace(/.*WARN.*?\t/, ""), count: warningIndex++ });
            } else if (line.match(/.*ERROR.*?\t/)) {
                errors.push({ message: line.replace(/.*ERROR.*?\t/, ""), count: errorIndex++ });
            }
        });
    }

    $: totalWarnings = warnings.length;
    $: totalErrors = errors.length;
    $: totalNotifications = totalWarnings + totalErrors;

	document.addEventListener("drop", (event) => {
		event.preventDefault()
		event.stopPropagation()
		showDropHint = false
		let modFile: any = event.dataTransfer?.files[0]
		if (!modFile) return
		modFilePath = modFile.path
		addMod()
	})
	document.addEventListener("dragover", (event) => {
		event.preventDefault()
		event.stopPropagation()
	})
	document.addEventListener("dragenter", (event) => {
		if ((event.dataTransfer?.items?.length ?? 0) > 0 && event.dataTransfer?.items[0]?.kind === "file") showDropHint = true
	})
	document.addEventListener("dragleave", (event) => {
		if (event.relatedTarget == null) showDropHint = false
	})

	let modNameInputModal: TextInputModal
	let modNameInputModalOpen = false

	let rpkgModExtractionInProgress = false
	let frameworkModExtractionInProgress = false

	let invalidFrameworkZipModalOpen = false

	let invalidModModalOpen = false

	let invalidFrameworkModModalOpen = false
	let modValidationError = ""

	let modFilePath = ""

	let rpkgsToInstall: { path: string; chunk: string }[]
	let rpkgModName: string

	let frameworkModScriptsWarningOpen = false
	let frameworkModPeacockPluginsWarningOpen = false

	async function addMod() {
		if (modFilePath.endsWith(".rpkg")) {
			let chunk = "chunk0"
			
			let result = [...modFilePath.matchAll(/(chunk[0-9]*)/g)]
			if (result.length) {
				chunk = result[0][1]
			}

			rpkgsToInstall = [{ path: modFilePath, chunk }]

			modNameInputModalOpen = true
		} else {
			window.fs.emptyDirSync("./staging")

			window.child_process.execSync(`"..\\Third-Party\\7z.exe" x "${modFilePath}" -aoa -y -o"./staging"`)

			const stagingFileList = window.klaw("./staging", { nodir: true })

			if (window.fs.readdirSync("./staging").every((a) => window.fs.existsSync(window.path.join("./staging", a, "manifest.json")))) {
				// framework mod

				frameworkModExtractionInProgress = true

				if (window.klaw("./staging", { depthLimit: 0, nodir: true }).length) {
					frameworkModExtractionInProgress = false
					invalidFrameworkZipModalOpen = true
					return
				}

				try {
					window.fs.readdirSync("./staging").forEach((a) => json5.parse(window.fs.readFileSync(window.path.join("./staging", a, "manifest.json"), "utf8")))
				} catch {
					frameworkModExtractionInProgress = false
					invalidModModalOpen = true
					return
				}

				for (const modFolder of window.fs.readdirSync("./staging").map((a) => window.path.join("./staging", a))) {
					const modValidation = validateModFolder(modFolder)
					if (!modValidation[0]) {
						frameworkModExtractionInProgress = false
						invalidFrameworkModModalOpen = true
						modValidationError = modValidation[1]
						return
					}
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
					if (
						window.fs
							.readdirSync("./staging")
							.some(
								(a) =>
									json5.parse(window.fs.readFileSync(window.path.join("./staging", a, "manifest.json"), "utf8")).peacockPlugins ||
									json5.parse(window.fs.readFileSync(window.path.join("./staging", a, "manifest.json"), "utf8")).options?.some((b) => b.peacockPlugins)
							)
					) {
						frameworkModExtractionInProgress = false

						frameworkModPeacockPluginsWarningOpen = true
					} else {
						window.fs.copySync("./staging", "../Mods")

						mergeConfig({
							knownMods: [
								...getConfig().knownMods,
								json5.parse(window.fs.readFileSync(window.path.join("..", "Mods", window.fs.readdirSync("./staging")[0], "manifest.json"), "utf8")).id
							]
						})

						window.fs.removeSync("./staging")

						window.location.href = "/modList"

						frameworkModExtractionInProgress = false
					}
				}
			} else {
				rpkgsToInstall = []

				if (stagingFileList.some((a) => a.path.endsWith(".rpkg"))) {
					for (const file of stagingFileList.filter((a) => a.path.endsWith(".rpkg"))) {
						let chunk = "chunk0"

						let result = [...file.path.matchAll(/(chunk[0-9]*)/g)]
						if (result.length) {
							chunk = result[0][1]
						}

						rpkgsToInstall.push({ path: file.path, chunk })
					}
				} else {
					invalidModModalOpen = true
					return
				}

				modNameInputModalOpen = true
			}
		}
	}

	function openAddModDialog() {
		window.ipc.send("modFileOpenDialog")

		window.ipc.receive("modFileOpenDialogResult", (modFilePopupResult: string[] | undefined) => {
			if (!modFilePopupResult) {
				return
			}

			modFilePath = modFilePopupResult[0]

			addMod()
		})
	}

	async function installRPKGMod() {
		rpkgModExtractionInProgress = true

		for (const file of rpkgsToInstall) {
			window.fs.ensureDirSync(window.path.join("..", "Mods", rpkgModName, file.chunk))
			window.fs.copyFileSync(file.path, window.path.join("..", "Mods", rpkgModName, file.chunk, window.path.basename(file.path)))
		}

		mergeConfig({ knownMods: [...getConfig().knownMods, rpkgModName] })

		window.fs.removeSync("./staging")

		window.location.reload()

		rpkgModExtractionInProgress = false
	}

	let displayExtractedModsDialog = false
	const extractedMods: string[] = []

	if (!getConfig().developerMode) {
		// If no mods are known
		if (getConfig().knownMods.length == 0) {
			// Assume all mods are installed correctly
			mergeConfig({ knownMods: getAllMods() })
		}

		for (const mod of getAllMods()) {
			if (!getConfig().knownMods.includes(mod)) {
				extractedMods.push(getManifestFromModID(mod).name)
				displayExtractedModsDialog = true

				mergeConfig({ knownMods: [...getConfig().knownMods, mod] })
			}
		}
	}

	let uploadedLogURL = ""
	let uploadLogModalOpen = false
	let uploadLogFailedModalOpen = false

	let availableModFilter = ""
	let enabledModFilter = ""

	let autoInstallDownloading = false
	let autoInstallDownloadProgress = 0
	let autoInstallDownloadSize = 0
	let autoInstallModName = ""
	let autoInstallModalOpen = false

	$: if ($page.url.searchParams.get("urlScheme")) {
		;(async () => {
			let chunksAll

			try {
				autoInstallDownloading = true

				const response = await fetch($page.url.searchParams.get("urlScheme")!)
				const reader = response.body!.getReader()

				autoInstallDownloadSize = +response.headers.get("Content-Length")!

				let receivedLength = 0
				let chunks = []
				while (true) {
					const { done, value } = await reader.read()

					if (done) {
						break
					}

					chunks.push(value)
					receivedLength += value.length

					autoInstallDownloadProgress = receivedLength
				}

				chunksAll = new Uint8Array(receivedLength)
				let position = 0
				for (let chunk of chunks) {
					chunksAll.set(chunk, position)
					position += chunk.length
				}
			} catch (e) {
				window.alert("Couldn't download the mod! Check your internet connection, or contact the mod author for help.\n\n" + e)
				autoInstallDownloading = false
				return
			}

			window.fs.writeFileSync("./tempArchive", chunksAll)

			window.fs.emptyDirSync("./staging")
			window.child_process.execSync(`"..\\Third-Party\\7z.exe" x "./tempArchive" -aoa -y -o"./staging"`)

			autoInstallDownloading = false
			autoInstallModName = json5.parse(window.fs.readFileSync(window.path.join("./staging", window.fs.readdirSync("./staging")[0], "manifest.json"), "utf8")).name
			autoInstallModalOpen = true
		})()
	}
</script>

<div class="grid grid-cols-2 gap-4 w-full mb-16">
	<div class="w-full">
		<div class="flex gap-4 items-center justify-center" transition:scale>
			<h1 class="flex-grow">Available Mods</h1>
			<div>
				<Search icon={Filter} placeholder="Filter available mods" bind:value={availableModFilter} />
			</div>
			<Button
				kind="primary"
				icon={Add}
				on:click={() => {
					openAddModDialog()
				}}
			>
				Add a Mod
			</Button>
		</div>
		<br />
		<div class="h-[90vh] overflow-y-auto">
			{#each disabledMods.filter((a) => ((modIsFramework(a.value) ? getManifestFromModID(a.value).name : a.value) + (modIsFramework(a.value) ? getManifestFromModID(a.value).description : ""))
					.toLowerCase()
					.includes(availableModFilter.toLowerCase())) as item (item.value)}
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
									changed = true
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
			<div>
				<Search icon={Filter} placeholder="Filter enabled mods" bind:value={enabledModFilter} />
			</div>
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
						darken={!((modIsFramework(item.value) ? getManifestFromModID(item.value).name : item.value) + (modIsFramework(item.value) ? getManifestFromModID(item.value).description : ""))
							.toLowerCase()
							.includes(enabledModFilter.toLowerCase())}
					>
						{#if modIsFramework(item.value) && getManifestFromModID(item.value)?.options?.filter((a) => a.type != OptionType.conditional)?.length}
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
								changed = true
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

{#if showDropHint}
	<div transition:fade={{ duration: 100 }} class="w-screen h-screen absolute top-0 left-0 bg-black/90 flex flex-col gap-4 justify-center items-center">
		<h1 class="font-bold">Drop to install</h1>
	</div>
{/if}

<Modal
	danger
	bind:open={deleteModModalOpen}
	modalHeading="Delete mod"
	primaryButtonText="Delete the mod"
	secondaryButtonText="Cancel"
	on:click:button--secondary={() => (deleteModModalOpen = false)}
	on:submit={() => {
		window.fs.removeSync(getModFolder(deleteModInProgress))
		mergeConfig({ knownMods: getConfig().knownMods.filter((a) => a != deleteModInProgress) })

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
    <div 
		id="deployOutputElement"
		class="mt-2 h-[40vh] overflow-y-auto bg-neutral-800 p-2"
        style="font-family: 'Fira Code', 'IBM Plex Mono', 'Menlo', 'DejaVu Sans Mono', 'Bitstream Vera Sans Mono', Courier, monospace; color-scheme: dark"
		on:scroll={(event) => handleScroll(event, 'deployOutputElement')}>

        {#each outputLines as line}
            <pre class="whitespace-pre-wrap break-words text-gray-600">{@html convertAnsi.toHtml(line)}</pre>
        {/each}

        {#if userHasScrolledDeployOutput}
            <button 
                class="absolute top-[288px] z-10 right-[37px] bg-gray-400 hover:bg-red-500 text-white py-1 px-3 rounded"
                on:click={enableAutoScrollDeployOutput}>
                <svg width="24px" height="24px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 9l8 8 8-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
        {/if}

    </div>
    {#if warnings.length > 0 || errors.length > 0}
        <br />
        <div id="notificationElement"
			class="flex flex-row gap-2 flex-wrap max-h-[25vh] h-[126px] overflow-y-auto relative" 
            on:scroll={(event) => handleScroll(event, 'notificationElement')}>

            {#each warnings as warning}
                <InlineNotification hideCloseButton lowContrast kind="warning">
                    <div slot="title" class="-mt-1 text-lg">Warning #{warning.count}</div>
                    <div slot="subtitle">{warning.message}</div>
                </InlineNotification>
            {/each}

            {#each errors as error}
                <InlineNotification hideCloseButton lowContrast kind="error">
                    <div slot="title" class="-mt-1 text-lg">Error #{error.count}</div>
                    <div slot="subtitle">{error.message}</div>
                </InlineNotification>
            {/each}

			{#if userHasScrolledNotifications}
				<button 
					class="fixed top-[479px] z-10 right-[38px] bg-gray-400 hover:bg-red-500 text-white py-1 px-3 rounded"
					on:click={enableAutoScrollNotifications}>
					<svg width="24px" height="24px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M4 9l8 8 8-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</button>
			{/if}

		</div>
	{/if}

	<div class="inline absolute right-5 text-right">
		{#if totalNotifications  > 0}
			<span class="inline-block bg-transparent text-yellow-400 px-2 py-1 rounded mr-2">
				<svg class="inline-block" width="20" height="20" viewBox="0 0 554.2 554.199" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
					<path d="M538.5,386.199L356.5,70.8c-16.4-28.4-46.7-45.9-79.501-45.9c-32.8,0-63.1,17.5-79.5,45.9L12.3,391.6
						c-16.4,28.4-16.4,63.4,0,91.8C28.7,511.8,59,529.3,91.8,529.3H462.2c0.101,0,0.2,0,0.2,0c50.7,0,91.8-41.101,91.8-91.8
						C554.2,418.5,548.4,400.8,538.5,386.199z M316.3,416.899c0,21.7-16.7,38.3-39.2,38.3s-39.2-16.6-39.2-38.3V416
						c0-21.601,16.7-38.301,39.2-38.301S316.3,394.3,316.3,416V416.899z M317.2,158.7L297.8,328.1c-1.3,12.2-9.4,19.8-20.7,19.8
						s-19.4-7.7-20.7-19.8L237,158.6c-1.3-13.1,5.801-23,18-23H299.1C311.3,135.7,318.5,145.6,317.2,158.7z"/>
				</svg>
				 {totalWarnings}
			</span>

			<span class="inline-block bg-transparent text-red-500 px-2 py-1 rounded">
				<svg class="inline-block" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
					<path fill-rule="evenodd" clip-rule="evenodd" d="M7.91 3.23 3.23 7.913v-.01a.81.81 0 0 0-.23.57v7.054c0 .22.08.42.23.57L7.9 20.77c.15.15.36.23.57.23h7.06c.22 0 .42-.08.57-.23l4.67-4.673a.81.81 0 0 0 .23-.57V8.473c0-.22-.08-.42-.23-.57L16.1 3.23a.81.81 0 0 0-.57-.23H8.48c-.22 0-.42.08-.57.23ZM12 7a1 1 0 0 1 1 1v5a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1Zm-1 9a1 1 0 0 1 1-1h.008a1 1 0 1 1 0 2H12a1 1 0 0 1-1-1Z"/>
				</svg>
				 {totalErrors}
			</span>
		{/if}
	</div>


	{#if deployFinished}
		<br />
		<div class="flex gap-4 items-center">
			{#if deployOutput
				.split(/\r?\n/)
				.map((a) => a.trim())
				.filter((a) => a.length)
				.at(-1)
				.match(/\tDone in .*/) && !deployOutput.split(/\r?\n/).some((a) => a.match(/.*WARN.*?\t/))}
				<Button  kind="primary" icon={Close} on:click={() => (frameworkDeployModalOpen = false)}>Close</Button>
				<span class="text-green-300">Deploy successful</span>
			{:else if deployOutput
				.split(/\r?\n/)
				.map((a) => a.trim())
				.filter((a) => a.length)
				.at(-1)
				.match(/\tDone in .*/) && deployOutput.split(/\r?\n/).some((a) => a.match(/.*WARN.*?\t/))}
				<Button kind="primary" icon={Close} on:click={() => (frameworkDeployModalOpen = false)}>Close</Button>
				<span class="text-yellow-300">Potential issues in deployment</span>
			{:else}
				<Button kind="primary" icon={Close} on:click={() => (frameworkDeployModalOpen = false)}>Close</Button>
				<Button
					kind="primary"
					icon={CloudUpload}
					on:click={async () => {
						const req = await fetch("http://hitman-resources.netlify.app/.netlify/functions/upload-smf-log", {
							method: "POST",
							headers: {
								"Content-Type": "application/json"
							},
							body: JSON.stringify({ content: "Config:\n" + JSON.stringify(getConfig()) + "\n\nDeploy log:\n" + deployOutput })
						})

						if (req.status == 200) {
							uploadedLogURL = await req.text()

							frameworkDeployModalOpen = false
							uploadLogModalOpen = true
						} else {
							uploadLogFailedModalOpen = true
						}
					}}
				>
					Upload mod list and log
				</Button>
				<span class="text-red-300">Deploy unsuccessful</span>
			{/if}
		</div>
	{/if}
</Modal>

<TextInputModal
	bind:this={modNameInputModal}
	bind:showingModal={modNameInputModalOpen}
	modalText="Mod name"
	modalPlaceholder="Amazing RPKG Mod"
	on:close={() => {
		modNameInputModalOpen = false

		rpkgModName = modNameInputModal.value

		if (!rpkgModName.match(/^(?!(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.[^.]*)?$)[^<>:"\/\\|?*\x00-\x1F]*[^<>:"\/\\|?*\x00-\x1F .]$/iu)) {
			window.alert("That's not a valid folder name and so cannot be used for an RPKG mod name. Please try another.")
			setTimeout(() => (modNameInputModalOpen = true), 100)
		} else {
			installRPKGMod()
		}
	}}
/>

<Modal passiveModal open={rpkgModExtractionInProgress} modalHeading="Installing {rpkgModName}" preventCloseOnClickOutside>The mod is being installed - please wait.</Modal>

<Modal passiveModal open={frameworkModExtractionInProgress} modalHeading="Installing the mod" preventCloseOnClickOutside>The mod is being installed - please wait.</Modal>

<Modal alert bind:open={invalidFrameworkZipModalOpen} modalHeading="Invalid framework ZIP" primaryButtonText="OK" shouldSubmitOnEnter={false} on:submit={() => (invalidFrameworkZipModalOpen = false)}>
	<p>The framework ZIP file contains files in the root directory. Contact the mod author.</p>
</Modal>

<Modal alert bind:open={invalidModModalOpen} modalHeading="Not a mod" primaryButtonText="OK" shouldSubmitOnEnter={false} on:submit={() => (invalidModModalOpen = false)}>
	<p>This doesn't look like a mod? Make sure you select a mod ZIP, and that the mod is either a framework mod or RPKG mod.</p>
</Modal>

<Modal alert bind:open={invalidFrameworkModModalOpen} modalHeading="Invalid mod" primaryButtonText="OK" shouldSubmitOnEnter={false} on:submit={() => (invalidFrameworkModModalOpen = false)}>
	<p>The mod you're trying to install is invalid. Contact the mod author.</p>
	<span class="mt-1 text-xs text-neutral-300">{modValidationError}</span>
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
		if (
			window.fs
				.readdirSync("./staging")
				.some(
					(a) =>
						json5.parse(window.fs.readFileSync(window.path.join("./staging", a, "manifest.json"), "utf8")).peacockPlugins ||
						json5.parse(window.fs.readFileSync(window.path.join("./staging", a, "manifest.json"), "utf8")).options?.some((b) => b.peacockPlugins)
				)
		) {
			frameworkModScriptsWarningOpen = false

			frameworkModPeacockPluginsWarningOpen = true
		} else {
			window.fs.copySync("./staging", "../Mods")

			mergeConfig({
				knownMods: [...getConfig().knownMods, json5.parse(window.fs.readFileSync(window.path.join("..", "Mods", window.fs.readdirSync("./staging")[0], "manifest.json"), "utf8")).id]
			})

			window.fs.removeSync("./staging")

			window.location.href = "/modList"
		}
	}}
>
	<p>
		This mod contains scripts; that means it is able to execute its own (external to the framework) code and effectively has complete control over your PC whenever you apply your mods. Scripts can
		do cool things and make a lot of mods possible, but they can also do bad things like installing malware on your computer. Make sure you trust whoever developed this mod, and wherever you
		downloaded it from. Are you sure you want to add this mod?
	</p>
</Modal>

<Modal
	danger
	bind:open={frameworkModPeacockPluginsWarningOpen}
	modalHeading="Mod contains Peacock plugins"
	primaryButtonText="I'm sure"
	secondaryButtonText="Cancel"
	shouldSubmitOnEnter={false}
	on:click:button--secondary={() => (frameworkModPeacockPluginsWarningOpen = false)}
	on:click:button--primary={() => {
		window.fs.copySync("./staging", "../Mods")

		mergeConfig({ knownMods: [...getConfig().knownMods, json5.parse(window.fs.readFileSync(window.path.join("..", "Mods", window.fs.readdirSync("./staging")[0], "manifest.json"), "utf8")).id] })

		window.fs.removeSync("./staging")

		window.location.href = "/modList"
	}}
>
	<p>
		This mod contains Peacock plugins; if you use the Peacock server emulator after applying this mod, the mod's plugins will have complete control over your PC. Make sure you trust whoever
		developed this mod, and wherever you downloaded it from. Are you sure you want to add this mod?
	</p>
</Modal>

<Modal
	alert
	bind:open={displayExtractedModsDialog}
	modalHeading="Incorrectly installed mod{extractedMods.length > 1 ? 's' : ''}"
	primaryButtonText="OK"
	shouldSubmitOnEnter={false}
	on:submit={() => (displayExtractedModsDialog = false)}
>
	<p>
		The mod{extractedMods.length > 1 ? "s" : ""}
		{extractedMods.slice(0, -1).length ? extractedMods.slice(0, -1).join(", ") + " and " + extractedMods[extractedMods.length - 1] : extractedMods[0]}
		{extractedMods.length > 1 ? "were" : "was"} installed by extracting the ZIP file directly to the Mods folder. That's not how you're meant to install mods; doing things this way could pose risks
		as it bypasses the framework's checks for mod validity and safety. Instead, use the Add a Mod button to add any mods you want. This message won't be shown again for {extractedMods.length > 1
			? "these mods"
			: "this mod"}.
		<br />
		<br />
		If you're seeing this after creating a new mod yourself, you should enable developer mode in the information page - it'll improve your experience and let you use the mod authoring tools in the
		Mod Manager.
	</p>
</Modal>

<Modal alert bind:open={uploadLogFailedModalOpen} modalHeading="Couldn't upload log" primaryButtonText="OK" shouldSubmitOnEnter={false} on:submit={() => (uploadLogFailedModalOpen = false)}>
	<p>Your log couldn't be uploaded. Make sure you're connected to the Internet.</p>
</Modal>

<Modal alert bind:open={uploadLogModalOpen} modalHeading="Log uploaded" primaryButtonText="OK" shouldSubmitOnEnter={false} on:submit={() => (uploadLogModalOpen = false)}>
	<p class="mb-2">Your deploy log has been anonymously uploaded to the Internet.</p>
	<CodeSnippet code={uploadedLogURL} />
	<br />
	<div class="mb-6" />
</Modal>

<Modal passiveModal open={autoInstallDownloading} modalHeading={"Downloading the mod"} preventCloseOnClickOutside>
	<div class="mb-2">The mod is currently being downloaded - please wait.</div>
	<br />
	<ProgressBar kind="inline" value={autoInstallDownloadProgress} max={autoInstallDownloadSize} labelText="Downloading..." />
</Modal>

<Modal
	bind:open={autoInstallModalOpen}
	modalHeading="Installing {autoInstallModName}"
	primaryButtonText="OK"
	secondaryButtonText="Cancel"
	shouldSubmitOnEnter={false}
	on:click:button--secondary={() => (autoInstallModalOpen = false)}
	on:click:button--primary={() => {
		autoInstallModalOpen = false
		modFilePath = "./tempArchive"
		addMod()
	}}
>
	<p>The mod {autoInstallModName} has been downloaded via a link - would you like to install it?</p>
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

	:global(.bx--inline-notification__icon) {
		display: none;
	}

	:global(.bx--snippet.bx--snippet--single) {
		background-color: #262626;
	}

	.overflow-y-auto {
		color-scheme: dark !important;
	}

	:global(.bx--inline-notification) {
		margin-right: 10px !important;
		margin-left: 8px !important;
		background:#2F2F2F !important;
		max-width: 100% !important;
		margin-top: 0rem !important;
		margin-bottom: 0rem !important;
	}

	:global(.bx--modal-content) {
		overflow-y: visible !important;
	}

	@media (min-width: 42rem) {:global(.bx--modal-container) {
		position: relative !important;
		height: auto !important;
		width: 90% !important;
		min-height: 30rem !important;
	}}

	:global(.bx--modal-content) {
		margin-bottom:1.8rem !important;
	}

	:global(.bx--modal-header) {
		margin-bottom:0rem !important;
	}
</style>
