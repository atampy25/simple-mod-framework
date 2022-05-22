<svelte:options accessors />

<script lang="ts">
	import { Modal, TextArea, TextInput } from "carbon-components-svelte"

	let modalInput: HTMLInputElement | HTMLTextAreaElement

	export let showingModal: boolean
	export let modalText: string
	export let modalPlaceholder: string
	export let modalInitialText = ""

	export let multiline = false

	export let value = ""
</script>

<Modal
	passiveModal
	bind:open={showingModal}
	modalHeading={modalText}
	on:open={() => {
		modalInput.value = modalInitialText
		modalInput.focus()
	}}
	on:close
>
	{#if multiline}
		<TextArea hideLabel bind:value bind:ref={modalInput} labelText={modalText} placeholder={modalPlaceholder} />
	{:else}
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
	{/if}
</Modal>
