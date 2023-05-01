<script lang="ts">
	import { FrameworkVersion, getConfig, mergeConfig } from "$lib/utils"

	import { Button, Checkbox } from "carbon-components-svelte"

	import { fade } from "svelte/transition"
	import { v4 } from "uuid"

	let forceUpdate = Math.random()
</script>

<div class="w-full h-full flex items-center justify-center">
	<div>
		<h1 in:fade>Information</h1>
		<p in:fade={{ delay: 400 }}>
			This GUI is powered by Svelte, and the CLI is powered by Node.js. You're on framework version {FrameworkVersion}.
		</p>
		<br />
		<p in:fade={{ delay: 800 }}>Thanks to the Hitman modding community for making this possible, and thanks to IO Interactive for making the game this is for.</p>
		<br />
		<div in:fade={{ delay: 1200 }}>
			<Checkbox
				checked={getConfig().skipIntro}
				on:check={({ detail }) => {
					mergeConfig({ skipIntro: detail })
				}}
				labelText="Skip intro"
			/>
		</div>
		<br />
		<div in:fade={{ delay: 1600 }}>
			<div class="flex gap-4 items-center">
				<Button
					kind="primary"
					on:click={() => {
						if (getConfig().developerMode) {
							mergeConfig({
								developerMode: false,
								knownMods: []
							})

							forceUpdate = Math.random()
						} else {
							mergeConfig({
								developerMode: true,
								knownMods: []
							})

							forceUpdate = Math.random()
						}
					}}
				>
					{forceUpdate && getConfig().developerMode ? "Disable" : "Enable"} developer mode
				</Button>
			</div>
		</div>
		<br />
		<div in:fade={{ delay: 2000 }}>
			<div class="flex gap-4 items-center">
				<Button
					kind="primary"
					on:click={() => {
						if (getConfig().reportErrors) {
							mergeConfig({
								reportErrors: false,
								errorReportingID: undefined
							})

							forceUpdate = Math.random()
						} else {
							mergeConfig({
								reportErrors: true,
								errorReportingID: v4()
							})

							forceUpdate = Math.random()
						}
					}}
				>
					{forceUpdate && getConfig().reportErrors ? "Disable" : "Enable"} error reporting
				</Button>
				{#if forceUpdate && getConfig().reportErrors}
					<span class="text-gray-300">Your reporting ID is {forceUpdate && getConfig().errorReportingID}</span>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
</style>
