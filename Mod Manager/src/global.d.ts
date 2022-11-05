/// <reference types="@sveltejs/kit" />
/// <reference types="svelte" />
/// <reference types="vite/client" />

import type fs from "fs-extra"
import type originalFs from "original-fs"
import type klaw from "klaw-sync"
import type path from "path"
import type AdmZip from "adm-zip"
import type buffer from "buffer"
import type electron from "electron"
import type sanitizeHtml from "sanitize-html"

declare global {
	interface Window {
		ipc: any
		fs: typeof fs
		originalFs: typeof originalFs
		path: typeof path
		klaw: typeof klaw
		AdmZip: typeof AdmZip
		Buffer: typeof buffer
		openExternalLink: typeof electron["shell"]["openExternal"]
		sanitizeHtml: typeof sanitizeHtml
	}
}
