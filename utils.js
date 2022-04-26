const fs = require("fs-extra")
const path = require("path")
const checkDiskSpace = require("check-disk-space").default
const freeSpace = async () => Number((await checkDiskSpace(process.cwd())).free) / 1024 / 1024 / 1024

const { rpkgInstance, config, logger } = require("./core-singleton")

/**
 * @param {string} input
 */
function hexflip(input) {
	let output = ""

	for (let i = input.length; i > 0 / 2; i = i - 2) {
		output += input.substr(i - 2, 2)
	}

	return output
}

/**
 * @param {string} rpkgOfFile
 * @param {string} file
 * @param {string} type
 * @param {string} [stagingChunk]
 */
async function extractOrCopyToTemp(rpkgOfFile, file, type, stagingChunk = "chunk0") {
	logger.verbose(`Extract or copy to temp: ${rpkgOfFile} ${file} ${type} ${stagingChunk}`)

	if (!fs.existsSync(path.join(process.cwd(), "staging", stagingChunk, file + "." + type))) {
		await rpkgInstance.callFunction(`-extract_from_rpkg "${path.join(config.runtimePath, rpkgOfFile + ".rpkg")}" -filter "${file}" -output_path temp`) // Extract the file
	} else {
		fs.ensureDirSync(path.join(process.cwd(), "temp", rpkgOfFile, type))
		fs.copyFileSync(path.join(process.cwd(), "staging", stagingChunk, file + "." + type), path.join(process.cwd(), "temp", rpkgOfFile, type, file + "." + type)) // Use the staging one (for mod compat - one mod can extract, patch and build, then the next can patch that one instead)
		fs.copyFileSync(path.join(process.cwd(), "staging", stagingChunk, file + "." + type + ".meta"), path.join(process.cwd(), "temp", rpkgOfFile, type, file + "." + type + ".meta"))
	}
}

/**
 * @param {string} mod
 * @param {string} cachePath
 * @param {string} outputPath
 */
async function copyFromCache(mod, cachePath, outputPath) {
	logger.verbose(`Copy from cache: ${mod} ${cachePath} ${outputPath}`)

	if (fs.existsSync(path.join(process.cwd(), "cache", winPathEscape(mod), cachePath))) {
		fs.ensureDirSync(outputPath)
		fs.copySync(path.join(process.cwd(), "cache", winPathEscape(mod), cachePath), outputPath)
		return true
	}

	return false
}

/**
 * @param {string} mod
 * @param {string} originalPath
 * @param {string} cachePath
 */
async function copyToCache(mod, originalPath, cachePath) {
	logger.verbose(`Copy to cache: ${mod} ${originalPath} ${cachePath}`)

	// do not cache if less than 5 GB remaining on disk
	if (fs.existsSync(originalPath) && (await freeSpace()) > 5) {
		fs.ensureDirSync(path.join(process.cwd(), "cache", winPathEscape(mod), cachePath))
		fs.copySync(originalPath, path.join(process.cwd(), "cache", winPathEscape(mod), cachePath))
		return true
	}

	return false
}

function winPathEscape(str) {
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

module.exports = {
	hexflip,
	extractOrCopyToTemp,
	copyFromCache,
	copyToCache,
	winPathEscape
}
