<script lang="ts">
	import { onMount } from "svelte"
	import { page } from "$app/stores"
	import { goto } from "$app/navigation"

	import { marked } from "marked"

	import { Button, InlineLoading } from "carbon-components-svelte"

	import ArrowLeft from "carbon-icons-svelte/lib/ArrowLeft.svelte"
	import Home from "carbon-icons-svelte/lib/Home.svelte"

	marked.setOptions({
		renderer: new marked.Renderer(),
		highlight: function (code, language, callback) {
			;(async () => {
				try {
					callback!(
						null,
						(
							await window.torchlight.highlight({
								language: language,
								code: code
							})
						)[0].highlighted
					)
				} catch {
					callback!(null, code)
				}
			})()
		},
		pedantic: false,
		gfm: true,
		breaks: false,
		sanitize: false,
		smartLists: true,
		smartypants: false,
		xhtml: false
	})

	let dummyForceUpdate = Math.random()

	let pageContent = ""

	let loading = true

	$: {
		loading = true

		$page.params.page && dummyForceUpdate
			? (async () =>
					marked.parse(String(window.fs.readFileSync(window.path.join("..", "docs", $page.params.page), "utf-8")), undefined, (err, result) => {
						pageContent = result
						loading = false
					}))()
			: (pageContent = "")
	}

	onMount(() => (dummyForceUpdate = Math.random()))
</script>

<div class="h-[90vh] pr-4 overflow-y-auto">
	<div class="flex gap-4 items-center">
		<h1 class="flex-grow">{$page.params.page.split(".")[0]}</h1>
		<div>
			{#if loading}
				<InlineLoading />
			{:else}
				<Button on:click={() => window.history.back()} icon={ArrowLeft}>Back</Button>
				<Button on:click={() => goto("/docs/Index.md")} icon={Home}>Go to Index</Button>
			{/if}
		</div>
	</div>
	{@html pageContent}
</div>

<style global>
	pre {
		margin-top: 0.5rem !important;
		margin-bottom: 0.5rem !important;

		@apply rounded-md bg-neutral-900;
	}

	pre > code {
		@apply p-4;
	}

	:not(pre) > code {
		@apply bg-neutral-900 text-orange-200 rounded-md text-sm;
		padding: 0.2rem 0.4rem !important;
	}

	code {
		font-family: "Fira Code", "IBM Plex Mono", "Menlo", "DejaVu Sans Mono", "Bitstream Vera Sans Mono", Courier, monospace !important;
	}

	.line {
		@apply ml-4 mt-1 pt-1;
	}

	.line-number {
		@apply mr-4;
	}

	p {
		padding: 0.2rem 0rem !important;
	}

	h1,
	h2,
	h3,
	h4,
	h5,
	h6 {
		@apply mt-4;
	}
</style>
