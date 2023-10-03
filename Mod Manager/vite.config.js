import { builtinModules } from "module"
import { sveltekit } from "@sveltejs/kit/vite"

/** @type {import('vite').UserConfig} */
const config = {
	plugins: [sveltekit()],
    build: {
        rollupOptions: {
            external: [...builtinModules.flatMap((p) => [p, `node:${p}`])]
        }
    }
}

export default config
