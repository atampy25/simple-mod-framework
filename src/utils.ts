import * as LosslessJSON from "lossless-json"

import { config, logger, rpkgInstance } from "./core-singleton"
import { convertPath, ppath } from "@yarnpkg/fslib/lib/path"

import Decimal from "decimal.js"
import { JailFS } from "@yarnpkg/fslib"
import { NodeVM } from "vm2"
import { freeDiskSpace } from "./smf-rust"
import fs from "fs-extra"
import md5 from "md5"
import path from "path"

const QuickEntity = {
	"3.1": require("./quickentity-rs"),

	"999.999": require("./quickentity-rs")
} as {
	[k: string]: {
		convert: (TEMP: string, TEMPmeta: string, TBLU: string, TBLUmeta: string, output: string) => Promise<void>
		generate: (input: string, TEMP: string, TEMPmeta: string, TBLU: string, TBLUmeta: string) => Promise<void>
		convertPatchGenerate: (
			inTEMP: string,
			inTEMPmeta: string,
			inTBLU: string,
			inTBLUmeta: string,
			patches: string[],
			outTEMP: string,
			outTEMPmeta: string,
			outTBLU: string,
			outTBLUmeta: string
		) => Promise<void>
		applyPatchJSON: (original: string, patch: string, output: string) => Promise<void>
	}
}

const QuickEntityPatch = {
	"6": require("./quickentity-rs"),

	"999": require("./quickentity-rs")
} as {
	[k: string]: {
		convert: (TEMP: string, TEMPmeta: string, TBLU: string, TBLUmeta: string, output: string) => Promise<void>
		generate: (input: string, TEMP: string, TEMPmeta: string, TBLU: string, TBLUmeta: string) => Promise<void>
		convertPatchGenerate: (
			inTEMP: string,
			inTEMPmeta: string,
			inTBLU: string,
			inTBLUmeta: string,
			patches: string[],
			outTEMP: string,
			outTEMPmeta: string,
			outTBLU: string,
			outTBLUmeta: string
		) => Promise<void>
		applyPatchJSON: (original: string, patch: string, output: string) => Promise<void>
	}
}

export function getQuickEntityFromVersion(version: string) {
	void logger.verbose(`Getting QuickEntity version from entity version ${version}`)

	return QuickEntity[Object.keys(QuickEntity)[Object.keys(QuickEntity).findIndex((a) => parseFloat(a) > Number(version)) - 1]]
}

export function getQuickEntityFromPatchVersion(version: string) {
	void logger.verbose(`Getting QuickEntity version from patch version ${version}`)

	return QuickEntityPatch[Object.keys(QuickEntityPatch)[Object.keys(QuickEntityPatch).findIndex((a) => parseFloat(a) > Number(version)) - 1]]
}

export function hexflip(input: string) {
	let output = ""

	for (let i = input.length; i > 0 / 2; i = i - 2) {
		output += input.substr(i - 2, 2)
	}

	return output
}

export async function extractOrCopyToTemp(rpkgOfFile: string, file: string, type: string, stagingChunk = "chunk0") {
	await logger.verbose(`Extract or copy to temp: ${rpkgOfFile} ${file} ${type} ${stagingChunk}`)

	if (!fs.existsSync(path.join(process.cwd(), "staging", stagingChunk, `${file}.${type}`))) {
		await rpkgInstance.callFunction(`-extract_from_rpkg "${path.join(config.runtimePath, `${rpkgOfFile}.rpkg`)}" -filter "${file}" -output_path temp`) // Extract the file
	} else {
		fs.ensureDirSync(path.join(process.cwd(), "temp", rpkgOfFile, type))
		fs.copyFileSync(path.join(process.cwd(), "staging", stagingChunk, `${file}.${type}`), path.join(process.cwd(), "temp", rpkgOfFile, type, `${file}.${type}`)) // Use the staging one (for mod compat - one mod can extract, patch and build, then the next can patch that one instead)

		if (fs.existsSync(path.join(process.cwd(), "staging", stagingChunk, `${file}.${type}.meta`))) {
			fs.copyFileSync(path.join(process.cwd(), "staging", stagingChunk, `${file}.${type}.meta`), path.join(process.cwd(), "temp", rpkgOfFile, type, `${file}.${type}.meta`))
		}
	}
}

export async function copyFromCache(mod: string, cachePath: string, outputPath: string) {
	if (fs.existsSync(path.join(process.cwd(), "cache", winPathEscape(mod), cachePath))) {
		await logger.verbose(`Cache hit: ${mod} ${cachePath} ${outputPath}`)

		fs.ensureDirSync(outputPath)
		fs.copySync(path.join(process.cwd(), "cache", winPathEscape(mod), cachePath), outputPath)
		return true
	}

	await logger.verbose(`No cache hit: ${mod} ${cachePath} ${outputPath}`)

	return false
}

export async function copyToCache(mod: string, originalPath: string, cachePath: string) {
	// do not cache if less than 5 GB remaining on disk
	if (fs.existsSync(originalPath) && freeDiskSpace() / 1024 / 1024 / 1024 > 5) {
		await logger.verbose(`Copy to cache: ${mod} ${originalPath} ${cachePath}`)

		fs.emptyDirSync(path.join(process.cwd(), "cache", winPathEscape(mod), cachePath))
		fs.copySync(originalPath, path.join(process.cwd(), "cache", winPathEscape(mod), cachePath))
		return true
	}

	await logger.verbose(`Not enough space/nonexistent path: ${mod} ${originalPath} ${cachePath}`)

	return false
}

export function winPathEscape(str: string) {
	return str
		.replace(/</gi, "")
		.replace(/>/gi, "")
		.replace(/:/gi, "")
		.replace(/"/gi, "")
		.replace(/\//gi, "")
		.replace(/\\/gi, "")
		.replace(/"/gi, "")
		.replace(/\|/gi, "")
		.replace(/\?/gi, "")
		.replace(/\*/gi, "")
}

export function isValidHash(hash: string) {
	return /\b[a-fA-F0-9]{16}$\b/g.test(hash)
}

export function normaliseToHash(hashOrPath: string) {
	return isValidHash(hashOrPath) ? hashOrPath : `00${md5(hashOrPath.toLowerCase()).slice(2, 16).toUpperCase()}`
}

export function fastParse(data: string) {
	// eslint-disable-next-line no-control-regex
	return JSON.parse(String(data).replace(/(\\(?:["\\bfnrt]|u[0-9a-fA-F])|[^\u0000-\u001F\\])": ?([-+Ee0-9.]+)/g, '$1":"\uE000$2"'), (_, value) =>
		typeof value === "string" && value.startsWith("\uE000") ? new Decimal(value.slice(1)) : value
	)
}

export function stringify(data: any): string {
	return LosslessJSON.stringify(data, (_, value) => (value instanceof Decimal ? new LosslessJSON.LosslessNumber(value.toString()) : value))
}

export async function getModScript(script: string) {
	return new NodeVM({
		sandbox: {},
		require: {
			builtin: ["path"],
			context: "sandbox",
			mock: {
				fs: new JailFS(convertPath(ppath, process.cwd()))
			}
		}
	}).run(fs.readFileSync(script, "utf8"), { filename: path.basename(script) })
}
