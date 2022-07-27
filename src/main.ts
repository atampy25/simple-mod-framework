// @ts-expect-error Need to assign on global because of QuickEntity
global.THREE = require("./three-onlymath.min")

import * as Sentry from "@sentry/node"
import * as Tracing from "@sentry/tracing"

import type { Span, Transaction } from "@sentry/tracing"

import { DateTime } from "luxon"
import core from "./core-singleton"
import deploy from "./deploy"
import difference from "./difference"
import discover from "./discover"
import fs from "fs-extra"
import json5 from "json5"
import md5File from "md5-file"
import path from "path"

require("clarify")

const gameHashes = {
	// prettier-ignore
	"fbc21d6cb9c46894f4c07e3ece8c6432": "epic",
	"340abd7680e18943097a362bfcf16ea5": "epic", // with ansel unlock
	"7ac366ddce7d7412acfeaf7539ceb3a8": "steam",
	"e7c9eedc5481372f75e85c880fc03173": "microsoft"
	// Gamepass/store protects the EXE from reading so we can't hash it, instead we hash the game config
} as {
	[k: string]: "epic" | "steam" | "microsoft"
}

if (!core.config.reportErrors) {
	process.on("uncaughtException", (err, origin) => {
		if (!core.args["--useConsoleLogging"]) {
			core.logger.warn("Error reporting is disabled; if you experience this issue again, please enable it so that the problem can be debugged.")
		}

		core.logger.error("Uncaught exception! " + err, false)
		console.error(origin)
		core.interoperability.cleanExit()
	})

	process.on("unhandledRejection", (err, origin) => {
		if (!core.args["--useConsoleLogging"]) {
			core.logger.warn("Error reporting is disabled; if you experience this issue again, please enable it so that the problem can be debugged.")
		}

		core.logger.error("Unhandled promise rejection! " + err, false)
		console.error(origin)
		core.interoperability.cleanExit()
	})
}

if (!fs.existsSync(core.config.runtimePath)) {
	core.logger.error("The Runtime folder couldn't be located, please re-read the installation instructions!")
}

if (!fs.existsSync(path.join(core.config.retailPath, "Runtime", "chunk0.rpkg")) && !fs.existsSync(path.join(core.config.runtimePath, "..", "Retail", "HITMAN3.exe"))) {
	core.logger.error("HITMAN3.exe couldn't be located, please re-read the installation instructions!")
}

if (fs.existsSync(path.join(core.config.retailPath, "Runtime", "chunk0.rpkg")) && !fs.existsSync(path.join(core.config.retailPath, "..", "MicrosoftGame.Config"))) {
	core.logger.error("The game config couldn't be located, please re-read the installation instructions!")
}

if (fs.existsSync(path.join(core.config.retailPath, "Runtime", "chunk0.rpkg"))) {
	try {
		fs.accessSync(path.join(core.config.retailPath, "thumbs.dat"), fs.constants.R_OK | fs.constants.W_OK)
	} catch {
		core.logger.error("thumbs.dat couldn't be accessed; try running Mod Manager.exe in the similarly named folder as administrator!")
	}
}

core.config.platform = fs.existsSync(path.join(core.config.retailPath, "Runtime", "chunk0.rpkg"))
	? gameHashes[md5File.sync(path.join(core.config.retailPath, "..", "MicrosoftGame.Config"))]
	: gameHashes[md5File.sync(path.join(core.config.runtimePath, "..", "Retail", "HITMAN3.exe"))] // Platform detection

if (typeof core.config.platform == "undefined") {
	core.logger.error("Unknown platform/game version - update both the game and the framework and if that doesn't work, contact Atampy26 on Hitman Forum!")
}

core.interoperability.sentryTransaction = {
	startChild(...args) {
		return {
			startChild(...args) {
				return {
					startChild(...args) {
						return {
							startChild(...args) {
								return {
									startChild(...args) {
										return {
											startChild(...args) {
												return {
													startChild(...args) {
														return {
															finish(...args) {}
														}
													},
													finish(...args) {}
												}
											},
											finish(...args) {}
										}
									},
									finish(...args) {}
								}
							},
							finish(...args) {}
						}
					},
					finish(...args) {}
				}
			},
			finish(...args) {}
		}
	},
	finish(...args) {}
} as Transaction

function configureSentryScope(transaction: Span) {
	if (core.config.reportErrors)
		Sentry.configureScope((scope) => {
			scope.setSpan(transaction)
		})
}

core.interoperability.cleanExit = function () {
	if (core.config.reportErrors) {
		Sentry.getCurrentHub().getScope()!.getTransaction()!.finish()

		core.interoperability.sentryTransaction.finish()
	}

	Sentry.close(2000).then(() => {
		core.rpkgInstance.exit()
		try {
			// @ts-expect-error Assigning stuff on global is probably bad practice
			global.currentWorkerPool.destroy()
		} catch {}
		process.exit()
	})
}

if (core.config.reportErrors) {
	core.logger.info("Initialising error reporting")

	Sentry.init({
		dsn: "https://464c3dd1424b4270803efdf7885c1b90@o1144555.ingest.sentry.io/6208676",
		release: core.isDevBuild ? "dev" : core.FrameworkVersion,
		environment: core.isDevBuild ? "dev" : "production",
		tracesSampleRate: 1.0,
		integrations: [
			new Sentry.Integrations.OnUncaughtException({
				onFatalError: (err) => {
					core.logger.error("Uncaught exception! " + err, false)
					core.logger.info("Reporting the error!")
					core.interoperability.cleanExit()
				}
			}),
			new Sentry.Integrations.OnUnhandledRejection({
				mode: "strict"
			})
		]
	})

	Sentry.setUser({
		id: core.config.errorReportingID!
	})

	// @ts-expect-error TypeScript what are you on
	core.interoperability.sentryTransaction = Sentry.startTransaction({
		op: "deploy",
		name: "Deploy"
	})

	Sentry.configureScope((scope) => {
		scope.setSpan(core.interoperability.sentryTransaction)
	})

	Sentry.setTag(
		"game_hash",
		fs.existsSync(path.join(core.config.retailPath, "Runtime", "chunk0.rpkg"))
			? md5File.sync(path.join(core.config.retailPath, "..", "MicrosoftGame.Config"))
			: md5File.sync(path.join(core.config.runtimePath, "..", "Retail", "HITMAN3.exe"))
	)
}

process.on("SIGINT", core.interoperability.cleanExit)
process.on("SIGTERM", core.interoperability.cleanExit)

async function doTheThing() {
	const startedDate = DateTime.now()

	core.logger.verbose("Initialising RPKG instance")
	await core.rpkgInstance.waitForInitialised()

	core.logger.verbose("Removing existing patch files")
	for (const chunkPatchFile of fs.readdirSync(core.config.runtimePath)) {
		try {
			if (chunkPatchFile.includes("patch")) {
				const chunkPatchNumberMatches = [...chunkPatchFile.matchAll(/chunk[0-9]*patch([0-9]*)\.rpkg/g)]
				const chunkPatchNumber = parseInt(chunkPatchNumberMatches[chunkPatchNumberMatches.length - 1][chunkPatchNumberMatches[chunkPatchNumberMatches.length - 1].length - 1])

				if (chunkPatchNumber >= 200 && chunkPatchNumber <= 300) {
					// The mod framework manages patch files between 200 (inc) and 300 (inc), allowing mods to place runtime files in those ranges
					fs.rmSync(path.join(core.config.runtimePath, chunkPatchFile))
				}
			} else if (parseInt(chunkPatchFile.split(".")[0].slice(5)) > 28) {
				fs.rmSync(path.join(core.config.runtimePath, chunkPatchFile))
			}
		} catch {}
	}

	core.logger.verbose("Emptying folders")
	fs.emptyDirSync(path.join(process.cwd(), "staging"))
	fs.emptyDirSync(path.join(process.cwd(), "temp"))

	core.logger.verbose("Beginning discovery")
	const fileMap = await discover()
	fs.ensureDirSync(path.join(process.cwd(), "cache"))

	core.logger.verbose("Checking cache versions")
	if (fs.existsSync(path.join(process.cwd(), "cache", "map.json"))) {
		if (
			fs.readJSONSync(path.join(process.cwd(), "cache", "map.json")).frameworkVersion < core.FrameworkVersion ||
			fs.readJSONSync(path.join(process.cwd(), "cache", "map.json")).game !=
				(fs.existsSync(path.join(core.config.retailPath, "Runtime", "chunk0.rpkg"))
					? md5File.sync(path.join(core.config.retailPath, "..", "MicrosoftGame.Config"))
					: md5File.sync(path.join(core.config.runtimePath, "..", "Retail", "HITMAN3.exe")))
		) {
			fs.emptyDirSync(path.join(process.cwd(), "cache")) // Empty the cache when the framework or game updates
		}
	}

	core.logger.verbose("Beginning difference")
	const { invalidData } = await difference(fs.existsSync(path.join(process.cwd(), "cache", "map.json")) ? fs.readJSONSync(path.join(process.cwd(), "cache", "map.json")).files : {}, fileMap)

	core.logger.verbose("Writing cache")
	fs.writeJSONSync(path.join(process.cwd(), "cache", "map.json"), {
		files: fileMap,
		frameworkVersion: core.FrameworkVersion,
		game: fs.existsSync(path.join(core.config.retailPath, "Runtime", "chunk0.rpkg"))
			? md5File.sync(path.join(core.config.retailPath, "..", "MicrosoftGame.Config"))
			: md5File.sync(path.join(core.config.runtimePath, "..", "Retail", "HITMAN3.exe"))
	})

	core.logger.verbose("Beginning deploy")
	await deploy(core.interoperability.sentryTransaction, configureSentryScope, invalidData)

	core.logger.verbose("Finishing")

	// @ts-expect-error Assigning stuff on global is probably bad practice
	if (global.errored) {
		core.logger.error("Deploy failed.", false)
		core.interoperability.cleanExit()
	} else {
		if (core.config.outputConfigToAppDataOnDeploy) {
			fs.ensureDirSync(path.join(process.env.LOCALAPPDATA!, "Simple Mod Framework"))
			fs.writeFileSync(path.join(process.env.LOCALAPPDATA!, "Simple Mod Framework", "lastDeploy.json"), json5.stringify(core.config))
		}

		if (core.args["--useConsoleLogging"]) {
			core.logger.info("Deployed all mods successfully.")
		} else {
			core.logger.info(
				"Done " +
					DateTime.now()
						.plus({
							// @ts-expect-error TypeScript doesn't like date operations
							milliseconds: DateTime.now() - startedDate
						})
						.toRelative() +
					"."
			)
		}

		core.interoperability.cleanExit()
	}
}

doTheThing()
