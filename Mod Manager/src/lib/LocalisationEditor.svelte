<script lang="ts">
	import { Button } from "carbon-components-svelte"

	import CloseOutline from "carbon-icons-svelte/lib/CloseOutline.svelte"
	import Edit from "carbon-icons-svelte/lib/Edit.svelte"
	import AddAlt from "carbon-icons-svelte/lib/AddAlt.svelte"

	import { createEventDispatcher } from "svelte"

	import { Language, type ManifestOptionData } from "../../../packages/cli/src/types"

	import TextInputModal from "$lib/TextInputModal.svelte"

	const dispatch = createEventDispatcher()

	export let source: ManifestOptionData["localisation"]

	source = source as ManifestOptionData["localisation"] // to treat it as always defined (because it should be always defined)

	let localisationValueInputModal: TextInputModal
	let localisationValueInputModalOpen = false
	let localisationValueLanguage = ""
	let localisationValueToEdit = ""
	let localisationValueCurrent = ""

	let localisationKeyInputModal: TextInputModal
	let localisationKeyInputModalOpen = false
</script>

<br />
<table class="table-auto border-collapse bg-slate-200">
	<thead class="bg-neutral-900">
		<tr>
			<th class="font-medium p-4 pl-8 pb-3 text-slate-200 text-left">Key</th>
			<th class="font-medium p-4 px-8 pb-3 text-slate-200 text-left">Values</th>
		</tr>
	</thead>
	<tbody>
		<!-- So that @const works -->
		{#if true}
			{@const languages = Object.entries(
				source ||
					Object.fromEntries(
						Object.keys(Language)
							.filter((a) => typeof a == "string")
							.map((a) => [a, {}])
					)
			)}
			{@const localisationKeys = [
				...new Set(
					languages.reduce((accumulate, [lang, vals]) => {
						return [...accumulate, ...Object.keys(vals)]
					}, [])
				)
			]}
			{#each localisationKeys as locKey, index (locKey)}
				<tr class:border-b={index != localisationKeys.length - 1} class="border-solid border-b-black">
					<td class="p-4 pl-8 text-slate-800">
						<code>{locKey}</code>
					</td>
					<td class="p-4 px-8 text-slate-800">
						<div>
							<table class="table-auto border-collapse">
								<thead>
									<tr>
										<th class="font-medium p-4 pl-8 pb-3 text-left">Language</th>
										<th class="font-medium p-4 pl-8 pb-3 text-left">Value</th>
									</tr>
								</thead>
								<tbody>
									{#each Object.keys(Language).filter((a) => typeof a == "string") as language, langIndex (language)}
										<tr class:border-b={langIndex != Object.keys(Language).filter((a) => typeof a == "string").length - 1} class="border-solid border-b-black">
											<td class="p-4 pl-8">
												<code>{language}</code>
											</td>
											<td class="p-4 pl-8">
												{#if (source || Object.fromEntries(Object.keys(Language)
															.filter((a) => typeof a == "string")
															.map((a) => [a, {}])))[language][locKey]}
													<div class="flex flex-row gap-4 items-center">
														<code class="flex-grow">
															{(source ||
																Object.fromEntries(
																	Object.keys(Language)
																		.filter((a) => typeof a == "string")
																		.map((a) => [a, {}])
																))[language][locKey]}
														</code>
														<Button
															kind="ghost"
															size="small"
															icon={Edit}
															iconDescription="Edit localisation"
															on:click={() => {
																localisationValueInputModalOpen = true
																localisationValueLanguage = language
																localisationValueToEdit = locKey
																localisationValueCurrent = (source ||
																	Object.fromEntries(
																		Object.keys(Language)
																			.filter((a) => typeof a == "string")
																			.map((a) => [a, {}])
																	))[language][locKey]
															}}
														/>
														<Button
															kind="ghost"
															size="small"
															icon={CloseOutline}
															iconDescription="Remove localisation"
															on:click={() => {
																dispatch("undefine", {
																	language: language,
																	key: locKey
																})
															}}
														/>
													</div>
												{:else}
													<div class="flex flex-row gap-4 items-center">
														<span class="flex-grow">No localised version</span>
														<Button
															kind="ghost"
															size="small"
															icon={AddAlt}
															iconDescription="Add localisation"
															on:click={() => {
																localisationValueInputModalOpen = true
																localisationValueLanguage = language
																localisationValueToEdit = locKey
																localisationValueCurrent = ""
															}}
														/>
													</div>
												{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</td>
				</tr>
			{/each}
		{/if}
	</tbody>
</table>
<br />
<div class="text-white">
	<Button
		kind="primary"
		icon={AddAlt}
		on:click={() => {
			localisationKeyInputModalOpen = true
		}}
	>
		Add an entry
	</Button>
</div>

<TextInputModal
	bind:this={localisationKeyInputModal}
	bind:showingModal={localisationKeyInputModalOpen}
	modalText="Add a new localisation key"
	modalPlaceholder=""
	modalInitialText=""
	on:close={() => {
		if (localisationKeyInputModal.value && localisationKeyInputModal.value.length) {
			dispatch("define", {
				language: "english",
				key: localisationKeyInputModal.value,
				value: "Placeholder value"
			})
		}
	}}
/>

<TextInputModal
	bind:this={localisationValueInputModal}
	bind:showingModal={localisationValueInputModalOpen}
	modalText="Edit the {localisationValueLanguage
		? localisationValueLanguage.slice(0, 1).toUpperCase() +
		  localisationValueLanguage
				.slice(1)
				.split('')
				.map((a) => (a == a.toUpperCase() ? ' ' + a : a))
				.join('')
		: ''} localisation for {localisationValueToEdit}"
	modalPlaceholder={localisationValueCurrent}
	modalInitialText={localisationValueCurrent}
	multiline
	on:close={() => {
		if (localisationValueInputModal.value && localisationValueInputModal.value.length) {
			dispatch("define", {
				language: localisationValueLanguage,
				key: localisationValueToEdit,
				value: localisationValueInputModal.value
			})
		}
	}}
/>
