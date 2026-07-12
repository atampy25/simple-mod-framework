<script lang="ts">
	import { onDestroy } from "svelte"
	import { Loading, Button } from "carbon-components-svelte"

	export let loading = true
	export let error = ""
	export let retryCallback: (() => void) | null = null
	export let loadingText = "Loading mods cache..."
	export let buildingText = "Building cache..."
	export let mt8 = false

	let showBuildingCache = false
	let timer: any = null

	$: if (loading && !error) {
		clearTimeout(timer)
		showBuildingCache = false
		timer = setTimeout(() => {
			showBuildingCache = true
		}, 1500)
	} else {
		clearTimeout(timer)
		showBuildingCache = false
	}

	onDestroy(() => {
		clearTimeout(timer)
	})
</script>

<div class="flex flex-col items-center justify-center h-[80vh] w-full gap-4 {mt8 ? 'mt-8' : ''}">
	{#if error}
		<span class="text-red-400 text-sm font-semibold">{error}</span>
		{#if retryCallback}
			<Button size="small" kind="secondary" on:click={retryCallback}>
				Retry Loading
			</Button>
		{/if}
	{:else}
		<Loading withOverlay={false} />
		<span class="text-gray-400 text-sm">
			{showBuildingCache ? buildingText : loadingText}
		</span>
	{/if}
</div>
