<script lang="ts">
	import { Button } from "carbon-components-svelte"

	import CloseOutline from "carbon-icons-svelte/lib/CloseOutline.svelte"
	import Edit from "carbon-icons-svelte/lib/Edit.svelte"
	import AddAlt from "carbon-icons-svelte/lib/AddAlt.svelte"

	import { createEventDispatcher } from "svelte"

	import TextInputModal from "$lib/TextInputModal.svelte"

	const dispatch = createEventDispatcher()

	export let data: Record<string, string>

	let newKeyInputModal: TextInputModal
	let newKeyInputModalOpen = false

	let newValueInputModal: TextInputModal
	let newValueInputModalOpen = false
	let valueToEdit = ""
</script>

<br />
<table class="table-auto border-collapse bg-slate-200">
	<thead class="bg-neutral-900">
		<tr>
			<th class="font-medium p-4 pl-8 pb-3 text-slate-200 text-left">Key</th>
			<th class="font-medium p-4 px-8 pb-3 text-slate-200 text-left">Value</th>
		</tr>
	</thead>
	<tbody>
		{#each Object.entries(data) as [key, value], index (key)}
			<tr class:border-b={index != Object.entries(data).length - 1} class="border-solid border-b-black">
				<td class="p-4 pl-8 text-slate-800">
					<code>{key}</code>
				</td>
				<td class="p-4 px-8 text-slate-800">
					<div class="flex flex-row gap-4 items-center">
						<code class="flex-grow">{value}</code>
						<Button
							kind="ghost"
							size="small"
							icon={Edit}
							iconDescription="Edit value"
							on:click={() => {
								valueToEdit = key
								newValueInputModalOpen = true
							}}
						/>
						<Button
							kind="ghost"
							size="small"
							icon={CloseOutline}
							iconDescription="Remove key"
							on:click={() => {
								dispatch("undefine", {
									key
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
<div class="text-white">
	<Button
		kind="primary"
		icon={AddAlt}
		on:click={() => {
			newKeyInputModalOpen = true
		}}
	>
		Add an entry
	</Button>
</div>

<TextInputModal
	bind:this={newKeyInputModal}
	bind:showingModal={newKeyInputModalOpen}
	modalText="Add a new key"
	modalPlaceholder=""
	modalInitialText=""
	on:close={() => {
		if (newKeyInputModal.value && newKeyInputModal.value.length) {
			dispatch("define", {
				key: newKeyInputModal.value,
				value: "UI_PLACEHOLDER_VALUE"
			})
		}
	}}
/>

<TextInputModal
	bind:this={newValueInputModal}
	bind:showingModal={newValueInputModalOpen}
	modalText="Edit the value for {valueToEdit}"
	modalPlaceholder={data[valueToEdit]}
	modalInitialText={data[valueToEdit]}
	multiline
	on:close={() => {
		if (newValueInputModal.value && newValueInputModal.value.length) {
			dispatch("define", {
				key: valueToEdit,
				value: newValueInputModal.value
			})
		}
	}}
/>
