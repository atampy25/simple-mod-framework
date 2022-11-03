<script lang="ts">
	import { page } from "$app/stores"

	import ExpandableTile from "$lib/ExpandableTile.svelte"
	import { getConfig, getManifestFromModID, getModFolder, mergeConfig, modIsFramework } from "$lib/utils"
	import { Checkbox, RadioButtonGroup, RadioButton, Truncate } from "carbon-components-svelte"
	import { scale } from "svelte/transition"
	import { OptionType, type Manifest } from "../../../src/types"

	import tippy from "svelte-tippy"
	import "tippy.js/dist/tippy.css"

	let config = getConfig()

	const mods = config.loadOrder
		.filter((a) => modIsFramework(a) && config.modOptions[a])
		.map((a) => getManifestFromModID(a))
		.filter((a) => a && a.options && a.options.filter((a) => a.type != OptionType.conditional).length)

	const columns: [Manifest[], Manifest[], Manifest[]] = [[], [], []]

	let selectedMod: string | null = null
	if ($page.url.searchParams.get("mod")) selectedMod = $page.url.searchParams.get("mod")

	let column = 0
	for (const mod of mods) {
		columns[column as 0 | 1 | 2].push(mod)

		column++
		if (column > 2) column = 0
	}

	let groupOptions: any = {}

	mods.forEach((mod) => {
		groupOptions[mod.id] = {}

		mod.options?.forEach((option) => {
			if (option.type == "select") {
				groupOptions[mod.id][option.group] ??= []
				groupOptions[mod.id][option.group]?.push(option)
			}
		})
	})

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

	function setCheckboxOption(mod: string, option: string, value: string) {
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
</script>

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
							{!config.modOptions[mod.id].length ? "No options enabled" : config.modOptions[mod.id].map((a) => (a.split(":").length > 1 ? a.split(":").join(": ") : a)).join(", ")}
						</Truncate>
					</span>
					<div slot="content">
						{#each mod.options.filter((a) => a.type == "checkbox") as option}
							<div
								use:tippy={option?.tooltip || option?.image
									? {
											content: (reference) => {
												if (!option.image) return option.tooltip

												let elem = document.createElement("div")
												let text = document.createElement("span")
												text.innerText = option.tooltip
												let img = document.createElement("img")
												img.src = window.path.join(getModFolder(mod.id), option.image)
												elem.appendChild(img)
												elem.appendChild(document.createElement("br"))
												elem.appendChild(text)

												return elem
											},
											placement: "left"
									  }
									: { content: undefined, delay: 9999999999999999 }}
							>
								<Checkbox
									labelText={option.name}
									checked={config.modOptions[mod.id].includes(option.name)}
									on:change={({ target: { checked } }) => setCheckboxOption(mod.id, option.name, checked)}
								/>
							</div>
						{/each}
						{#each Object.entries(groupOptions[mod.id]) as [group, options]}
							<span class="text-lg font-semibold">{group}</span>
							<br />
							<RadioButtonGroup
								selected={options.find((a) => config.modOptions[mod.id].includes(group + ":" + a.name))?.name}
								on:change={({ detail }) => setSelectOption(mod.id, group, detail)}
							>
								{#each options as option}
									<div
										class="bx--radio-button-wrapper"
										use:tippy={option?.tooltip || option?.image
											? {
													content: (reference) => {
														if (!option.image) return option.tooltip

														let elem = document.createElement("div")
														let text = document.createElement("span")
														text.innerText = option.tooltip
														let img = document.createElement("img")
														img.src = window.path.join(getModFolder(mod.id), option.image)
														elem.appendChild(img)
														if (option.tooltip) elem.appendChild(document.createElement("br"))
														if (option.tooltip) elem.appendChild(text)

														return elem
													}
											  }
											: { content: undefined, delay: 9999999999999999 }}
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

<style global>
	.bx--radio-button-group {
		flex-wrap: wrap;
		row-gap: 0.2rem;
	}
</style>
