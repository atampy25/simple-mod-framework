import adapter from "@sveltejs/adapter-static"
import { builtinModules } from "module"
import preprocess from "svelte-preprocess"

/** @type {import("@sveltejs/kit").Config} */
const config = {
	kit: {
		adapter: adapter({
			fallback: "200.html"
		}),
		prerender: {
			default: false
		},
		vite: {
			build: {
				rollupOptions: {
					external: [
						...builtinModules.flatMap(p => [p, `node:${p}`])
					]
				}
			}
		}
	},
	preprocess: preprocess()
}

export default config