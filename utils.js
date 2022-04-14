const fs = require("fs-extra")
const path = require("path")
const chalk = require("chalk")
const child_process = require("child_process")
const xxHash64 = require("hash-wasm").xxhash64

const { rpkgInstance, cleanExit, config } = require("./core")

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
	if (!fs.existsSync(path.join(process.cwd(), "staging", stagingChunk, file + "." + type))) {
		await rpkgInstance.callFunction(`-extract_from_rpkg "${path.join(config.runtimePath, rpkgOfFile + ".rpkg")}" -filter "${file}" -output_path temp`) // Extract the file
	} else {
		fs.ensureDirSync(path.join(process.cwd(), "temp", rpkgOfFile, type))
		fs.copyFileSync(path.join(process.cwd(), "staging", stagingChunk, file + "." + type), path.join(process.cwd(), "temp", rpkgOfFile, type, file + "." + type)) // Use the staging one (for mod compat - one mod can extract, patch and build, then the next can patch that one instead)
		fs.copyFileSync(path.join(process.cwd(), "staging", stagingChunk, file + "." + type + ".meta"), path.join(process.cwd(), "temp", rpkgOfFile, type, file + "." + type + ".meta"))
	}
}

/**
 * @param {number | fs.PathLike} path
 */
async function xxHashFile(path) {
	return await xxHash64(await fs.readFile(path))
}

const logger =
	!process.argv[2] || process.argv[2] == "kevinMode"
		? {
				debug: function (/** @type {unknown} */ text) {
					process.stdout.write(chalk`{grey DEBUG\t${text}}\n`)

					if (process.argv[2] == "kevinMode") {
						child_process.execSync("pause", {
							// @ts-ignore
							shell: true,
							stdio: [0, 1, 2]
						})
					}
				},

				info: function (/** @type {unknown} */ text) {
					process.stdout.write(chalk`{blue INFO}\t${text}\n`)

					if (process.argv[2] == "kevinMode") {
						child_process.execSync("pause", {
							// @ts-ignore
							shell: true,
							stdio: [0, 1, 2]
						})
					}
				},

				warn: function (/** @type {unknown} */ text) {
					process.stdout.write(chalk`{yellow WARN}\t${text}\n`)

					if (process.argv[2] == "kevinMode") {
						child_process.execSync("pause", {
							// @ts-ignore
							shell: true,
							stdio: [0, 1, 2]
						})
					}
				},

				error: function (/** @type {unknown} */ text, exitAfter = true) {
					process.stderr.write(chalk`{red ERROR}\t${text}\n`)
					console.trace()

					child_process.execSync("pause", {
						// @ts-ignore
						shell: true,
						stdio: [0, 1, 2]
					})

					if (exitAfter) cleanExit()
				}
		  }
		: {
				debug: console.debug,
				info: console.info,
				warn: console.warn,
				error: function (/** @type {any} */ a, exitAfter = true) {
					console.log(a)
					if (exitAfter) cleanExit()
				}
		  } // Any arguments (except kevinMode) will cause coloured logging to be disabled

module.exports = {
	hexflip,
	extractOrCopyToTemp,
	xxHashFile,
	logger
}
