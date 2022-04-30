import { config, logger, rpkgInstance } from "./core-singleton"

import fs from "fs-extra"
import path from "path"

const checkDiskSpace = require("check-disk-space").default
const freeSpace = async () => Number((await checkDiskSpace(process.cwd())).free) / 1024 / 1024 / 1024

const QuickEntity = {
	"0.1": require("./quickentity1136"),
	"2.0": require("./quickentity20"),
	"2.1": require("./quickentity"),

	"999.999": require("./quickentity")
} as {
	[k: string]: {
		convert: (game: string, TEMP: string, TEMPmeta: string, TBLU: string, TBLUmeta: string, output: string) => Promise<void>
		generate: (game: string, input: string, TEMP: string, TEMPmeta: string, TBLU: string, TBLUmeta: string) => Promise<void>
		applyPatchJSON: (original: string, patch: string, output: string) => Promise<void>
	}
}

const QuickEntityPatch = {
	"0": require("./quickentity1136"),
	"3": require("./quickentity20"),
	"4": require("./quickentity"),

	"999": require("./quickentity")
} as {
	[k: string]: {
		convert: (game: string, TEMP: string, TEMPmeta: string, TBLU: string, TBLUmeta: string, output: string) => Promise<void>
		generate: (game: string, input: string, TEMP: string, TEMPmeta: string, TBLU: string, TBLUmeta: string) => Promise<void>
		applyPatchJSON: (original: string, patch: string, output: string) => Promise<void>
	}
}

export function getQuickEntityFromVersion(version: string) {
	logger.verbose(`Getting QuickEntity version from entity version ${version}`)
	return QuickEntity[Object.keys(QuickEntity)[Object.keys(QuickEntity).findIndex((a) => parseFloat(a) > Number(version)) - 1]]
}

export function getQuickEntityFromPatchVersion(version: string) {
	logger.verbose(`Getting QuickEntity version from patch version ${version}`)
	return QuickEntityPatch[Object.keys(QuickEntityPatch)[Object.keys(QuickEntityPatch).findIndex((a) => parseFloat(a) > Number(version)) - 1]]
}

export function hexflip(input: string) {
	let output = ""

	for (let i = input.length; i > 0 / 2; i = i - 2) {
		output += input.substr(i - 2, 2)
	}

	return output
}

export async function extractOrCopyToTemp(rpkgOfFile: string, file: string, type: string, stagingChunk: string = "chunk0") {
	logger.verbose(`Extract or copy to temp: ${rpkgOfFile} ${file} ${type} ${stagingChunk}`)

	if (!fs.existsSync(path.join(process.cwd(), "staging", stagingChunk, file + "." + type))) {
		await rpkgInstance.callFunction(`-extract_from_rpkg "${path.join(config.runtimePath, rpkgOfFile + ".rpkg")}" -filter "${file}" -output_path temp`) // Extract the file
	} else {
		fs.ensureDirSync(path.join(process.cwd(), "temp", rpkgOfFile, type))
		fs.copyFileSync(path.join(process.cwd(), "staging", stagingChunk, file + "." + type), path.join(process.cwd(), "temp", rpkgOfFile, type, file + "." + type)) // Use the staging one (for mod compat - one mod can extract, patch and build, then the next can patch that one instead)
		fs.copyFileSync(path.join(process.cwd(), "staging", stagingChunk, file + "." + type + ".meta"), path.join(process.cwd(), "temp", rpkgOfFile, type, file + "." + type + ".meta"))
	}
}

export async function copyFromCache(mod: string, cachePath: string, outputPath: string) {
	logger.verbose(`Copy from cache: ${mod} ${cachePath} ${outputPath}`)

	if (fs.existsSync(path.join(process.cwd(), "cache", winPathEscape(mod), cachePath))) {
		fs.ensureDirSync(outputPath)
		fs.copySync(path.join(process.cwd(), "cache", winPathEscape(mod), cachePath), outputPath)
		return true
	}

	return false
}

export async function copyToCache(mod: string, originalPath: string, cachePath: string) {
	logger.verbose(`Copy to cache: ${mod} ${originalPath} ${cachePath}`)

	// do not cache if less than 5 GB remaining on disk
	if (fs.existsSync(originalPath) && (await freeSpace()) > 5) {
		fs.ensureDirSync(path.join(process.cwd(), "cache", winPathEscape(mod), cachePath))
		fs.copySync(originalPath, path.join(process.cwd(), "cache", winPathEscape(mod), cachePath))
		return true
	}

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
		.replace(/\"/gi, "")
		.replace(/\|/gi, "")
		.replace(/\?/gi, "")
		.replace(/\*/gi, "")
}
