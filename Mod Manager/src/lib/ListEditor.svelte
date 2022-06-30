<script lang="ts">
	import { Button } from "carbon-components-svelte"

	import CloseOutline from "carbon-icons-svelte/lib/CloseOutline.svelte"
	import Edit from "carbon-icons-svelte/lib/Edit.svelte"
	import AddAlt from "carbon-icons-svelte/lib/AddAlt.svelte"

	import { createEventDispatcher } from "svelte"

	import TextInputModal from "$lib/TextInputModal.svelte"

	const dispatch = createEventDispatcher()

	export let data: string[]

	let newValueInputModal: TextInputModal
	let newValueInputModalOpen = false
	let valueToEdit = ""
</script>

<br />
<table class="table-auto border-collapse bg-slate-200">
	<tbody>
		{#each data as value, index (value)}
			<tr class:border-b={index != data.length - 1} class="border-solid border-b-black">
				<td class="p-4 px-8 text-slate-800">
					<div class="flex flex-row gap-4 items-center">
						<code class="flex-grow">{value}</code>
						<Button
							kind="ghost"
							size="small"
							icon={Edit}
							iconDescription="Edit value"
							on:click={() => {
								valueToEdit = value
								newValueInputModalOpen = true
							}}
						/>
						<Button
							kind="ghost"
							size="small"
							icon={CloseOutline}
							iconDescription="Remove value"
							on:click={() => {
								dispatch("undefine", {
									value
								})
							}}
						/>
					</div>
				</td>
			</tr>
		{/each}
		{#if data.length == 0}
			<tr class="border-solid border-b-black">
				<td class="p-4 px-8 text-slate-800">
					<div class="flex flex-row gap-4 items-center">
						<code class="flex-grow">No entries</code>
					</div>
				</td>
			</tr>
		{/if}
	</tbody>
</table>
<br />
<div class="text-white">
	<Button
		kind="primary"
		icon={AddAlt}
		on:click={() => {
			valueToEdit = "Placeholder value"
			newValueInputModalOpen = true
		}}
	>
		Add an entry
	</Button>
</div>

<TextInputModal
	bind:this={newValueInputModal}
	bind:showingModal={newValueInputModalOpen}
	modalText="Edit {`"${valueToEdit}"`}"
	modalPlaceholder={valueToEdit}
	modalInitialText={valueToEdit}
	on:close={() => {
		if (newValueInputModal.value && newValueInputModal.value.length) {
			dispatch("define", {
				original: valueToEdit,
				new: newValueInputModal.value
			})
		}
	}}
/>
