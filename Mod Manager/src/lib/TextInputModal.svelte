<svelte:options accessors />

<script lang="ts">
	import { Modal, TextInput } from "carbon-components-svelte"

	let modalInput: HTMLInputElement

	export let showingModal: boolean
	export let modalText: string
	export let modalPlaceholder: string

	export let value = ""
</script>

<Modal
	passiveModal
	bind:open={showingModal}
	modalHeading={modalText}
	on:open={() => {
		modalInput.focus()
	}}
	on:close
>
	<TextInput
		hideLabel
		bind:value
		bind:ref={modalInput}
		labelText={modalText}
		placeholder={modalPlaceholder}
		on:keydown={(e) => {
			if (e.key === "Enter") {
				showingModal = false
			}
		}}
	/>
</Modal>
