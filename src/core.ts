const FrameworkVersion = "2.5.1"
const isDevBuild = false

import * as Sentry from "@sentry/node"

import type { Config } from "./types"
import RPKGInstance from "./rpkg"
import arg from "arg"
import chalk from "chalk"
import child_process from "child_process"
import fs from "fs-extra"
import json5 from "json5"
import path from "path"

const args = arg({
	"--useConsoleLogging": Boolean,
	"--pauseAfterLogging": Boolean,
	"--logLevel": [String]
})

if (!args["--logLevel"] || !args["--logLevel"].length) {
	args["--logLevel"] = ["debug", "info", "warn", "error"]
}

const rpkgInstance = new RPKGInstance()

const config: Config = json5.parse(fs.readFileSync(path.join(process.cwd(), "config.json"), "utf8"))

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
			verbose: async (...args: any) => {},
			debug: async (...args: any) => {
				console.debug("DEBUG", ...args)
			},
			info: async (...args: any) => {
				console.info("INFO", ...args)
			},
			warn: async (...args: any) => {
				console.warn("WARN", ...args)
			},
			error: async function (a: unknown, exitAfter = true) {
				console.log("ERROR", a)

				if (exitAfter) {
					if (config.reportErrors) {
						Sentry.getCurrentHub().getScope()!.getTransaction()!.finish()
					}

					await Sentry.close()

					rpkgInstance.exit()
					try {
						// @ts-expect-error Assigning stuff on global is probably bad practice
						global.currentWorkerPool.destroy()
					} catch {}
					process.exit()
				}
			}
	  }
	: {
			verbose: async function (text: string) {
				if (args["--logLevel"]!.includes("verbose")) {
					process.stdout.write(chalk`{grey DETAIL\t${text}}\n`)

					if (args["--pauseAfterLogging"]) {
						child_process.execSync("pause", {
							// @ts-expect-error This code works and I'm not going to question it
							shell: true,
							stdio: [0, 1, 2]
						})
					}
				}
			},

			debug: async function (text: string) {
				if (args["--logLevel"]!.includes("debug")) {
					process.stdout.write(chalk`{grey DEBUG\t${text}}\n`)

					if (args["--pauseAfterLogging"]) {
						child_process.execSync("pause", {
							// @ts-expect-error This code works and I'm not going to question it
							shell: true,
							stdio: [0, 1, 2]
						})
					}
				}
			},

			info: async function (text: string) {
				if (args["--logLevel"]!.includes("info")) {
					process.stdout.write(chalk`{blue INFO}\t${text}\n`)

					if (args["--pauseAfterLogging"]) {
						child_process.execSync("pause", {
							// @ts-expect-error This code works and I'm not going to question it
							shell: true,
							stdio: [0, 1, 2]
						})
					}
				}
			},

			warn: async function (text: string) {
				if (args["--logLevel"]!.includes("warn")) {
					process.stdout.write(chalk`{yellow WARN}\t${text}\n`)

					if (args["--pauseAfterLogging"]) {
						child_process.execSync("pause", {
							// @ts-expect-error This code works and I'm not going to question it
							shell: true,
							stdio: [0, 1, 2]
						})
					}
				}
			},

			error: async function (text: string, exitAfter = true) {
				if (args["--logLevel"]!.includes("error")) {
					process.stderr.write(chalk`{red ERROR}\t${text}\n`)
					console.trace()

					child_process.execSync("pause", {
						// @ts-expect-error This code works and I'm not going to question it
						shell: true,
						stdio: [0, 1, 2]
					})

					if (exitAfter) {
						if (config.reportErrors) {
							Sentry.getCurrentHub().getScope()!.getTransaction()!.finish()
						}

						await Sentry.close()

						rpkgInstance.exit()
						try {
							// @ts-expect-error Assigning stuff on global is probably bad practice
							global.currentWorkerPool.destroy()
						} catch {}
						process.exit()
					}
				}
			}
	  }

export default {
	FrameworkVersion,
	rpkgInstance,
	config,
	logger,
	isDevBuild,
	args,
	cleanExit: async () => {
		if (config.reportErrors) {
			Sentry.getCurrentHub().getScope()!.getTransaction()!.finish()
		}

		await Sentry.close()

		rpkgInstance.exit()
		try {
			// @ts-expect-error Assigning stuff on global is probably bad practice
			global.currentWorkerPool.destroy()
		} catch {}
		process.exit()
	}
}
