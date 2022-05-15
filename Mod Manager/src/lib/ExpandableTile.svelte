<script lang="ts">
	import { Tile } from "carbon-components-svelte"

	import Icon from "svelte-fa"
	import { faChevronDown } from "@fortawesome/free-solid-svg-icons"

	import { scale } from "svelte/transition"
	import { onMount } from "svelte"
	import { v4 } from "uuid"

	export let initiallyOpen = false

	export let open = false
	let clicked = false

	let elementID = "tile" + v4().replaceAll("-", "")

	if (initiallyOpen) {
		clicked = true
		open = true
		onMount(() =>
			document.getElementById(elementID)?.scrollIntoView({
				behavior: "smooth"
			})
		)
	}
</script>

<div transition:scale>
	<Tile>
		<div class="px-1" id={elementID}>
			<div
				class="flex w-full items-center cursor-pointer"
				on:click={() => {
					open = !open
					clicked = true
				}}
			>
				<div class="flex-grow">
					<slot name="heading" />
				</div>
				<div class:spin={clicked && open} class:spinBack={clicked && !open}>
					<Icon icon={faChevronDown} />
				</div>
			</div>
			{#if !open}
				<div class="mt-1">
					<slot name="closedContent" />
				</div>
			{/if}
			{#if open}
				<br />
				<div>
					<slot name="content" />
				</div>
			{/if}
		</div>
	</Tile>
</div>

<style>
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
		animation: spin 0.25s;
		animation-fill-mode: forwards;
	}

	.spinBack {
		animation: spinBack 0.25s;
		animation-fill-mode: forwards;
	}
</style>
