<script lang="ts">
	import { Button, Checkbox, TextInput } from "carbon-components-svelte"
	import { slide } from "svelte/transition"
	import Icon from "svelte-fa"

	import CloseOutline from "carbon-icons-svelte/lib/CloseOutline.svelte"
	import Edit from "carbon-icons-svelte/lib/Edit.svelte"

	import { faChevronDown } from "@fortawesome/free-solid-svg-icons"

	import { createEventDispatcher } from "svelte"

	import { Platform, type ManifestOptionData } from "../../../packages/cli/src/types"

	import LocalisationEditor from "$lib/LocalisationEditor.svelte"
	import TextInputModal from "$lib/TextInputModal.svelte"
	import KeyValueEditor from "$lib/KeyValueEditor.svelte"
	import ListEditor from "$lib/ListEditor.svelte"

	const dispatch = createEventDispatcher()

	export let source: ManifestOptionData
	export let modRoot: string

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

	let runtimePackages = true // section

	let runtimePackagesValueToEdit = {} as { chunk: number; path: string }
	let runtimePackagesValueToEditPlaceholder = 0
	let runtimePackagesEditChunkModalOpen = false
	let runtimePackagesEditChunkModal: TextInputModal

	window.ipc.receive("runtimePackageOpenDialogResult", (runtimePackagePopupResult: string[] | undefined) => {
		if (!runtimePackagePopupResult) {
			return
		}

		dispatch("runtimePackage-define", {
			type: "definePath",
			origChunk: runtimePackagesValueToEdit.chunk,
			origPath: runtimePackagesValueToEdit.path,
			newPath: window.path.relative(modRoot, runtimePackagePopupResult[0])
		})
	})

	let dependencies = true // section

	let dependenciesValueToEdit = {} as { runtimeID: string; toChunk: number; portFromChunk1: boolean; valueToEdit: string }
	let dependenciesValueToEditPlaceholder = ""
	let dependenciesEditModalOpen = false
	let dependenciesEditModal: TextInputModal

	let thumbs = true // section

	let compatibility = true // section
	let supportedPlatforms = true // section
	let requirements = true // section
	let loadBefore = true // section
	let loadAfter = true // section
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
					labelText="Content folders (folder1, folder2)"
					placeholder={source.contentFolders?.join(", ") || "Not defined"}
					bind:ref={contentFolderInput}
					on:input={() => {
						contentFolderInputChanged = !!contentFolderInput.value.length
					}}
				/>
				<br />
				{#if source.contentFolders}
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
					labelText="Blobs folder (folder1, folder2)"
					placeholder={source.blobsFolders?.join(", ") || "Not defined"}
					bind:ref={blobsFolderInput}
					on:input={() => {
						blobsFolderInputChanged = !!blobsFolderInput.value.length
					}}
				/>
				<br />
				{#if source.blobsFolders}
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
		<br />
		<br />
		<!-- <div class="flex flex-row items-center cursor-pointer" on:click={() => (runtimePackages = !runtimePackages)}>
			<h4 class="flex-grow">Runtime packages</h4>
			<div class:spin={runtimePackages} class:spinBack={!runtimePackages}>
				<Icon icon={faChevronDown} />
			</div>
		</div>
		{#if runtimePackages}
			<div transition:slide>
				<br />
				<table class="table-auto border-collapse bg-slate-200">
					<thead class="bg-neutral-900">
						<tr>
							<th class="font-medium p-4 pl-8 pb-3 text-slate-200 text-left">Chunk</th>
							<th class="font-medium p-4 px-8 pb-3 text-slate-200 text-left">Path</th>
						</tr>
					</thead>
					<tbody>
						{#each source.runtimePackages || [] as { chunk, path }, index (chunk + path)}
							<tr class:border-b={index != (source.runtimePackages || []).length - 1} class="border-solid border-b-black">
								<td class="p-4 px-8 text-slate-800">
									<div class="flex flex-row gap-4 items-center">
										<code class="flex-grow">{path}</code>
										<Button
											kind="ghost"
											size="small"
											icon={Edit}
											iconDescription="Edit value"
											on:click={() => {
												runtimePackagesValueToEdit = { chunk, path }
												window.ipc.send("runtimePackageOpenDialog")
											}}
										/>
									</div>
								</td>
								<td class="p-4 pl-8 text-slate-800">
									<div class="flex flex-row gap-4 items-center">
										<code class="flex-grow">{chunk}</code>
										<Button
											kind="ghost"
											size="small"
											icon={Edit}
											iconDescription="Edit value"
											on:click={() => {
												runtimePackagesValueToEdit = { chunk, path }
												runtimePackagesValueToEditPlaceholder = chunk
												runtimePackagesEditChunkModalOpen = true
											}}
										/>
										<Button
											kind="ghost"
											size="small"
											icon={CloseOutline}
											iconDescription="Remove runtime package"
											on:click={() => {
												dispatch("runtimePackage-undefine", { chunk, path })
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
						runtimePackagesValueToEdit = { chunk: 0, path: "Placeholder value" }
						window.ipc.send("runtimePackageOpenDialog")
					}}
				>
					Add a runtime package
				</Button>
			</div>
		{/if}
		<br />
		<br /> -->
		<div class="flex flex-row items-center cursor-pointer" on:click={() => (dependencies = !dependencies)}>
			<h4 class="flex-grow">Dependencies</h4>
			<div class:spin={dependencies} class:spinBack={!dependencies}>
				<Icon icon={faChevronDown} />
			</div>
		</div>
		{#if dependencies}
			<div transition:slide>
				<br />
				<table class="table-auto border-collapse bg-slate-200">
					<thead class="bg-neutral-900">
						<tr>
							<th class="font-medium p-4 pl-8 pb-3 text-slate-200 text-left">RuntimeID</th>
							<th class="font-medium p-4 px-8 pb-3 text-slate-200 text-left">Extract to chunk</th>
							<th class="font-medium p-4 px-8 pb-3 text-slate-200 text-left">Port from chunk1?</th>
						</tr>
					</thead>
					<tbody>
						{#each (source.dependencies || []).map((a) => {
							return typeof a == "string" ? { runtimeID: a, toChunk: 0, portFromChunk1: false } : a
						}) as { runtimeID, toChunk, portFromChunk1 }, index (runtimeID + toChunk)}
							<tr class:border-b={index != (source.dependencies || []).length - 1} class="border-solid border-b-black">
								<td class="p-4 pl-8 text-slate-800">
									<div class="flex flex-row gap-4 items-center">
										<code class="flex-grow">{runtimeID}</code>
										<Button
											kind="ghost"
											size="small"
											icon={Edit}
											iconDescription="Edit value"
											on:click={() => {
												dependenciesValueToEdit = { runtimeID, toChunk: toChunk || 0, portFromChunk1: portFromChunk1 || false, valueToEdit: "runtimeID" }
												dependenciesValueToEditPlaceholder = runtimeID
												dependenciesEditModalOpen = true
											}}
										/>
									</div>
								</td>
								<td class="p-4 pl-8 text-slate-800">
									<div class="flex flex-row gap-4 items-center">
										<code class="flex-grow">{toChunk || 0}</code>
										<Button
											kind="ghost"
											size="small"
											icon={Edit}
											iconDescription="Edit value"
											on:click={() => {
												dependenciesValueToEdit = { runtimeID, toChunk: toChunk || 0, portFromChunk1: portFromChunk1 || false, valueToEdit: "toChunk" }
												dependenciesValueToEditPlaceholder = String(toChunk || 0)
												dependenciesEditModalOpen = true
											}}
										/>
									</div>
								</td>
								<td class="p-4 px-8 text-slate-800">
									<div class="flex flex-row gap-4 items-center">
										<code class="flex-grow">{portFromChunk1 || false}</code>
										<Button
											kind="ghost"
											size="small"
											icon={Edit}
											iconDescription="Edit value"
											on:click={() => {
												dependenciesValueToEdit = { runtimeID, toChunk: toChunk || 0, portFromChunk1: portFromChunk1 || false, valueToEdit: "portFromChunk1" }
												dependenciesValueToEditPlaceholder = String(portFromChunk1 || false)
												dependenciesEditModalOpen = true
											}}
										/>
										<Button
											kind="ghost"
											size="small"
											icon={CloseOutline}
											iconDescription="Remove dependency"
											on:click={() => {
												dispatch("dependency-undefine", { runtimeID, toChunk, portFromChunk1 })
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
						dependenciesValueToEdit = { runtimeID: "00123456789ABCDE", toChunk: 0, portFromChunk1: false, valueToEdit: "runtimeID" }
						dependenciesValueToEditPlaceholder = "00123456789ABCDE"
						dependenciesEditModalOpen = true
					}}
				>
					Add a dependency
				</Button>
			</div>
		{/if}
		<br />
		<br />
		<div class="flex flex-row items-center cursor-pointer" on:click={() => (thumbs = !thumbs)}>
			<h4 class="flex-grow">Thumbs</h4>
			<div class:spin={thumbs} class:spinBack={!thumbs}>
				<Icon icon={faChevronDown} />
			</div>
		</div>
		{#if thumbs}
			<div transition:slide>
				<ListEditor
					data={source.thumbs || []}
					on:define={({ detail }) => {
						dispatch("thumbs-define", detail)
					}}
					on:undefine={({ detail }) => {
						dispatch("thumbs-undefine", detail)
					}}
				/>
			</div>
		{/if}
	</div>
{/if}

<br />

<div class="flex flex-row items-center cursor-pointer" on:click={() => (compatibility = !compatibility)}>
	<h2 class="flex-grow">Compatibility</h2>
	<div class:spin={compatibility} class:spinBack={!compatibility}>
		<Icon icon={faChevronDown} />
	</div>
</div>
{#if compatibility}
	<div transition:slide>
		<br />
		<div class="flex flex-row items-center cursor-pointer" on:click={() => (supportedPlatforms = !supportedPlatforms)}>
			<h4 class="flex-grow">Supported platforms</h4>
			<div class:spin={supportedPlatforms} class:spinBack={!supportedPlatforms}>
				<Icon icon={faChevronDown} />
			</div>
		</div>
		{#if supportedPlatforms}
			<div transition:slide>
				{#each Object.keys(Platform).filter((a) => typeof a == "string") as platform (platform)}
					<Checkbox
						checked={(source.supportedPlatforms || []).length == 0 || (source.supportedPlatforms || []).includes(platform)}
						labelText={platform.slice(0, 1).toUpperCase() + platform.slice(1)}
						on:change={({ target: { checked } }) => {
							dispatch("supportedPlatforms-alter", {
								platform,
								value: checked
							})
						}}
					/>
				{/each}
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

<TextInputModal
	bind:this={runtimePackagesEditChunkModal}
	bind:showingModal={runtimePackagesEditChunkModalOpen}
	modalText="Edit chunk{runtimePackagesValueToEdit.chunk} package"
	modalPlaceholder={String(runtimePackagesValueToEditPlaceholder)}
	modalInitialText={String(runtimePackagesValueToEditPlaceholder)}
	on:close={() => {
		if (runtimePackagesEditChunkModal.value && runtimePackagesEditChunkModal.value.length) {
			dispatch("runtimePackage-define", {
				type: "defineChunk",
				origChunk: runtimePackagesValueToEdit.chunk,
				origPath: runtimePackagesValueToEdit.path,
				newChunk: Number(runtimePackagesEditChunkModal.value)
			})
		}
	}}
/>

<TextInputModal
	bind:this={dependenciesEditModal}
	bind:showingModal={dependenciesEditModalOpen}
	modalText="Edit {dependenciesValueToEdit.runtimeID} {{ runtimeID: 'RuntimeID', toChunk: 'chunk', portFromChunk1: 'whether to port from chunk1' }[dependenciesValueToEdit.valueToEdit]}"
	modalPlaceholder={String(dependenciesValueToEditPlaceholder)}
	modalInitialText={String(dependenciesValueToEditPlaceholder)}
	on:close={() => {
		if (dependenciesEditModal.value && dependenciesEditModal.value.length) {
			if (dependenciesValueToEdit.valueToEdit == "runtimeID") {
				dispatch("dependency-define", {
					type: "defineRuntimeID",
					origToChunk: dependenciesValueToEdit.toChunk,
					origRuntimeID: dependenciesValueToEdit.runtimeID,
					origPortFromChunk1: dependenciesValueToEdit.portFromChunk1,
					newRuntimeID: dependenciesEditModal.value
				})
			} else if (dependenciesValueToEdit.valueToEdit == "toChunk") {
				dispatch("dependency-define", {
					type: "defineToChunk",
					origToChunk: dependenciesValueToEdit.toChunk,
					origRuntimeID: dependenciesValueToEdit.runtimeID,
					origPortFromChunk1: dependenciesValueToEdit.portFromChunk1,
					newToChunk: Number(dependenciesEditModal.value)
				})
			} else if (dependenciesValueToEdit.valueToEdit == "portFromChunk1") {
				dispatch("dependency-define", {
					type: "definePortFromChunk1",
					origToChunk: dependenciesValueToEdit.toChunk,
					origRuntimeID: dependenciesValueToEdit.runtimeID,
					origPortFromChunk1: dependenciesValueToEdit.portFromChunk1,
					newPortFromChunk1: dependenciesEditModal.value == "true"
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
