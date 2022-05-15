<script lang="ts">
	import { Tile } from "carbon-components-svelte"
	import type { Manifest } from "../../../src/types"

	export let isFrameworkMod: boolean

	export let manifest: Manifest = {} as Manifest
	export let rpkgModName: string = ""
</script>

<Tile>
	<div class="flex flex-row items-center gap-8">
		<div class="flex-grow">
			{#if isFrameworkMod}
				<span class="text-xs">{manifest.authors.length == 1 ? manifest.authors.join(", ") : manifest.authors.slice(0, -1).join(", ") + " and " + manifest.authors.at(-1)}</span>
				<h4 class="mb-1 overflow-x-auto w-full">
					{manifest.name}
				</h4>
				{manifest.description}
			{:else}
				<h4 class="mb-1 overflow-x-auto w-full">
					{rpkgModName}
				</h4>
				RPKG-only mod
			{/if}
		</div>
		<div class="flex-shrink-0">
			<slot />
		</div>
	</div>
</Tile>
