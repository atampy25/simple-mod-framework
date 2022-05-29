<script lang="ts">
	import { Button, TextInput } from "carbon-components-svelte"
	import { slide } from "svelte/transition"
	import Icon from "svelte-fa"

	import CloseOutline from "carbon-icons-svelte/lib/CloseOutline.svelte"
	import Edit from "carbon-icons-svelte/lib/Edit.svelte"

	import { faChevronDown } from "@fortawesome/free-solid-svg-icons"

	import { createEventDispatcher } from "svelte"

	import type { ManifestOptionData } from "../../../src/types"

	import LocalisationEditor from "$lib/LocalisationEditor.svelte"
	import TextInputModal from "$lib/TextInputModal.svelte"
	import KeyValueEditor from "$lib/KeyValueEditor.svelte"

	const dispatch = createEventDispatcher()

	export let source: ManifestOptionData

	let contentAndBlobs = true // section

	let contentFolderInput: HTMLInputElement
	let contentFolderInputChanged = false

	let blobsFolderInput: HTMLInputElement
	let blobsFolderInputChanged = false

	let localisation = true // section
	let modLocalisation = true // section
	let localisationOverrides = true // section

	let localisationOverridesNewFileModal: TextInputModal
	let localisationOverridesNewFileModalOpen = false

	let localisedLines = true // section

	let other = true // section
	let packagedefinition = true // section

	let pdefValueToEdit = ""
	let pdefValueToEditPlaceholder = ""
	let pdefEditModal: TextInputModal
	let pdefEditModalOpen = false
</script>

<div class="flex flex-row items-center cursor-pointer" on:click={() => (contentAndBlobs = !contentAndBlobs)}>
	<h2 class="flex-grow">Content and Blobs</h2>
	<div class:spin={contentAndBlobs} class:spinBack={!contentAndBlobs}>
		<Icon icon={faChevronDown} />
	</div>
</div>
{#if contentAndBlobs}
	<div transition:slide>
		<br />
		<div class="grid grid-cols-2 gap-4">
			<div>
				<TextInput
					labelText="Content folder"
					placeholder={source.contentFolder || "Not defined"}
					bind:ref={contentFolderInput}
					on:input={() => {
						contentFolderInputChanged = !!contentFolderInput.value.length
					}}
				/>
				<br />
				{#if source.contentFolder}
					<Button
						kind="ghost"
						icon={CloseOutline}
						on:click={() => {
							dispatch("contentFolder-undefine")
						}}
					>
						Remove
						<span class="mr-2" />
					</Button>
				{/if}
				{#if contentFolderInputChanged}
					<Button
						icon={Edit}
						on:click={() => {
							dispatch("contentFolder-define", contentFolderInput.value)

							contentFolderInput.value = ""
							contentFolderInputChanged = false
						}}
					>
						Save
					</Button>
				{/if}
			</div>
			<div>
				<TextInput
					labelText="Blobs folder"
					placeholder={source.blobsFolder || "Not defined"}
					bind:ref={blobsFolderInput}
					on:input={() => {
						blobsFolderInputChanged = !!blobsFolderInput.value.length
					}}
				/>
				<br />
				{#if source.blobsFolder}
					<Button
						kind="ghost"
						icon={CloseOutline}
						on:click={() => {
							dispatch("blobsFolder-undefine")
						}}
					>
						Remove
						<span class="mr-2" />
					</Button>
				{/if}
				{#if blobsFolderInputChanged}
					<Button
						icon={Edit}
						on:click={() => {
							dispatch("blobsFolder-define", blobsFolderInput.value)

							blobsFolderInput.value = ""
							blobsFolderInputChanged = false
						}}
					>
						Save
					</Button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<br />

<div class="flex flex-row items-center cursor-pointer" on:click={() => (localisation = !localisation)}>
	<h2 class="flex-grow">Localisation</h2>
	<div class:spin={localisation} class:spinBack={!localisation}>
		<Icon icon={faChevronDown} />
	</div>
</div>
{#if localisation}
	<div transition:slide>
		<br />
		<div class="flex flex-row items-center cursor-pointer" on:click={() => (modLocalisation = !modLocalisation)}>
			<h4 class="flex-grow">Mod localisation</h4>
			<div class:spin={modLocalisation} class:spinBack={!modLocalisation}>
				<Icon icon={faChevronDown} />
			</div>
		</div>
		{#if modLocalisation}
			<div transition:slide>
				<LocalisationEditor
					source={source.localisation}
					on:define={({ detail }) => {
						dispatch("localisationValue-define", detail)
					}}
					on:undefine={({ detail }) => {
						dispatch("localisationValue-undefine", detail)
					}}
				/>
			</div>
		{/if}
		<br />
		<br />
		<div class="flex flex-row items-center cursor-pointer" on:click={() => (localisationOverrides = !localisationOverrides)}>
			<h4 class="flex-grow">Localisation overrides</h4>
			<div class:spin={localisationOverrides} class:spinBack={!localisationOverrides}>
				<Icon icon={faChevronDown} />
			</div>
		</div>
		{#if localisationOverrides}
			<div transition:slide>
				{#each Object.entries(source.localisationOverrides || {}) as [hash, locData] (hash)}
					<h3 class="mt-4">{hash}</h3>
					<LocalisationEditor
						source={locData}
						on:define={({ detail }) => {
							dispatch("localisationOverrideValue-define", { ...detail, hash })
						}}
						on:undefine={({ detail }) => {
							dispatch("localisationOverrideValue-undefine", { ...detail, hash })
						}}
					/>
					<br />
				{/each}
				<br />
				<Button
					kind="primary"
					icon={Edit}
					on:click={() => {
						localisationOverridesNewFileModalOpen = true
					}}
				>
					Override a localisation file
				</Button>
			</div>
		{/if}
		<br />
		<br />
		<div class="flex flex-row items-center cursor-pointer" on:click={() => (localisedLines = !localisedLines)}>
			<h4 class="flex-grow">Localised lines</h4>
			<div class:spin={localisedLines} class:spinBack={!localisedLines}>
				<Icon icon={faChevronDown} />
			</div>
		</div>
		{#if localisedLines}
			<div transition:slide>
				<KeyValueEditor
					data={source.localisedLines || {}}
					on:define={({ detail }) => {
						dispatch("localisedLine-define", detail)
					}}
					on:undefine={({ detail }) => {
						dispatch("localisedLine-undefine", detail)
					}}
				/>
			</div>
		{/if}
	</div>
{/if}

<br />

<div class="flex flex-row items-center cursor-pointer" on:click={() => (other = !other)}>
	<h2 class="flex-grow">Other</h2>
	<div class:spin={other} class:spinBack={!other}>
		<Icon icon={faChevronDown} />
	</div>
</div>
{#if other}
	<div transition:slide>
		<br />
		<div class="flex flex-row items-center cursor-pointer" on:click={() => (packagedefinition = !packagedefinition)}>
			<h4 class="flex-grow">Package definition</h4>
			<div class:spin={packagedefinition} class:spinBack={!packagedefinition}>
				<Icon icon={faChevronDown} />
			</div>
		</div>
		{#if packagedefinition}
			<div transition:slide>
				<br />
				<h5>Partitions</h5>
				<br />
				<table class="table-auto border-collapse bg-slate-200">
					<thead class="bg-neutral-900">
						<tr>
							<th class="font-medium p-4 pl-8 pb-3 text-slate-200 text-left">Name</th>
							<th class="font-medium p-4 px-8 pb-3 text-slate-200 text-left">Parent</th>
							<th class="font-medium p-4 pr-8 pb-3 text-slate-200 text-left">Type</th>
						</tr>
					</thead>
					<tbody>
						{#each (source.packagedefinition || []).filter((a) => a.type == "partition") as { name, parent, partitionType }, index (name)}
							<tr class:border-b={index != (source.packagedefinition || []).filter((a) => a.type == "partition").length - 1} class="border-solid border-b-black">
								<td class="p-4 pl-8 text-slate-800">
									<div class="flex flex-row gap-4 items-center">
										<code class="flex-grow">{name}</code>
										<Button
											kind="ghost"
											size="small"
											icon={Edit}
											iconDescription="Edit name"
											on:click={() => {
												pdefValueToEdit = name + "$:$" + "name"
												pdefValueToEditPlaceholder = name
												pdefEditModalOpen = true
											}}
										/>
									</div>
								</td>
								<td class="p-4 px-8 text-slate-800">
									<div class="flex flex-row gap-4 items-center">
										<code class="flex-grow">{parent}</code>
										<Button
											kind="ghost"
											size="small"
											icon={Edit}
											iconDescription="Edit parent"
											on:click={() => {
												pdefValueToEdit = name + "$:$" + "parent"
												pdefValueToEditPlaceholder = parent
												pdefEditModalOpen = true
											}}
										/>
									</div>
								</td>
								<td class="p-4 pr-8 text-slate-800">
									<div class="flex flex-row gap-4 items-center">
										<code class="flex-grow">{partitionType}</code>
										<Button
											kind="ghost"
											size="small"
											icon={Edit}
											iconDescription="Edit type"
											on:click={() => {
												pdefValueToEdit = name + "$:$" + "partitionType"
												pdefValueToEditPlaceholder = partitionType
												pdefEditModalOpen = true
											}}
										/>
										<Button
											kind="ghost"
											size="small"
											icon={CloseOutline}
											iconDescription="Remove partition"
											on:click={() => {
												dispatch("pdefPartition-undefine", {
													partition: name
												})
											}}
										/>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<br />
				<Button
					kind="primary"
					icon={Edit}
					on:click={() => {
						pdefValueToEdit = "newlyAddedPartition" + "$:$" + "parent"
						pdefValueToEditPlaceholder = "Parent"
						pdefEditModalOpen = true
					}}
				>
					Add a partition
				</Button>
				<br />
				<br />
				<h5>Entities</h5>
				<br />
				<table class="table-auto border-collapse bg-slate-200">
					<thead class="bg-neutral-900">
						<tr>
							<th class="font-medium p-4 pl-8 pb-3 text-slate-200 text-left">Partition</th>
							<th class="font-medium p-4 px-8 pb-3 text-slate-200 text-left">Path</th>
						</tr>
					</thead>
					<tbody>
						{#each (source.packagedefinition || []).filter((a) => a.type == "entity") as { partition, path }, index (path)}
							<tr class:border-b={index != (source.packagedefinition || []).filter((a) => a.type == "entity").length - 1} class="border-solid border-b-black">
								<td class="p-4 pl-8 text-slate-800">
									<div class="flex flex-row gap-4 items-center">
										<code class="flex-grow">{partition}</code>
										<Button
											kind="ghost"
											size="small"
											icon={Edit}
											iconDescription="Edit value"
											on:click={() => {
												pdefValueToEdit = partition + "|" + path + "$:$" + "partition"
												pdefValueToEditPlaceholder = partition
												pdefEditModalOpen = true
											}}
										/>
									</div>
								</td>
								<td class="p-4 px-8 text-slate-800">
									<div class="flex flex-row gap-4 items-center">
										<code class="flex-grow">{path}</code>
										<Button
											kind="ghost"
											size="small"
											icon={Edit}
											iconDescription="Edit value"
											on:click={() => {
												pdefValueToEdit = partition + "|" + path + "$:$" + "path"
												pdefValueToEditPlaceholder = path
												pdefEditModalOpen = true
											}}
										/>
										<Button
											kind="ghost"
											size="small"
											icon={CloseOutline}
											iconDescription="Remove entity"
											on:click={() => {
												dispatch("pdefEntity-undefine", {
													entity: partition + "|" + path
												})
											}}
										/>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<br />
				<Button
					kind="primary"
					icon={Edit}
					on:click={() => {
						pdefValueToEdit = "super|Placeholder value" + "$:$" + "partition"
						pdefValueToEditPlaceholder = "Partition"
						pdefEditModalOpen = true
					}}
				>
					Add an entity
				</Button>
			</div>
		{/if}
	</div>
{/if}

<TextInputModal
	bind:this={localisationOverridesNewFileModal}
	bind:showingModal={localisationOverridesNewFileModalOpen}
	modalText="Override another localisation file"
	modalPlaceholder=""
	modalInitialText=""
	on:close={() => {
		if (localisationOverridesNewFileModal.value && localisationOverridesNewFileModal.value.length) {
			dispatch("localisationOverrideValue-define", {
				hash: localisationOverridesNewFileModal.value,
				language: "english",
				key: "123456789",
				value: "Placeholder value"
			})
		}
	}}
/>

<TextInputModal
	bind:this={pdefEditModal}
	bind:showingModal={pdefEditModalOpen}
	modalText="Edit {pdefValueToEdit.split('$:$')[1]}"
	modalPlaceholder={pdefValueToEditPlaceholder}
	modalInitialText={pdefValueToEditPlaceholder}
	on:close={() => {
		if (pdefEditModal.value && pdefEditModal.value.length) {
			if (pdefValueToEdit.split("|").length == 2) {
				dispatch("pdefEntity-define", {
					entity: pdefValueToEdit.split("$:$")[0],
					key: pdefValueToEdit.split("$:$")[1],
					value: pdefEditModal.value
				})
			} else {
				dispatch("pdefPartition-define", {
					partition: pdefValueToEdit.split("$:$")[0],
					key: pdefValueToEdit.split("$:$")[1],
					value: pdefEditModal.value
				})
			}
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

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(180deg);
		}
	}

	@keyframes spinBack {
		from {
			transform: rotate(180deg);
		}
		to {
			transform: rotate(0deg);
		}
	}

	.spin {
		animation: spin 0.5s;
		animation-fill-mode: forwards;
	}

	.spinBack {
		animation: spinBack 0.5s;
		animation-fill-mode: forwards;
	}
</style>
