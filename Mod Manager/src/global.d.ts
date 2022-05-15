/// <reference types="@sveltejs/kit" />
/// <reference types="svelte" />
/// <reference types="vite/client" />

import type fs from "fs-extra"
import type klaw from "klaw-sync"
import type path from "path"
import type AdmZip from "adm-zip"
import type buffer from "buffer"

declare global {
	interface Window {
		electron: any
		fs: typeof fs
		path: typeof path
		klaw: typeof klaw
		AdmZip: typeof AdmZip
		Buffer: typeof buffer["Buffer"]
	}
}