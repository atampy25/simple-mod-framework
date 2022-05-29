<script lang="ts">
	import { scale } from "svelte/transition"
	import { onMount } from "svelte"

	import { Button, TextInput } from "carbon-components-svelte"
	import { page } from "$app/stores"

	import { alterModManifest, FrameworkVersion, getManifestFromModID, setModManifest } from "$lib/utils"
	import TextInputModal from "$lib/TextInputModal.svelte"
	import ModManifestInterface from "$lib/ModManifestInterface.svelte"

	import Edit from "carbon-icons-svelte/lib/Edit.svelte"
	import CloseOutline from "carbon-icons-svelte/lib/CloseOutline.svelte"
	import AddAlt from "carbon-icons-svelte/lib/AddAlt.svelte"
	import { valid } from "semver"
	import { Language, type Manifest } from "../../../../../src/types"

	import isEqual from "lodash.isequal"

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

	onMount(() => (dummyForceUpdate = Math.random()))

	let modNameInputModal: TextInputModal
	let modNameInputModalOpen = false

	let modDescriptionInputModal: TextInputModal
	let modDescriptionInputModalOpen = false

	let modAuthorInputModal: TextInputModal
	let modAuthorInputModalOpen = false

	let versionInput: HTMLInputElement
	let frameworkVersionInput: HTMLInputElement
	let updateURLInput: HTMLInputElement
	let versionInputChanged = false
	let frameworkVersionInputChanged = false
	let updateURLInputChanged = false
</script>

<div class="flex gap-4 items-center justify-center">
	<h1 class="text-center" transition:scale>{manifest.name}</h1>
	<Button kind="ghost" icon={Edit} iconDescription="Edit mod name" on:click={() => (modNameInputModalOpen = true)} />
</div>

<br />

<div class="flex gap-4 items-center justify-center">
	<h4 class="text-center whitespace-pre-line" transition:scale>{manifest.description}</h4>
	<Button kind="ghost" size="field" icon={Edit} iconDescription="Edit mod description" on:click={() => (modDescriptionInputModalOpen = true)} />
</div>

<br />

<div class="flex gap-4 items-center justify-center">
	By:
	{#if manifest.authors.length}
		{#each manifest.authors as author (author)}
			<div class="inline-flex gap-3 items-center pl-3 bg-neutral-700">
				{author}
				<Button
					kind="ghost"
					size="small"
					icon={CloseOutline}
					iconDescription="Remove author"
					on:click={() => {
						alterModManifest(manifest.id, { authors: manifest.authors.filter((a) => a != author) })
						dummyForceUpdate = Math.random()
					}}
				/>
			</div>
		{/each}
	{:else}
		Nobody?
	{/if}
	<Button kind="ghost" size="small" icon={AddAlt} iconDescription="Add an author" on:click={() => (modAuthorInputModalOpen = true)} />
</div>

<br />

<div class="grid grid-cols-3 gap-4">
	<div>
		<TextInput
			labelText="Mod version"
			placeholder={manifest.version}
			invalid={versionInputChanged && !valid(versionInput?.value)}
			invalidText="Invalid version"
			bind:ref={versionInput}
			on:input={() => {
				versionInputChanged = !!versionInput.value.length
				versionInput.value = versionInput.value
			}}
		/>
		{#if versionInputChanged}
			<br />
			{#if valid(versionInput.value)}
				<Button
					icon={Edit}
					on:click={() => {
						alterModManifest(manifest.id, { version: versionInput.value })
						versionInputChanged = false
						versionInput.value = ""
						dummyForceUpdate = Math.random()
					}}
				>
					Save
				</Button>
			{/if}
		{/if}
	</div>
	<div>
		<TextInput
			labelText="Targeted framework version"
			placeholder={manifest.frameworkVersion + " (current version: " + FrameworkVersion + ")"}
			invalid={frameworkVersionInputChanged && !valid(frameworkVersionInput?.value)}
			invalidText="Invalid version"
			bind:ref={frameworkVersionInput}
			on:input={() => {
				frameworkVersionInputChanged = !!frameworkVersionInput.value.length
				frameworkVersionInput.value = frameworkVersionInput.value
			}}
		/>
		{#if frameworkVersionInputChanged}
			<br />
			{#if valid(frameworkVersionInput.value)}
				<Button
					icon={Edit}
					on:click={() => {
						alterModManifest(manifest.id, { frameworkVersion: frameworkVersionInput.value })
						frameworkVersionInputChanged = false
						frameworkVersionInput.value = ""
						dummyForceUpdate = Math.random()
					}}
				>
					Save
				</Button>
			{/if}
		{/if}
	</div>
	<div>
		<TextInput
			labelText="Update check URL"
			placeholder={manifest.updateCheck || "Not defined"}
			bind:ref={updateURLInput}
			on:input={() => {
				updateURLInputChanged = !!updateURLInput.value.length
			}}
		/>
		<br />
		{#if manifest.updateCheck}
			<Button
				kind="ghost"
				icon={CloseOutline}
				on:click={() => {
					const x = getManifestFromModID(manifest.id)
					delete x["updateCheck"]
					setModManifest(manifest.id, x)

					updateURLInputChanged = false
					updateURLInput.value = ""
					dummyForceUpdate = Math.random()
				}}
			>
				Disable updates
				<span class="mr-2" />
			</Button>
		{/if}
		{#if updateURLInputChanged}
			<Button
				icon={Edit}
				on:click={() => {
					alterModManifest(manifest.id, { updateCheck: updateURLInput.value })
					updateURLInputChanged = false
					updateURLInput.value = ""
					dummyForceUpdate = Math.random()
				}}
			>
				Save
			</Button>
		{/if}
	</div>
</div>

<br />

<div class="h-[70vh] overflow-y-auto overflow-x-hidden pr-4">
	<ModManifestInterface
		source={manifest}
		on:contentFolder-define={({ detail }) => {
			alterModManifest(manifest.id, { contentFolder: detail })
			dummyForceUpdate = Math.random()
			manifest.contentFolder = detail
		}}
		on:contentFolder-undefine={() => {
			const x = getManifestFromModID(manifest.id)
			delete x["contentFolder"]
			setModManifest(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.contentFolder = undefined
		}}
		on:blobsFolder-define={({ detail }) => {
			alterModManifest(manifest.id, { blobsFolder: detail })
			dummyForceUpdate = Math.random()
			manifest.blobsFolder = detail
		}}
		on:blobsFolder-undefine={() => {
			const x = getManifestFromModID(manifest.id)
			delete x["blobsFolder"]
			setModManifest(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.blobsFolder = undefined
		}}
		on:localisationValue-define={({ detail }) => {
			if (!getManifestFromModID(manifest.id)["localisation"])
				alterModManifest(manifest.id, {
					localisation: Object.fromEntries(
						Object.keys(Language)
							.filter((a) => typeof a == "string")
							.map((a) => [a, {}])
					)
				})

			alterModManifest(manifest.id, {
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
			const x = getManifestFromModID(manifest.id)
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

			setModManifest(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.localisation = manifest.localisation
		}}
		on:localisationOverrideValue-define={({ detail }) => {
			if (!getManifestFromModID(manifest.id)["localisationOverrides"])
				alterModManifest(manifest.id, {
					localisationOverrides: {}
				})

			if (!getManifestFromModID(manifest.id)["localisationOverrides"][detail.hash])
				alterModManifest(manifest.id, {
					localisationOverrides: {
						[detail.hash]: Object.fromEntries(
							Object.keys(Language)
								.filter((a) => typeof a == "string")
								.map((a) => [a, {}])
						)
					}
				})

			alterModManifest(manifest.id, {
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
			const x = getManifestFromModID(manifest.id)
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

			setModManifest(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.localisationOverrides = manifest.localisationOverrides
		}}
		on:localisedLine-define={({ detail }) => {
			if (!getManifestFromModID(manifest.id)["localisedLines"])
				alterModManifest(manifest.id, {
					localisedLines: {}
				})

			alterModManifest(manifest.id, {
				localisedLines: {
					[detail.key]: detail.value
				}
			})
			dummyForceUpdate = Math.random()

			manifest.localisedLines = manifest.localisedLines
		}}
		on:localisedLine-undefine={({ detail }) => {
			const x = getManifestFromModID(manifest.id)
			delete x["localisedLines"][detail.key]

			if (isEqual(x["localisedLines"], {})) {
				delete x["localisedLines"]
			}

			setModManifest(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.localisedLines = manifest.localisedLines
		}}
		on:pdefPartition-define={({ detail }) => {
			if (!getManifestFromModID(manifest.id)["packagedefinition"])
				alterModManifest(manifest.id, {
					packagedefinition: []
				})

			const pdef = getManifestFromModID(manifest.id).packagedefinition || []

			console.log(pdef)

			console.log(detail)

			const original =
				pdef.findIndex((a) => a.name == detail.partition.split("$:$")[0]) != -1
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

			alterModManifest(manifest.id, {
				packagedefinition: pdef
			})
			dummyForceUpdate = Math.random()

			manifest.packagedefinition = manifest.packagedefinition
		}}
		on:pdefPartition-undefine={({ detail }) => {
			const x = getManifestFromModID(manifest.id)

			x.packagedefinition.findIndex((a) => a.name == detail.partition.split("$:$")[0]) &&
				x.packagedefinition?.splice(
					x.packagedefinition.findIndex((a) => a.name == detail.partition.split("$:$")[0]),
					1
				)

			if (isEqual(x["packagedefinition"], [])) {
				delete x["packagedefinition"]
			}

			setModManifest(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.packagedefinition = manifest.packagedefinition
		}}
		on:pdefEntity-define={({ detail }) => {
			if (!getManifestFromModID(manifest.id)["packagedefinition"])
				alterModManifest(manifest.id, {
					packagedefinition: []
				})

			const pdef = getManifestFromModID(manifest.id).packagedefinition || []

			const original =
				pdef.findIndex((a) => a.partition == detail.entity.split("$:$")[0].split("|")[0] && a.path == detail.entity.split("$:$")[0].split("|")[1]) != -1
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

			alterModManifest(manifest.id, {
				packagedefinition: pdef
			})
			dummyForceUpdate = Math.random()

			manifest.packagedefinition = manifest.packagedefinition
		}}
		on:pdefEntity-undefine={({ detail }) => {
			const x = getManifestFromModID(manifest.id)

			x.packagedefinition?.splice(
				x.packagedefinition.findIndex((a) => a.partition == detail.entity.split("$:$")[0].split("|")[0] && a.path == detail.entity.split("$:$")[0].split("|")[1]),
				1
			)

			if (isEqual(x["packagedefinition"], [])) {
				delete x["packagedefinition"]
			}

			setModManifest(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.packagedefinition = manifest.packagedefinition
		}}
	/>
</div>

<br />
<br />

<div class="mb-[100vh]" />

<TextInputModal
	bind:this={modNameInputModal}
	bind:showingModal={modNameInputModalOpen}
	modalText="Edit the mod name"
	modalPlaceholder={manifest.name}
	modalInitialText={manifest.name}
	on:close={() => {
		if (modNameInputModal.value && modNameInputModal.value.length) {
			alterModManifest(manifest.id, { name: modNameInputModal.value })
			dummyForceUpdate = Math.random()
		}
	}}
/>

<TextInputModal
	bind:this={modDescriptionInputModal}
	bind:showingModal={modDescriptionInputModalOpen}
	modalText="Edit the mod description"
	modalPlaceholder={manifest.description}
	modalInitialText={manifest.description}
	multiline
	on:close={() => {
		if (modDescriptionInputModal.value && modDescriptionInputModal.value.length) {
			alterModManifest(manifest.id, { description: modDescriptionInputModal.value })
			dummyForceUpdate = Math.random()
		}
	}}
/>

<TextInputModal
	bind:this={modAuthorInputModal}
	bind:showingModal={modAuthorInputModalOpen}
	modalText="Add a mod author"
	modalPlaceholder="EpicModMaker123"
	on:close={() => {
		if (modAuthorInputModal.value && modAuthorInputModal.value.length) {
			alterModManifest(manifest.id, { authors: [...manifest.authors, modAuthorInputModal.value] })
			dummyForceUpdate = Math.random()
		}
	}}
/>

<style>
	:global(.bx--btn--ghost) {
		color: inherit;
		@apply bg-neutral-900;
	}

	:global(.bx--btn--ghost:hover, .bx--btn--ghost:active) {
		color: inherit;
	}
</style>
