/// <reference types="@sveltejs/kit" />
/// <reference types="svelte" />
/// <reference types="vite/client" />

import type fs from "fs-extra"
import type originalFs from "original-fs"
import type klaw from "klaw-sync"
import type path from "path"
import type buffer from "buffer"
import type electron from "electron"
import type sanitizeHtml from "sanitize-html"
import type child_process from "child_process"

declare global {
	interface Window {
		ipc: any
		fs: typeof fs
		isFile: (path: string) => boolean,
		originalFs: typeof originalFs
		path: typeof path
		klaw: typeof klaw
		Buffer: typeof buffer
		openExternalLink: typeof electron["shell"]["openExternal"]
		sanitizeHtml: typeof sanitizeHtml
		child_process: typeof child_process
	}
}
