<script lang="ts">
	import { Button, TextInput } from "carbon-components-svelte"
	import { slide } from "svelte/transition"
	import Icon from "svelte-fa"

	import CloseOutline from "carbon-icons-svelte/lib/CloseOutline.svelte"
	import Edit from "carbon-icons-svelte/lib/Edit.svelte"
	import AddAlt from "carbon-icons-svelte/lib/AddAlt.svelte"

	import { faChevronDown } from "@fortawesome/free-solid-svg-icons"

	import { createEventDispatcher } from "svelte"

	import { Language, type ManifestOptionData } from "../../../src/types"

	import TextInputModal from "$lib/TextInputModal.svelte"

	const dispatch = createEventDispatcher()

	export let source: ManifestOptionData

	let contentAndBlobs = true

	let contentFolderInput: HTMLInputElement
	let contentFolderInputChanged = false

	let blobsFolderInput: HTMLInputElement
	let blobsFolderInputChanged = false

	let localisation = true

	let modLocalisation = true

	let localisationValueInputModal: TextInputModal
	let localisationValueInputModalOpen = false
	let localisationValueLanguage = ""
	let localisationValueToEdit = ""
	let localisationValueCurrent = ""

	let localisationKeyInputModal: TextInputModal
	let localisationKeyInputModalOpen = false
</script>

<div class="flex flex-row items-center cursor-pointer" on:click={() => (contentAndBlobs = !contentAndBlobs)}>
	<h2 class="flex-grow">Content and Blobs</h2>
	<div class:spin={contentAndBlobs} class:spinBack={!contentAndBlobs}>
		<Icon icon={faChevronDown} />
	</div>
</div>
{#if contentAndBlobs}
	<div transition:slide>
		<br />
		<div class="grid grid-cols-2 gap-4">
			<div>
				<TextInput
					labelText="Content folder"
					placeholder={source.contentFolder || "Not defined"}
					bind:ref={contentFolderInput}
					on:input={() => {
						contentFolderInputChanged = !!contentFolderInput.value.length
					}}
				/>
				<br />
				{#if source.contentFolder}
					<Button
						kind="ghost"
						icon={CloseOutline}
						on:click={() => {
							dispatch("contentFolder-undefine")
						}}
					>
						Remove
						<span class="mr-2" />
					</Button>
				{/if}
				{#if contentFolderInputChanged}
					<Button
						icon={Edit}
						on:click={() => {
							dispatch("contentFolder-define", contentFolderInput.value)

							contentFolderInput.value = ""
							contentFolderInputChanged = false
						}}
					>
						Save
					</Button>
				{/if}
			</div>
			<div>
				<TextInput
					labelText="Blobs folder"
					placeholder={source.blobsFolder || "Not defined"}
					bind:ref={blobsFolderInput}
					on:input={() => {
						blobsFolderInputChanged = !!blobsFolderInput.value.length
					}}
				/>
				<br />
				{#if source.blobsFolder}
					<Button
						kind="ghost"
						icon={CloseOutline}
						on:click={() => {
							dispatch("blobsFolder-undefine")
						}}
					>
						Remove
						<span class="mr-2" />
					</Button>
				{/if}
				{#if blobsFolderInputChanged}
					<Button
						icon={Edit}
						on:click={() => {
							dispatch("blobsFolder-define", blobsFolderInput.value)

							blobsFolderInput.value = ""
							blobsFolderInputChanged = false
						}}
					>
						Save
					</Button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<br />

<div class="flex flex-row items-center cursor-pointer" on:click={() => (localisation = !localisation)}>
	<h2 class="flex-grow">Localisation</h2>
	<div class:spin={localisation} class:spinBack={!localisation}>
		<Icon icon={faChevronDown} />
	</div>
</div>
{#if localisation}
	<div transition:slide>
		<br />
		<div class="flex flex-row items-center cursor-pointer" on:click={() => (modLocalisation = !modLocalisation)}>
			<h4 class="flex-grow">Mod localisation</h4>
			<div class:spin={modLocalisation} class:spinBack={!modLocalisation}>
				<Icon icon={faChevronDown} />
			</div>
		</div>
		{#if modLocalisation}
			<div transition:slide>
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
								source.localisation ||
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
																{#if (source.localisation || Object.fromEntries(Object.keys(Language)
																			.filter((a) => typeof a == "string")
																			.map((a) => [a, {}])))[language][locKey]}
																	<div class="flex flex-row gap-4 items-center">
																		<code class="flex-grow">
																			{(source.localisation ||
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
																				localisationValueCurrent = (source.localisation ||
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
																				dispatch("localisationValue-undefine", {
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
			</div>
		{/if}
	</div>
{/if}

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
			dispatch("localisationValue-define", {
				language: localisationValueLanguage,
				key: localisationValueToEdit,
				value: localisationValueInputModal.value
			})
		}
	}}
/>

<TextInputModal
	bind:this={localisationKeyInputModal}
	bind:showingModal={localisationKeyInputModalOpen}
	modalText="Add a new localisation key"
	modalPlaceholder=""
	modalInitialText=""
	on:close={() => {
		if (localisationKeyInputModal.value && localisationKeyInputModal.value.length) {
			dispatch("localisationValue-define", {
				language: "english",
				key: localisationKeyInputModal.value,
				value: "Placeholder value"
			})
		}
	}}
/>

<style>
	:global(.bx--btn--ghost) {
		color: inherit;
		@apply bg-neutral-900;
	}

	:global(.bx--btn--ghost:hover, .bx--btn--ghost:active) {
		color: inherit;
	}

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
		animation: spin 0.5s;
		animation-fill-mode: forwards;
	}

	.spinBack {
		animation: spinBack 0.5s;
		animation-fill-mode: forwards;
	}
</style>
