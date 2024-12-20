const FrameworkVersion = "2.33.23"
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

const args = arg(
	{
		"--useConsoleLogging": Boolean,
		"--pauseAfterLogging": Boolean,
		"--doNotPause": Boolean,
		"--logLevel": [String]
	},
	{
		permissive: true
	}
)

if (!args["--logLevel"]?.length) {
	args["--logLevel"] = ["debug", "info", "warn", "error"]
}

const rpkgInstance = new RPKGInstance()

const config: Config = json5.parse(fs.readFileSync(path.join(process.cwd(), "config.json"), "utf8"))

if (config.runtimePath === "..\\Runtime" && fs.existsSync(path.join(config.retailPath, "Runtime", "chunk0.rpkg"))) {
	config.runtimePath = "..\\Retail\\Runtime"
	fs.writeFileSync(path.join(process.cwd(), "config.json"), json5.stringify(config))
	fs.copyFileSync(path.join(process.cwd(), "cleanMicrosoftThumbs.dat"), path.join(process.cwd(), "cleanThumbs.dat"))
} // Automatically set runtime path and fix clean thumbs if using microsoft platform

if (typeof config.reportErrors === "undefined") {
	config.reportErrors = false
	config.errorReportingID = null
} // Do not report errors if no preference is set

if (typeof config.developerMode === "undefined") {
	config.developerMode = false
} // Assume user is not a developer if no preference is set

config.runtimePath = path.resolve(process.cwd(), config.runtimePath)
config.retailPath = path.resolve(process.cwd(), config.retailPath)

let deployLog = ""

const logger = args["--useConsoleLogging"]
	? {
			verbose: async (text: string, mod?: string) => {
				deployLog += `\nDETAIL\t${mod || "Deploy"}\t${text}`
				fs.writeFileSync(path.join(process.cwd(), "Deploy.log"), deployLog)
			},
			debug: async (text: string, mod?: string) => {
				deployLog += `\nDEBUG\t${mod || "Deploy"}\t${text}`
				fs.writeFileSync(path.join(process.cwd(), "Deploy.log"), deployLog)
				console.debug("DEBUG", ...(mod ? [mod, text] : [text]))
			},
			info: async (text: string, mod?: string) => {
				deployLog += `\nINFO\t${mod || "Deploy"}\t${text}`
				fs.writeFileSync(path.join(process.cwd(), "Deploy.log"), deployLog)
				console.info("INFO", ...(mod ? [mod, text] : [text]))
			},
			warn: async (text: string, mod?: string) => {
				deployLog += `\nWARN\t${mod || "Deploy"}\t${text}`
				fs.writeFileSync(path.join(process.cwd(), "Deploy.log"), deployLog)
				console.warn("WARN", ...(mod ? [mod, text] : [text]))
			},
			error: async function (text: string, exitAfter = true, mod?: string) {
				deployLog += `\nERROR\t${mod || "Deploy"}\t${text}`
				fs.writeFileSync(path.join(process.cwd(), "Deploy.log"), deployLog)
				console.log("ERROR", ...(mod ? [mod, text] : [text]))

				if (mod) {
					console.trace() // It's unimportant where framework errors come from
				}

				if (!args["--doNotPause"]) {
					child_process.execSync("pause", {
						// @ts-expect-error This code works and I'm not going to question it
						shell: true,
						stdio: "inherit"
					})
				}

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
					process.exit(1)
				}
			}
	  }
	: {
			verbose: async function (text: string, mod?: string) {
				deployLog += `\nDETAIL\t${mod || "Deploy"}\t${text}`
				fs.writeFileSync(path.join(process.cwd(), "Deploy.log"), deployLog)

				if (args["--logLevel"]!.includes("verbose")) {
					process.stdout.write(chalk(Object.assign([], { raw: [`{grey DETAIL${mod ? `\t${mod}` : ""}\t${text.replace(/\\/gi, "\\\\")}}\n`] })))

					if (args["--pauseAfterLogging"]) {
						child_process.execSync("pause", {
							// @ts-expect-error This code works and I'm not going to question it
							shell: true,
							stdio: "inherit"
						})
					}
				}
			},

			debug: async function (text: string, mod?: string) {
				deployLog += `\nDEBUG\t${mod || "Deploy"}\t${text}`
				fs.writeFileSync(path.join(process.cwd(), "Deploy.log"), deployLog)

				if (args["--logLevel"]!.includes("debug")) {
					process.stdout.write(chalk(Object.assign([], { raw: [`{grey DEBUG${mod ? `\t${mod}` : ""}\t${text.replace(/\\/gi, "\\\\")}}\n`] })))

					if (args["--pauseAfterLogging"]) {
						child_process.execSync("pause", {
							// @ts-expect-error This code works and I'm not going to question it
							shell: true,
							stdio: "inherit"
						})
					}
				}
			},

			info: async function (text: string, mod?: string) {
				deployLog += `\nINFO\t${mod || "Deploy"}\t${text}`
				fs.writeFileSync(path.join(process.cwd(), "Deploy.log"), deployLog)

				if (args["--logLevel"]!.includes("info")) {
					process.stdout.write(chalk(Object.assign([], { raw: [`{blue INFO}${mod ? `\t{magenta ${mod}}` : ""}\t${text.replace(/\\/gi, "\\\\")}\n`] })))

					if (args["--pauseAfterLogging"]) {
						child_process.execSync("pause", {
							// @ts-expect-error This code works and I'm not going to question it
							shell: true,
							stdio: "inherit"
						})
					}
				}
			},

			warn: async function (text: string, mod?: string) {
				deployLog += `\nWARN\t${mod || "Deploy"}\t${text}`
				fs.writeFileSync(path.join(process.cwd(), "Deploy.log"), deployLog)

				if (args["--logLevel"]!.includes("warn")) {
					process.stdout.write(chalk(Object.assign([], { raw: [`{yellow WARN}${mod ? `\t{magenta ${mod}}` : ""}\t${text.replace(/\\/gi, "\\\\")}\n`] })))

					if (args["--pauseAfterLogging"]) {
						child_process.execSync("pause", {
							// @ts-expect-error This code works and I'm not going to question it
							shell: true,
							stdio: "inherit"
						})
					}
				}
			},

			error: async function (text: string, exitAfter = true, mod?: string) {
				deployLog += `\nERROR\t${mod || "Deploy"}\t${text}`
				fs.writeFileSync(path.join(process.cwd(), "Deploy.log"), deployLog)

				if (args["--logLevel"]!.includes("error")) {
					process.stderr.write(chalk(Object.assign([], { raw: [`{red ERROR}${mod ? `\t{magenta ${mod}}` : ""}\t${text.replace(/\\/gi, "\\\\")}\n`] })))

					if (mod) {
						console.trace() // It's unimportant where framework errors come from
					}

					if (!args["--doNotPause"]) {
						child_process.execSync("pause", {
							// @ts-expect-error This code works and I'm not going to question it
							shell: true,
							stdio: "inherit"
						})
					}

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
						process.exit(1)
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
