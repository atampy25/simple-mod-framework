<script lang="ts">
	import { Tile } from "carbon-components-svelte"
	import WarningAlt from "carbon-icons-svelte/lib/WarningAlt.svelte"
	import Error from "carbon-icons-svelte/lib/Error.svelte"

	import type { Manifest } from "../../../src/types"
	import { FrameworkVersion, getConfig, getModFolder, validateModFolder } from "./utils"

	import semver from "semver"
	import { goto } from "$app/navigation"

	export let isFrameworkMod: boolean

	export let manifest: Manifest = {} as Manifest
	export let rpkgModName: string = ""

	export let darken: boolean = false

	const modValidation = isFrameworkMod ? validateModFolder(getModFolder(manifest.id)) : [true, ""]
</script>

<Tile style={darken ? "filter: brightness(0.75); transition: 250ms filter" : "transition: 250ms filter"}>
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
					style="cursor: pointer"
					on:click={() => {
						const m = JSON.parse(JSON.stringify(manifest))

						if (m.contentFolder) {
							m.contentFolders = [m.contentFolder]
							delete m.contentFolder
						}

						if (m.blobsFolder) {
							m.blobsFolders = [m.blobsFolder]
							delete m.blobsFolder
						}

						if (m.dependencies) {
							for (const dependency of m.dependencies) {
								if (typeof dependency != "string") {
									dependency.toChunk = Number(dependency.toChunk.replace("chunk", ""))
								}
							}
						}

						if (m.options) {
							for (const option of m.options) {
								if (option.contentFolder) {
									option.contentFolders = [option.contentFolder]
									delete option.contentFolder
								}

								if (option.blobsFolder) {
									option.blobsFolders = [option.blobsFolder]
									delete option.blobsFolder
								}

								if (option.dependencies) {
									for (const dependency of option.dependencies) {
										if (typeof dependency != "string") {
											dependency.toChunk = Number(dependency.toChunk.replace("chunk", ""))
										}
									}
								}

								if (option.type == "requirement") {
									option.type = "conditional"
									option.condition = option.mods.map((mod) => `"${mod}" in config.loadOrder`).join(" and ")
									delete option.mods
								}
							}
						}

						m.frameworkVersion = "2.0.0"

						window.fs.writeFileSync(window.path.join(getModFolder(manifest.id), "manifest.json"), JSON.stringify(m, null, "\t"))

						window.location.reload()
					}}
				>
					<span class="bx--assistive-text">This mod is designed for an earlier version of the framework; click to update it to work with the current version.</span>
					<Error color="black" />
				</div>
			{:else if isFrameworkMod && modValidation}
				{#if !modValidation[0]}
					<div
						on:click={() => {
							if (getConfig().developerMode) {
								goto(`/authoring/${manifest.id}`)
							}
						}}
						tabindex="0"
						aria-pressed="false"
						class="bx--btn bx--btn--ghost btn-error bx--btn--icon-only bx--tooltip__trigger bx--tooltip--a11y bx--btn--icon-only--bottom bx--tooltip--align-center"
						style="cursor: pointer"
					>
						<span class="bx--assistive-text">This mod will likely cause issues; {getConfig().developerMode ? "click to see more information" : "contact the mod developer"}</span>
						<Error color="black" />
					</div>
				{/if}
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
