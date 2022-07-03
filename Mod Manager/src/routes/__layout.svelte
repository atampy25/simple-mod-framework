<script lang="ts">
	import "../app.css"
	import "carbon-components-svelte/css/g90.css"
	import { onMount } from "svelte"

	import Icon from "svelte-fa"
	import { faCog, faEdit, faHome, faInfoCircle, faList } from "@fortawesome/free-solid-svg-icons"

	let ready: boolean = false
	onMount(() => (ready = true))
</script>

{#if ready}
	<div class="flex flex-row h-screen w-screen">
		<div class="bg-neutral-900 w-16 h-full flex flex-col gap-16 items-center justify-center">
			<a href="/?doNotRunDiagnostics=1" sveltekit:reload class="text-white">
				<Icon icon={faHome} />
			</a>
			<a href="/modList" sveltekit:reload class="text-white">
				<Icon icon={faList} />
			</a>
			<a href="/settings" sveltekit:reload class="text-white">
				<Icon icon={faCog} />
			</a>
			<a href="/authoring" sveltekit:reload class="text-white">
				<Icon icon={faEdit} />
			</a>
			<a href="/info" sveltekit:reload class="text-white">
				<Icon icon={faInfoCircle} />
			</a>
		</div>
		<div class="col-span-11 px-16 py-8 w-full">
			<slot />
		</div>
	</div>
{/if}

<style>
	:global(.bx--content) {
		background-color: initial;
	}
</style>
