<script lang="ts">
	import "../app.css"
	import "carbon-components-svelte/css/g90.css"

	import Icon from "svelte-fa"
	import { faBook, faCog, faEdit, faHome, faInfoCircle, faList } from "@fortawesome/free-solid-svg-icons"
	import { getConfig, preloadModsCache, configStore } from "$lib/utils"
	import { page, navigating } from "$app/stores"
	import { onDestroy, onMount } from "svelte"
	import { fade } from "svelte/transition"
	import { Loading } from "carbon-components-svelte"

	let developerMode = false

	let showTip = false
	let randomTip = ""
	let tipTimeout: any = null

	const tips = [
		"💡 Tip: Once the initial load is complete, subsequent loading times will be significantly reduced.",
		"💡 Tip: The framework caches loaded files, making future navigations much faster.",
		"💡 Tip: After loading this page for the first time, future visits will load almost instantly."
	]

	$: if ($navigating) {
		if (tipTimeout) clearTimeout(tipTimeout)
		showTip = false
		randomTip = tips[Math.floor(Math.random() * tips.length)]
		tipTimeout = setTimeout(() => {
			showTip = true
		}, 1000)
	} else {
		if (tipTimeout) {
			clearTimeout(tipTimeout)
			tipTimeout = null
		}
		showTip = false
	}

	let unsubscribeConfig: any = null

	onMount(async () => {
		await preloadModsCache("layout")
		try {
			getConfig()
		} catch {
			// config might not exist yet
		}
		unsubscribeConfig = configStore.subscribe((config) => {
			if (config) {
				developerMode = config.developerMode
			}
		})
	})

	onDestroy(() => {
		if (unsubscribeConfig) {
			unsubscribeConfig()
		}
	})

	window.ipc.receive("urlScheme", async (path: string) => {
		if (path.startsWith("install/")) {
			window.location.href = "/modList?urlScheme=" + encodeURIComponent(path.replace("install/", ""))
		} else if (path.startsWith("open-docs-page/")) {
			window.location.href = "/docs/" + path.replace("open-docs-page/", "")
		}
	})
</script>

<div class="flex flex-row h-screen w-screen">
	<div class="bg-neutral-900 w-16 h-full flex flex-col gap-16 items-center justify-center">
		<a href="/" class="text-white">
			<Icon icon={faHome} />
		</a>
		<a href="/modList" class="text-white">
			<Icon icon={faList} />
		</a>
		<a href="/settings" class="text-white">
			<Icon icon={faCog} />
		</a>
		{#if developerMode}
			<a href="/authoring" class="text-white">
				<Icon icon={faEdit} />
			</a>
			<a href="/docs/Index.md" class="text-white">
				<Icon icon={faBook} />
			</a>
		{/if}
		<a href="/info" class="text-white">
			<Icon icon={faInfoCircle} />
		</a>
	</div>
	<div class="col-span-11 px-16 py-8 w-full relative">
		{#if $navigating}
			<div class="absolute inset-0 bg-neutral-900/50 backdrop-blur-sm flex flex-col items-center justify-center z-50 gap-4">
				<Loading withOverlay={false} description="Loading page..." />
				{#if showTip}
					<span transition:fade class="text-gray-300 text-sm">{randomTip}</span>
				{/if}
			</div>
		{/if}
		<slot />
	</div>
</div>

<style>
	:global(.bx--content) {
		background-color: initial;
	}
</style>
