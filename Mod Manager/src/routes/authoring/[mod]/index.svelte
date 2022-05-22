<script lang="ts">
	import { scale } from "svelte/transition"

	import { Button, TextInput } from "carbon-components-svelte"
	import { page } from "$app/stores"

	import { alterModManifest, FrameworkVersion, getManifestFromModID, setModManifest } from "$lib/utils"
	import TextInputModal from "$lib/TextInputModal.svelte"
	import ModManifestInterface from "$lib/ModManifestInterface.svelte"

	import Edit from "carbon-icons-svelte/lib/Edit.svelte"
	import CloseOutline from "carbon-icons-svelte/lib/CloseOutline.svelte"
	import AddAlt from "carbon-icons-svelte/lib/AddAlt.svelte"
	import { valid } from "semver"

	let dummyForceUpdate = Math.random()

	let manifest = getManifestFromModID($page.params.mod)
	$: manifest = getManifestFromModID($page.params.mod, dummyForceUpdate)

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
			setModManifest(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.localisation = manifest.localisation
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
