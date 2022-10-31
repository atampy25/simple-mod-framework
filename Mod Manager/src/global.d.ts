/// <reference types="@sveltejs/kit" />
/// <reference types="svelte" />
/// <reference types="vite/client" />

import type fs from "fs-extra"
import type klaw from "klaw-sync"
import type path from "path"
import type AdmZip from "adm-zip"
import type buffer from "buffer"
import type electron from "electron"

declare global {
	interface Window {
		ipc: any
		fs: typeof fs
		path: typeof path
		klaw: typeof klaw
		AdmZip: typeof AdmZip
		Buffer: typeof buffer
		openExternalLink: typeof electron["shell"]["openExternal"]
	}
}
