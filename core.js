const FrameworkVersion = "1.5.2"
const isDevBuild = false

const fs = require("fs-extra")
const path = require("path")
const json5 = require("json5")
const child_process = require("child_process")
const chalk = require("chalk")

const RPKG = require("./rpkg")
const rpkgInstance = new RPKG.RPKGInstance()

const config = json5.parse(String(fs.readFileSync(path.join(process.cwd(), "config.json"))))

if (typeof config.outputConfigToAppDataOnDeploy == "undefined") {
	config.outputConfigToAppDataOnDeploy = true
	fs.writeFileSync(path.join(process.cwd(), "config.json"), json5.stringify(config))
} // Backwards compatibility - output config to appdata on deploy

if (typeof config.retailPath == "undefined") {
	config.retailPath = "..\\Retail"
	fs.writeFileSync(path.join(process.cwd(), "config.json"), json5.stringify(config))
} // Backwards compatibility - retail path

if (config.runtimePath == "..\\Runtime" && fs.existsSync(path.join(config.retailPath, "Runtime", "chunk0.rpkg"))) {
	config.runtimePath = "..\\Retail\\Runtime"
	fs.writeFileSync(path.join(process.cwd(), "config.json"), json5.stringify(config))
	fs.copyFileSync(path.join(process.cwd(), "cleanMicrosoftThumbs.dat"), path.join(process.cwd(), "cleanThumbs.dat"))
} // Automatically set runtime path and fix clean thumbs if using microsoft platform

if (typeof config.reportErrors == "undefined") {
	config.reportErrors = false
	config.errorReportingID = null
} // Do not report errors if no preference is set

config.runtimePath = path.resolve(process.cwd(), config.runtimePath)
config.retailPath = path.resolve(process.cwd(), config.retailPath)

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

					if (exitAfter) global.errored = true
				}
		  }
		: {
				debug: console.debug,
				info: console.info,
				warn: console.warn,
				error: function (/** @type {any} */ a, exitAfter = true) {
					console.log(a)

					if (exitAfter) global.errored = true
				}
		  } // Any arguments (except kevinMode) will cause coloured logging to be disabled

module.exports = {
	FrameworkVersion,
	rpkgInstance,
	config,
	logger,
	isDevBuild
}
