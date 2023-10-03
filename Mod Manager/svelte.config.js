import adapter from "@sveltejs/adapter-static"
import preprocess from "svelte-preprocess"

/** @type {import("@sveltejs/kit").Config} */
const config = {
	kit: {
		adapter: adapter({
			fallback: "index.html"
		})
	},
	preprocess: preprocess()
}

export default config
