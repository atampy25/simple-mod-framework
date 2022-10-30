<script lang="ts">
	import { scale } from "svelte/transition"
	import { onMount } from "svelte"

	import { Button, ClickableTile, InlineLoading, InlineNotification, TextInput } from "carbon-components-svelte"
	import { page } from "$app/stores"

	import { alterModManifest, FrameworkVersion, getAllModWarnings, getManifestFromModID, getModFolder, setModManifest } from "$lib/utils"
	import TextInputModal from "$lib/TextInputModal.svelte"

	import Edit from "carbon-icons-svelte/lib/Edit.svelte"
	import CloseOutline from "carbon-icons-svelte/lib/CloseOutline.svelte"
	import AddAlt from "carbon-icons-svelte/lib/AddAlt.svelte"
	import Code from "carbon-icons-svelte/lib/Code.svelte"
	import CheckboxChecked from "carbon-icons-svelte/lib/CheckboxChecked.svelte"
	import RadioButtonChecked from "carbon-icons-svelte/lib/RadioButtonChecked.svelte"
	import Asterisk from "carbon-icons-svelte/lib/Asterisk.svelte"

	import { valid } from "semver"
	import type { Manifest } from "../../../../../src/types"

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

	let modWarningsPromise: Promise<Record<string, { title: string; subtitle: string; trace: string }[]>> = null!
	$: $page.params.mod ? setTimeout(() => (modWarningsPromise = getAllModWarnings()), 500) : []
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
			placeholder={manifest.frameworkVersion + " - you're currently looking at version " + FrameworkVersion}
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
			/>
			Save
		{/if}
	</div>
</div>

<br />

<div class="flex flex-row justify-center items-center mt-8">
	<div class="flex flex-row gap-8 items-center mt-8 pb-4 max-w-[80vw] overflow-x-auto">
		<div transition:scale>
			<ClickableTile href="/authoring/{$page.params.mod}/manifest" style="width: 10vw; height: 8vw">
				<div class="w-full h-full flex justify-center items-center text-xl font-light">
					<div>
						<div class="flex justify-center mb-2">
							<Code size={64} />
						</div>
						<div class="flex justify-center">Manifest</div>
					</div>
				</div>
			</ClickableTile>
		</div>
		{#each manifest.options || [] as option (option.group + option.name)}
			<div transition:scale>
				<ClickableTile href="/authoring/{$page.params.mod}/options/{(option.group || '-') + '$|$' + option.name}" style="width: 10vw; height: 8vw">
					<div class="w-full h-full flex justify-center items-center text-xl font-light">
						<div>
							<div class="flex justify-center mb-2">
								{#if option.type == "checkbox"}
									<CheckboxChecked size={64} />
								{:else if option.type == "select"}
									<RadioButtonChecked size={64} />
								{:else if option.type == "conditional"}
									<Asterisk size={64} />
								{/if}
							</div>
							<div class="flex justify-center">
								<div class="text-center">
									{#if option.type == "group"}
										{option.group} →
									{/if}
									{option.name}
								</div>
							</div>
						</div>
					</div>
				</ClickableTile>
			</div>
		{/each}
	</div>
</div>

<br />

<div class="flex items-center justify-center w-full mt-8">
	<div>
		<div class="flex gap-4 items-center justify-center">
			<h1 class="text-center" transition:scale>Tips and Warnings</h1>
		</div>

		<br />

		<div class="{window.screen.height <= 1080 ? 'max-h-[42vh]' : 'max-h-[45vh]'} pr-4 overflow-y-auto">
			{#if modWarningsPromise}
				{#await modWarningsPromise}
					<div class="flex items-center">
						<p class="flex-grow">Checking the mod...</p>
						<div>
							<InlineLoading />
						</div>
					</div>
				{:then warnings}
					{#each warnings[manifest.id] as { title, subtitle, trace, type }}
						{#if type == "error"}
							<InlineNotification hideCloseButton lowContrast kind="error">
								<div slot="title" class="text-lg">
									{title}
								</div>
								<div slot="subtitle">
									{@html subtitle}
									<br />
									<br />
									This error originated from the file at:
									<br />
									<code class="h">{window.path.resolve(getModFolder(manifest.id), trace)}</code>
								</div>
							</InlineNotification>
						{:else if type == "warning" || type == "warning-suppressed"}
							<InlineNotification hideCloseButton lowContrast kind="warning">
								<div slot="title" class="text-lg">
									{title}
								</div>
								<div slot="subtitle">
									{@html subtitle}
									<br />
									<br />
									This warning originated from the file at:
									<br />
									<code class="h">{window.path.resolve(getModFolder(manifest.id), trace)}</code>
								</div>
							</InlineNotification>
						{:else if type == "info"}
							<InlineNotification hideCloseButton lowContrast kind="info">
								<div slot="title" class="text-lg">
									{title}
								</div>
								<div slot="subtitle">
									{@html subtitle}
									<br />
									<br />
									This message originated from the file at:
									<br />
									<code class="h">{window.path.resolve(getModFolder(manifest.id), trace)}</code>
								</div>
							</InlineNotification>
						{/if}
					{/each}
				{:catch}
					<div class="flex items-center">
						<p class="flex-grow">Couldn't get mod warnings</p>
						<div>
							<InlineLoading status="error" />
						</div>
					</div>
				{/await}
			{:else}
				<div class="flex items-center">
					<p class="flex-grow">Checking the mod...</p>
					<div>
						<InlineLoading />
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

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

	:global(.bx--inline-notification) {
		width: 70vh;
	}

	:global(.bx--inline-notification__text-wrapper) {
		display: block;
	}

	:global(.bx--inline-notification__icon) {
		margin-top: 1.2rem;
	}

	:global(.bx--inline-notification__subtitle) {
		line-height: 1.5;
	}
</style>
