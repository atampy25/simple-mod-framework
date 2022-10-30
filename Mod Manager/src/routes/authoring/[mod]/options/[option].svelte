<script lang="ts">
	type ArrayElement<A> = A extends readonly (infer T)[] ? T : never

	import { scale } from "svelte/transition"
	import { onMount } from "svelte"

	import { page } from "$app/stores"
	import { goto } from "$app/navigation"

	import tippy from "svelte-tippy"
	import "tippy.js/dist/tippy.css"

	import { FrameworkVersion, getManifestFromModID, getModFolder, setModManifest } from "$lib/utils"
	import ModManifestInterface from "$lib/ModManifestInterface.svelte"
	import TextInputModal from "$lib/TextInputModal.svelte"

	import { Language, OptionType, Platform, type Manifest } from "../../../../../../src/types"

	import { Button, Checkbox, RadioButton, RadioButtonGroup } from "carbon-components-svelte"
	import Edit from "carbon-icons-svelte/lib/Edit.svelte"
	import CloseOutline from "carbon-icons-svelte/lib/CloseOutline.svelte"

	import isEqual from "lodash.isequal"
	import merge from "lodash.mergewith"

	let dummyForceUpdate = Math.random()

	let manifest = {
		version: "1.0.0",
		id: "Example.Example",
		name: "Loading...",
		description: "Extremely good description",
		authors: ["Example"],
		contentFolder: "content",
		frameworkVersion: FrameworkVersion
	} as Manifest

	$: manifest = $page.params.mod
		? getManifestFromModID($page.params.mod, dummyForceUpdate)
		: ({
				version: "1.0.0",
				id: "Example.Example",
				name: "Loading...",
				description: "Extremely good description",
				authors: ["Example"],
				contentFolder: "content",
				frameworkVersion: FrameworkVersion
		  } as Manifest)

	$: option = $page.params.option
		? manifest.options!.find((a) =>
				$page.params.option.split("$|$")[0] == "-"
					? (a.type == "checkbox" || a.type == "conditional") && a.name == $page.params.option.split("$|$")[1]
					: a.type == "select" && a.group == $page.params.option.split("$|$")[0] && a.name == $page.params.option.split("$|$")[1]
		  )!
		: ({} as ArrayElement<Manifest["options"]>)

	onMount(() => (dummyForceUpdate = Math.random()))

	function alterOption(_useless: string, data: Partial<ArrayElement<Manifest["options"]>>) {
		const m = getManifestFromModID(manifest.id)
		const optIndex = m.options!.findIndex((a) =>
			$page.params.option.split("$|$")[0] == "-"
				? (a.type == "checkbox" || a.type == "conditional") && a.name == $page.params.option.split("$|$")[1]
				: a.type == "select" && a.group == $page.params.option.split("$|$")[0] && a.name == $page.params.option.split("$|$")[1]
		)

		if (optIndex == -1) {
			return
		}

		merge(m.options![optIndex], data, (orig, src) => {
			if (Array.isArray(orig)) {
				return src
			}
		})

		setModManifest(manifest.id, m)
	}

	function getOption(_useless: string) {
		const m = getManifestFromModID(manifest.id)

		return m.options!.find((a) =>
			($page.params.option || "").split("$|$")[0] == "-"
				? (a.type == "checkbox" || a.type == "conditional") && a.name == ($page.params.option || "").split("$|$")[1]
				: a.type == "select" && a.group == ($page.params.option || "").split("$|$")[0] && a.name == ($page.params.option || "").split("$|$")[1]
		)!
	}

	function setOption(_useless: string, data: ArrayElement<Manifest["options"]>) {
		const m = getManifestFromModID(manifest.id)
		const optIndex = m.options!.findIndex((a) =>
			($page.params.option || "").split("$|$")[0] == "-"
				? (a.type == "checkbox" || a.type == "conditional") && a.name == ($page.params.option || "").split("$|$")[1]
				: a.type == "select" && a.group == ($page.params.option || "").split("$|$")[0] && a.name == ($page.params.option || "").split("$|$")[1]
		)

		if (optIndex == -1) {
			return
		}

		m.options![optIndex] = data

		setModManifest(manifest.id, m)
	}

	let optionNameInputModal: TextInputModal
	let optionNameInputModalOpen = false

	let groupInputModal: TextInputModal
	let groupInputModalOpen = false

	let tooltipInputModal: TextInputModal
	let tooltipInputModalOpen = false

	let conditionInputModal: TextInputModal
	let conditionInputModalOpen = false

	window.ipc.receive("imageOpenDialogResult", (imagePopupResult: string[] | undefined) => {
		if (!imagePopupResult) {
			return
		}

		alterOption(manifest.id, { image: window.path.relative(getModFolder(manifest.id), imagePopupResult[0]) })
		dummyForceUpdate = Math.random()
	})
</script>

<div class="flex gap-8 items-center">
	<h4 class="text-center" transition:scale>
		<a href="/authoring/{$page.params.mod}">← Back</a>
	</h4>

	<div>
		<h1 transition:scale>
			{manifest.name}
		</h1>

		<div class="flex gap-4 items-center justify-center">
			<h3 transition:scale>
				{option.name}
			</h3>
			<Button kind="ghost" size="field" icon={Edit} iconDescription="Edit option name" on:click={() => (optionNameInputModalOpen = true)} />
		</div>
	</div>

	<div class="flex-grow" />

	<div>
		<RadioButtonGroup
			selected={option.type}
			on:change={({ detail }) => {
				const opt = getOption(manifest.id)
				opt.type = detail

				// these are not present in all option types
				delete opt.enabledByDefault
				delete opt.group
				delete opt.tooltip
				delete opt.image
				delete opt.mods
				delete opt.condition

				setOption(manifest.id, opt)
				dummyForceUpdate = Math.random()
			}}
			legendText="Type of option"
		>
			{#each Object.keys(OptionType).filter((a) => typeof a == "string") as optionType (optionType)}
				<RadioButton value={optionType} labelText={optionType.slice(0, 1).toUpperCase() + optionType.slice(1)} />
			{/each}
		</RadioButtonGroup>
	</div>

	{#if option.type == "select"}
		<div>
			<Button icon={Edit} on:click={() => (groupInputModalOpen = true)}>Set group</Button>
		</div>
	{/if}

	{#if option.type == "checkbox" || option.type == "select"}
		<div>
			<Checkbox
				checked={option.enabledByDefault}
				labelText="Enabled by default"
				on:change={({ target: { checked } }) => {
					alterOption(manifest.id, { enabledByDefault: checked })
				}}
			/>
		</div>
		<div>
			<div
				use:tippy={option?.tooltip
					? {
							content: (reference) => {
								let elem = document.createElement("div")
								let text = document.createElement("span")
								text.innerText = option.tooltip
								elem.appendChild(text)

								return elem
							},
							placement: "left"
					  }
					: { content: undefined, delay: 9999999999999999 }}
				class="inline"
			>
				<Button icon={Edit} on:click={() => (tooltipInputModalOpen = true)}>Set tooltip</Button>
			</div>
			{#if option.tooltip}
				<Button
					kind="ghost"
					icon={CloseOutline}
					iconDescription="Remove tooltip"
					on:click={() => {
						const opt = getOption(manifest.id)
						delete opt.tooltip
						setOption(manifest.id, opt)
						dummyForceUpdate = Math.random()
					}}
				/>
			{/if}

			<div class="ml-4 inline" />

			<div
				use:tippy={option?.image
					? {
							content: (reference) => {
								let elem = document.createElement("div")
								let img = document.createElement("img")
								img.src = window.path.join(getModFolder(manifest.id), option.image)
								elem.appendChild(img)

								return elem
							},
							placement: "left"
					  }
					: { content: undefined, delay: 9999999999999999 }}
				class="inline"
			>
				<Button icon={Edit} on:click={() => window.ipc.send("imageOpenDialog")}>Set thumbnail</Button>
			</div>
			{#if option.image}
				<Button
					kind="ghost"
					icon={CloseOutline}
					iconDescription="Remove thumbnail"
					on:click={() => {
						const opt = getOption(manifest.id)
						delete opt.image
						setOption(manifest.id, opt)
						dummyForceUpdate = Math.random()
					}}
				/>
			{/if}
		</div>
	{/if}

	{#if option.type == "conditional"}
		<div>
			<Button icon={Edit} on:click={() => (conditionInputModalOpen = true)}>Set condition</Button>
		</div>
	{/if}

	<div />
</div>

<br />

<div class="{window.screen.height <= 1080 ? 'h-[83vh]' : 'h-[86vh]'} overflow-y-auto overflow-x-hidden pr-4">
	<ModManifestInterface
		source={option}
		modRoot={getModFolder(manifest.id)}
		on:contentFolder-define={({ detail }) => {
			alterOption(manifest.id, { contentFolder: detail })
			dummyForceUpdate = Math.random()
			manifest.contentFolder = detail
		}}
		on:contentFolder-undefine={() => {
			const x = getOption(manifest.id)
			delete x["contentFolder"]
			setOption(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.contentFolder = undefined
		}}
		on:blobsFolder-define={({ detail }) => {
			alterOption(manifest.id, { blobsFolder: detail })
			dummyForceUpdate = Math.random()
			manifest.blobsFolder = detail
		}}
		on:blobsFolder-undefine={() => {
			const x = getOption(manifest.id)
			delete x["blobsFolder"]
			setOption(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.blobsFolder = undefined
		}}
		on:localisationValue-define={({ detail }) => {
			if (!getOption(manifest.id)["localisation"])
				alterOption(manifest.id, {
					localisation: Object.fromEntries(
						Object.keys(Language)
							.filter((a) => typeof a == "string")
							.map((a) => [a, {}])
					)
				})

			alterOption(manifest.id, {
				localisation: {
					[detail.language]: {
						[detail.key]: detail.value
					}
				}
			})
			dummyForceUpdate = Math.random()

			manifest.localisation = manifest.localisation
		}}
		on:localisationValue-undefine={({ detail }) => {
			const x = getOption(manifest.id)
			delete x["localisation"][detail.language][detail.key]

			if (
				isEqual(
					x["localisation"],
					Object.fromEntries(
						Object.keys(Language)
							.filter((a) => typeof a == "string")
							.map((a) => [a, {}])
					)
				)
			) {
				delete x["localisation"]
			}

			setOption(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.localisation = manifest.localisation
		}}
		on:localisationOverrideValue-define={({ detail }) => {
			if (!getOption(manifest.id)["localisationOverrides"])
				alterOption(manifest.id, {
					localisationOverrides: {}
				})

			if (!getOption(manifest.id)["localisationOverrides"][detail.hash])
				alterOption(manifest.id, {
					localisationOverrides: {
						[detail.hash]: Object.fromEntries(
							Object.keys(Language)
								.filter((a) => typeof a == "string")
								.map((a) => [a, {}])
						)
					}
				})

			alterOption(manifest.id, {
				localisationOverrides: {
					[detail.hash]: {
						[detail.language]: {
							[detail.key]: detail.value
						}
					}
				}
			})
			dummyForceUpdate = Math.random()

			manifest.localisationOverrides = manifest.localisationOverrides
		}}
		on:localisationOverrideValue-undefine={({ detail }) => {
			const x = getOption(manifest.id)
			delete x["localisationOverrides"][detail.hash][detail.language][detail.key]

			if (
				isEqual(
					x["localisationOverrides"][detail.hash],
					Object.fromEntries(
						Object.keys(Language)
							.filter((a) => typeof a == "string")
							.map((a) => [a, {}])
					)
				)
			) {
				delete x["localisationOverrides"][detail.hash]
			}

			if (isEqual(x["localisationOverrides"], {})) {
				delete x["localisationOverrides"]
			}

			setOption(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.localisationOverrides = manifest.localisationOverrides
		}}
		on:localisedLine-define={({ detail }) => {
			if (!getOption(manifest.id)["localisedLines"])
				alterOption(manifest.id, {
					localisedLines: {}
				})

			alterOption(manifest.id, {
				localisedLines: {
					[detail.key]: detail.value
				}
			})
			dummyForceUpdate = Math.random()

			manifest.localisedLines = manifest.localisedLines
		}}
		on:localisedLine-undefine={({ detail }) => {
			const x = getOption(manifest.id)
			delete x["localisedLines"][detail.key]

			if (isEqual(x["localisedLines"], {})) {
				delete x["localisedLines"]
			}

			setOption(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.localisedLines = manifest.localisedLines
		}}
		on:pdefPartition-define={({ detail }) => {
			if (!getOption(manifest.id)["packagedefinition"])
				alterOption(manifest.id, {
					packagedefinition: []
				})

			const pdef = getOption(manifest.id).packagedefinition || []

			console.log(pdef)

			console.log(detail)

			const original = pdef.some((a) => a.name == detail.partition.split("$:$")[0])
				? pdef.splice(
						pdef.findIndex((a) => a.name == detail.partition.split("$:$")[0]),
						1
				  )[0]
				: {
						type: "partition",
						name: detail.partition.split("$:$")[0],
						parent: "super",
						partitionType: "standard"
				  }

			console.log(original)

			pdef.push({
				...original,
				[detail.key]: detail.value
			})

			console.log(pdef)

			alterOption(manifest.id, {
				packagedefinition: pdef
			})
			dummyForceUpdate = Math.random()

			manifest.packagedefinition = manifest.packagedefinition
		}}
		on:pdefPartition-undefine={({ detail }) => {
			const x = getOption(manifest.id)

			x.packagedefinition.findIndex((a) => a.name == detail.partition.split("$:$")[0]) &&
				x.packagedefinition?.splice(
					x.packagedefinition.findIndex((a) => a.name == detail.partition.split("$:$")[0]),
					1
				)

			if (isEqual(x["packagedefinition"], [])) {
				delete x["packagedefinition"]
			}

			setOption(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.packagedefinition = manifest.packagedefinition
		}}
		on:pdefEntity-define={({ detail }) => {
			if (!getOption(manifest.id)["packagedefinition"])
				alterOption(manifest.id, {
					packagedefinition: []
				})

			const pdef = getOption(manifest.id).packagedefinition || []

			const original = pdef.some((a) => a.partition == detail.entity.split("$:$")[0].split("|")[0] && a.path == detail.entity.split("$:$")[0].split("|")[1])
				? pdef.splice(
						pdef.findIndex((a) => a.partition == detail.entity.split("$:$")[0].split("|")[0] && a.path == detail.entity.split("$:$")[0].split("|")[1]),
						1
				  )[0]
				: {
						type: "entity",
						partition: detail.entity.split("$:$")[0].split("|")[0],
						path: detail.entity.split("$:$")[0].split("|")[1]
				  }

			pdef.push({
				...original,
				[detail.key]: detail.value
			})

			alterOption(manifest.id, {
				packagedefinition: pdef
			})
			dummyForceUpdate = Math.random()

			manifest.packagedefinition = manifest.packagedefinition
		}}
		on:pdefEntity-undefine={({ detail }) => {
			const x = getOption(manifest.id)

			x.packagedefinition?.splice(
				x.packagedefinition.findIndex((a) => a.partition == detail.entity.split("$:$")[0].split("|")[0] && a.path == detail.entity.split("$:$")[0].split("|")[1]),
				1
			)

			if (isEqual(x["packagedefinition"], [])) {
				delete x["packagedefinition"]
			}

			setOption(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.packagedefinition = manifest.packagedefinition
		}}
		on:runtimePackage-define={({ detail }) => {
			if (!getOption(manifest.id)["runtimePackages"])
				alterOption(manifest.id, {
					runtimePackages: []
				})

			const rpkgs = getOption(manifest.id).runtimePackages || []

			const original = rpkgs.some((a) => a.chunk == detail.origChunk && a.path == detail.origPath)
				? rpkgs.splice(
						rpkgs.findIndex((a) => a.chunk == detail.origChunk && a.path == detail.origPath),
						1
				  )[0]
				: {
						chunk: detail.origChunk,
						path: detail.origPath
				  }

			if (detail.type == "defineChunk") {
				rpkgs.push({
					...original,
					chunk: detail.newChunk
				})
			} else if (detail.type == "definePath") {
				rpkgs.push({
					...original,
					path: detail.newPath
				})
			}

			alterOption(manifest.id, {
				runtimePackages: rpkgs
			})
			dummyForceUpdate = Math.random()

			manifest.runtimePackages = manifest.runtimePackages
		}}
		on:runtimePackage-undefine={({ detail }) => {
			const x = getOption(manifest.id)

			x.runtimePackages?.splice(
				x.runtimePackages.findIndex((a) => a.chunk == detail.chunk && a.path == detail.path),
				1
			)

			if (isEqual(x["runtimePackages"], [])) {
				delete x["runtimePackages"]
			}

			setOption(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.runtimePackages = manifest.runtimePackages
		}}
		on:dependency-define={({ detail }) => {
			if (!getOption(manifest.id)["dependencies"])
				alterOption(manifest.id, {
					dependencies: []
				})

			const deps = (getOption(manifest.id).dependencies || []).map((a) => {
				return typeof a == "string" ? { runtimeID: a, toChunk: 0 } : a
			})

			const original = deps.some((a) => a.toChunk == detail.origToChunk && a.runtimeID == detail.origRuntimeID)
				? deps.splice(
						deps.findIndex((a) => a.toChunk == detail.origToChunk && a.runtimeID == detail.origRuntimeID),
						1
				  )[0]
				: {
						toChunk: detail.origToChunk,
						runtimeID: detail.origRuntimeID
				  }

			if (detail.type == "defineToChunk") {
				deps.push({
					...original,
					toChunk: detail.newToChunk
				})
			} else if (detail.type == "defineRuntimeID") {
				deps.push({
					...original,
					runtimeID: detail.newRuntimeID
				})
			}

			alterOption(manifest.id, {
				dependencies: deps.map((a) => {
					return a.toChunk == 0 ? a.runtimeID : { runtimeID: a.runtimeID, toChunk: a.toChunk }
				})
			})
			dummyForceUpdate = Math.random()

			manifest.dependencies = manifest.dependencies
		}}
		on:dependency-undefine={({ detail }) => {
			const x = getOption(manifest.id)

			x.dependencies?.splice(
				x.dependencies
					.map((a) => {
						return typeof a == "string" ? { runtimeID: a, toChunk: 0 } : a
					})
					.findIndex((a) => a.toChunk == detail.toChunk && a.runtimeID == detail.runtimeID),
				1
			)

			if (isEqual(x["dependencies"], [])) {
				delete x["dependencies"]
			}

			setOption(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.dependencies = manifest.dependencies
		}}
		on:thumbs-define={({ detail }) => {
			if (!getOption(manifest.id)["thumbs"])
				alterOption(manifest.id, {
					thumbs: []
				})

			const thumbs = getOption(manifest.id).thumbs || []

			if (thumbs.some((a) => a == detail.original)) {
				thumbs.splice(
					thumbs.findIndex((a) => a == detail.original),
					1
				)
			}

			thumbs.push(detail.new)

			alterOption(manifest.id, {
				thumbs
			})
			dummyForceUpdate = Math.random()

			manifest.thumbs = manifest.thumbs
		}}
		on:thumbs-undefine={({ detail }) => {
			const x = getOption(manifest.id)

			x.thumbs?.splice(
				x.thumbs.findIndex((a) => a == detail.value),
				1
			)

			if (isEqual(x["thumbs"], [])) {
				delete x["thumbs"]
			}

			setOption(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.thumbs = manifest.thumbs
		}}
		on:supportedPlatforms-alter={({ detail }) => {
			if (detail.value) {
				if (!getOption(manifest.id)["supportedPlatforms"])
					alterOption(manifest.id, {
						supportedPlatforms: []
					})

				const supportedPlatforms = getOption(manifest.id).supportedPlatforms || []

				if (supportedPlatforms.some((a) => a == detail.platform)) {
					supportedPlatforms.splice(
						supportedPlatforms.findIndex((a) => a == detail.platform),
						1
					)
				}

				supportedPlatforms.push(detail.platform)

				alterOption(manifest.id, {
					supportedPlatforms
				})
			} else {
				const x = getOption(manifest.id)

				x.supportedPlatforms = x.supportedPlatforms || Object.keys(Platform).filter((a) => typeof a == "string")

				x.supportedPlatforms?.splice(
					x.supportedPlatforms.findIndex((a) => a == detail.platform),
					1
				)

				if (isEqual(x["supportedPlatforms"], [])) {
					delete x["supportedPlatforms"]
				}

				setOption(manifest.id, x)
			}

			const x = getOption(manifest.id)

			if (
				Object.keys(Platform)
					.filter((a) => typeof a == "string")
					.every((a) => x["supportedPlatforms"]?.includes(a))
			) {
				delete x["supportedPlatforms"]
				setOption(manifest.id, x)
			}

			dummyForceUpdate = Math.random()

			manifest.supportedPlatforms = manifest.supportedPlatforms
		}}
		on:requirements-define={({ detail }) => {
			if (!getOption(manifest.id)["requirements"])
				alterOption(manifest.id, {
					requirements: []
				})

			const requirements = getOption(manifest.id).requirements || []

			if (requirements.some((a) => a == detail.original)) {
				requirements.splice(
					requirements.findIndex((a) => a == detail.original),
					1
				)
			}

			requirements.push(detail.new)

			alterOption(manifest.id, {
				requirements
			})
			dummyForceUpdate = Math.random()

			manifest.requirements = manifest.requirements
		}}
		on:requirements-undefine={({ detail }) => {
			const x = getOption(manifest.id)

			x.requirements?.splice(
				x.requirements.findIndex((a) => a == detail.value),
				1
			)

			if (isEqual(x["requirements"], [])) {
				delete x["requirements"]
			}

			setOption(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.requirements = manifest.requirements
		}}
		on:loadBefore-define={({ detail }) => {
			if (!getOption(manifest.id)["loadBefore"])
				alterOption(manifest.id, {
					loadBefore: []
				})

			const loadBefore = getOption(manifest.id).loadBefore || []

			if (loadBefore.some((a) => a == detail.original)) {
				loadBefore.splice(
					loadBefore.findIndex((a) => a == detail.original),
					1
				)
			}

			loadBefore.push(detail.new)

			alterOption(manifest.id, {
				loadBefore
			})
			dummyForceUpdate = Math.random()

			manifest.loadBefore = manifest.loadBefore
		}}
		on:loadBefore-undefine={({ detail }) => {
			const x = getOption(manifest.id)

			x.loadBefore?.splice(
				x.loadBefore.findIndex((a) => a == detail.value),
				1
			)

			if (isEqual(x["loadBefore"], [])) {
				delete x["loadBefore"]
			}

			setOption(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.loadBefore = manifest.loadBefore
		}}
		on:loadAfter-define={({ detail }) => {
			if (!getOption(manifest.id)["loadAfter"])
				alterOption(manifest.id, {
					loadAfter: []
				})

			const loadAfter = getOption(manifest.id).loadAfter || []

			if (loadAfter.some((a) => a == detail.original)) {
				loadAfter.splice(
					loadAfter.findIndex((a) => a == detail.original),
					1
				)
			}

			loadAfter.push(detail.new)

			alterOption(manifest.id, {
				loadAfter
			})
			dummyForceUpdate = Math.random()

			manifest.loadAfter = manifest.loadAfter
		}}
		on:loadAfter-undefine={({ detail }) => {
			const x = getOption(manifest.id)

			x.loadAfter?.splice(
				x.loadAfter.findIndex((a) => a == detail.value),
				1
			)

			if (isEqual(x["loadAfter"], [])) {
				delete x["loadAfter"]
			}

			setOption(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.loadAfter = manifest.loadAfter
		}}
	/>
</div>

<TextInputModal
	bind:this={optionNameInputModal}
	bind:showingModal={optionNameInputModalOpen}
	modalText="Edit the option name"
	modalPlaceholder={option.name}
	modalInitialText={option.name}
	on:close={() => {
		if (optionNameInputModal.value && optionNameInputModal.value.length) {
			alterOption(manifest.id, { name: optionNameInputModal.value })
			goto(`/authoring/${$page.params.mod}/options/${$page.params.option.split("$|$")[0]}$|$${optionNameInputModal.value}`)
		}
	}}
/>

<TextInputModal
	bind:this={groupInputModal}
	bind:showingModal={groupInputModalOpen}
	modalText="Edit the option group"
	modalPlaceholder={option.group || ""}
	modalInitialText={option.group || ""}
	on:close={() => {
		if (groupInputModal.value && groupInputModal.value.length) {
			alterOption(manifest.id, { group: groupInputModal.value })
			goto(`/authoring/${$page.params.mod}/options/${groupInputModal.value}$|$${$page.params.option.split("$|$")[1]}`)
		}
	}}
/>

<TextInputModal
	bind:this={tooltipInputModal}
	bind:showingModal={tooltipInputModalOpen}
	modalText="Edit the option tooltip"
	modalPlaceholder={option.tooltip || ""}
	modalInitialText={option.tooltip || ""}
	multiline
	on:close={() => {
		if (tooltipInputModal.value && tooltipInputModal.value.length) {
			alterOption(manifest.id, { tooltip: tooltipInputModal.value })
			dummyForceUpdate = Math.random()
		}
	}}
/>

<TextInputModal
	bind:this={conditionInputModal}
	bind:showingModal={conditionInputModalOpen}
	modalText="Edit the option condition"
	modalPlaceholder={option.condition || ""}
	modalInitialText={option.condition || ""}
	on:close={() => {
		if (conditionInputModal.value && conditionInputModal.value.length) {
			alterOption(manifest.id, { condition: conditionInputModal.value })
			dummyForceUpdate = Math.random()
		}
	}}
/>

<div class="mb-[100vh]" />
