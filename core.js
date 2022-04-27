const FrameworkVersion = "1.5.5"
const isDevBuild = false

const fs = require("fs-extra")
const path = require("path")
const json5 = require("json5")
const child_process = require("child_process")
const chalk = require("chalk")
const arg = require("arg")

const args = arg({
	"--useConsoleLogging": Boolean,
	"--pauseAfterLogging": Boolean,
	"--logLevel": [String]
})

if (!args["--logLevel"] || !args["--logLevel"].length) {
	args["--logLevel"] = ["debug", "info", "warn", "error"]
}

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

const logger = args["--useConsoleLogging"]
	? {
			verbose: () => {},
			debug: console.debug,
			info: console.info,
			warn: console.warn,
			error: function (/** @type {any} */ a, exitAfter = true) {
				console.log(a)

				if (exitAfter) global.errored = true
			}
	  }
	: {
			verbose: function (/** @type {string} */ text) {
				if (args["--logLevel"].includes("verbose")) {
					process.stdout.write(chalk`{grey DETAIL\t${text}}\n`)

					if (args["--pauseAfterLogging"]) {
						child_process.execSync("pause", {
							// @ts-ignore
							shell: true,
							stdio: [0, 1, 2]
						})
					}
				}
			},

			debug: function (/** @type {string} */ text) {
				if (args["--logLevel"].includes("debug")) {
					process.stdout.write(chalk`{grey DEBUG\t${text}}\n`)

					if (args["--pauseAfterLogging"]) {
						child_process.execSync("pause", {
							// @ts-ignore
							shell: true,
							stdio: [0, 1, 2]
						})
					}
				}
			},

			info: function (/** @type {string} */ text) {
				if (args["--logLevel"].includes("info")) {
					process.stdout.write(chalk`{blue INFO}\t${text}\n`)

					if (args["--pauseAfterLogging"]) {
						child_process.execSync("pause", {
							// @ts-ignore
							shell: true,
							stdio: [0, 1, 2]
						})
					}
				}
			},

			warn: function (/** @type {string} */ text) {
				if (args["--logLevel"].includes("warn")) {
					process.stdout.write(chalk`{yellow WARN}\t${text}\n`)

					if (args["--pauseAfterLogging"]) {
						child_process.execSync("pause", {
							// @ts-ignore
							shell: true,
							stdio: [0, 1, 2]
						})
					}
				}
			},

			error: function (/** @type {string} */ text, exitAfter = true) {
				if (args["--logLevel"].includes("error")) {
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
	  }

module.exports = {
	FrameworkVersion,
	rpkgInstance,
	config,
	logger,
	isDevBuild,
	args
}
