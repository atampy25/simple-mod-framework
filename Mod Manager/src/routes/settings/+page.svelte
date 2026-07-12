<script lang="ts">
	import { page } from "$app/stores"
	import { onMount } from "svelte"

	import ExpandableTile from "$lib/ExpandableTile.svelte"
	import CacheLoading from "$lib/CacheLoading.svelte"
	import { getConfig, getManifestFromModID, getModFolder, mergeConfig, modIsFramework, preloadModsCache } from "$lib/utils"
	import { Checkbox, RadioButtonGroup, RadioButton, Truncate } from "carbon-components-svelte"
	import { scale } from "svelte/transition"
	import { OptionType, type Manifest } from "../../../../src/types"

	import tippyjs from "tippy.js"
	import "tippy.js/dist/tippy.css"

	function staticTippy(node: HTMLElement, options: any) {
		if (!options) return
		const instance = tippyjs(node, options)
		return {
			destroy() {
				instance.destroy()
			}
		}
	}

	let config: any = null
	let mods: any[] = []
	const columns: [any[], any[], any[]] = [[], [], []]
	let selectedMod: string | null = null
	let groupOptions: Record<string, Record<string, any[]>> = {}
	let cacheLoaded = false
	let cacheLoadError = ""

	if ($page.url.searchParams.get("mod")) selectedMod = $page.url.searchParams.get("mod")

	async function preloadCache() {
		cacheLoaded = false
		cacheLoadError = ""
		try {
			await preloadModsCache("settings")

			config = getConfig()
			mods = config.loadOrder
				.filter((a: string) => modIsFramework(a) && config.modOptions[a])
				.map((a: string) => getManifestFromModID(a))
				.filter((a: any) => a && a.options && a.options.filter((x: any) => x.type != OptionType.conditional).length)

			let column = 0
			columns[0].length = 0
			columns[1].length = 0
			columns[2].length = 0
			for (const mod of mods) {
				columns[column as 0 | 1 | 2].push(mod)

				column++
				if (column > 2) column = 0
			}

			mods.forEach((mod) => {
				groupOptions[mod.id] = {}

				mod.options?.forEach((opt: any) => {
					const option = opt as any
					if (option.type == "select") {
						groupOptions[mod.id][option.group] ??= []
						groupOptions[mod.id][option.group]?.push(option)
					}
				})
			})
			cacheLoaded = true
		} catch (err: any) {
			console.error("Failed to load settings:", err)
			cacheLoadError = err?.message || "Failed to load mod settings."
		}
	}

	onMount(() => {
		preloadCache()
	})

	function getCheckboxOptions(options: any[] | undefined) {
		return (options || []).filter((a) => a.type === "checkbox") as any[]
	}

	function getTippyOptions(option: any, modId: string) {
		if (!option || (!option.tooltip && !option.image)) return null
		return {
			content: (reference: HTMLElement) => {
				if (!option.image) return option.tooltip

				let elem = document.createElement("div")
				let text = document.createElement("span")
				text.innerText = option.tooltip || ""
				let img = document.createElement("img")
				img.src = window.path.join(getModFolder(modId), option.image)
				elem.appendChild(img)
				elem.appendChild(document.createElement("br"))
				elem.appendChild(text)

				return elem
			},
			placement: "left" as const
		}
	}

	function handleCheckboxChange(modId: string, optionName: string, event: Event) {
		const target = event.target as HTMLInputElement
		setCheckboxOption(modId, optionName, target.checked)
	}

	function setSelectOption(mod: string, group: string, option: string) {
		let workingConfig = getConfig()
		const items = workingConfig.modOptions[mod].filter((a) => (a.split(":").length > 1 ? a.split(":")[0] != group : true))
		items.push(group + ":" + option)

		mergeConfig({
			modOptions: {
				[mod]: items
			}
		})

		config = getConfig()
	}

	function setCheckboxOption(mod: string, option: string, value: boolean) {
		let workingConfig = getConfig()
		const items = workingConfig.modOptions[mod].filter((a) => (a.split(":").length > 1 ? true : a != option))
		if (value) items.push(option)

		mergeConfig({
			modOptions: {
				[mod]: items
			}
		})

		config = getConfig()
	}

	function getModOptionsText(modId: string): string {
		if (!config || !config.modOptions[modId] || !config.modOptions[modId].length) {
			return "No options enabled"
		}
		return config.modOptions[modId].map((a: string) => (a.split(":").length > 1 ? a.split(":").join(": ") : a)).join(", ")
	}
</script>

{#if !cacheLoaded}
	<CacheLoading loading={!cacheLoaded} error={cacheLoadError} retryCallback={preloadCache} loadingText="Loading mod settings..." buildingText="Still building cache 💅" />
{:else}
	<h1 class="text-center" transition:scale>Mod Settings</h1>
	<br />
	<div class="grid grid-cols-3 gap-4 w-full h-[90vh] mb-16 overflow-y-auto">
		{#each columns as column, index (column)}
			<div class="w-full">
				{#each columns[index] as mod (mod.id)}
					<ExpandableTile initiallyOpen={mod.id == selectedMod}>
						<h3 slot="heading">{mod.name}</h3>
						<span slot="closedContent">
							<Truncate>
								{getModOptionsText(mod.id)}
							</Truncate>
						</span>
						<div slot="content">
							{#each getCheckboxOptions(mod.options) as option}
								<div use:staticTippy={getTippyOptions(option, mod.id)}>
									<Checkbox
										labelText={option.name}
										checked={config.modOptions[mod.id].includes(option.name)}
										on:change={(e) => handleCheckboxChange(mod.id, option.name, e)}
									/>
								</div>
							{/each}
							{#each Object.entries(groupOptions[mod.id] || {}) as [group, options]}
								<span class="text-lg font-semibold">{group}</span>
								<br />
								<RadioButtonGroup
									selected={options.find((a) => config.modOptions[mod.id].includes(group + ":" + a.name))?.name}
									on:change={({ detail }) => setSelectOption(mod.id, group, detail)}
								>
									{#each options as option}
										<div
											class="bx--radio-button-wrapper"
											use:staticTippy={getTippyOptions(option, mod.id)}
										>
											<RadioButton value={option.name} labelText={option.name} />
										</div>
									{/each}
								</RadioButtonGroup>
								<br />
							{/each}
						</div>
					</ExpandableTile>
					<br />
				{/each}
			</div>
		{/each}
	</div>
{/if}

<style global>
	.bx--radio-button-group {
		flex-wrap: wrap;
		row-gap: 0.2rem;
	}
</style>
