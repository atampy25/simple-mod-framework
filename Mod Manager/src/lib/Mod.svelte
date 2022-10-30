<script lang="ts">
	import { Tile } from "carbon-components-svelte"
	import WarningAlt from "carbon-icons-svelte/lib/WarningAlt.svelte"
	import Error from "carbon-icons-svelte/lib/Error.svelte"

	import type { Manifest } from "../../../src/types"
	import { FrameworkVersion, getAllModWarnings } from "./utils"

	import semver from "semver"

	export let isFrameworkMod: boolean

	export let manifest: Manifest = {} as Manifest
	export let rpkgModName: string = ""

	let modWarnings: Promise<{ title: string; subtitle: string; trace: string }[]>
	setTimeout(() => (modWarnings = getAllModWarnings()), 100)
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
			{#if isFrameworkMod && semver.lt(manifest.frameworkVersion, FrameworkVersion) && semver.diff(manifest.frameworkVersion, FrameworkVersion) == "major"}
				<div
					tabindex="0"
					aria-pressed="false"
					class="bx--btn bx--btn--ghost btn-error bx--btn--icon-only bx--tooltip__trigger bx--tooltip--a11y bx--btn--icon-only--bottom bx--tooltip--align-center"
				>
					<span class="bx--assistive-text">This mod is designed for an earlier version of the framework; it must be updated to work with the new framework</span>
					<Error color="black" />
				</div>
			{:else if isFrameworkMod && modWarnings}
				{#await modWarnings then warnings}
					{#if warnings[manifest.id].some((a) => a.type == "error")}
						<div
							tabindex="0"
							aria-pressed="false"
							class="bx--btn bx--btn--ghost btn-error bx--btn--icon-only bx--tooltip__trigger bx--tooltip--a11y bx--btn--icon-only--bottom bx--tooltip--align-center"
						>
							<span class="bx--assistive-text">This mod will likely cause issues; contact the mod developer</span>
							<Error color="black" />
						</div>
					{:else if warnings[manifest.id].some((a) => a.type == "warning")}
						<div
							tabindex="0"
							aria-pressed="false"
							class="bx--btn bx--btn--ghost bx--btn--icon-only bx--tooltip__trigger bx--tooltip--a11y bx--btn--icon-only--bottom bx--tooltip--align-center"
						>
							<span class="bx--assistive-text">This mod may cause issues; contact the mod developer</span>
							<WarningAlt color="black" />
						</div>
					{/if}
				{/await}
			{/if}
			<slot />
		</div>
	</div>
</Tile>

<style>
	.bx--btn--ghost {
		background-color: rgb(255, 196, 0);
	}

	.btn-error {
		background-color: rgb(255, 60, 0);
	}

	.bx--btn.bx--btn--icon-only.bx--tooltip__trigger {
		cursor: default;
	}
</style>
