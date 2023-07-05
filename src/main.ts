import * as Sentry from "@sentry/node"
import * as Tracing from "@sentry/tracing"

import { DateTime, Duration, DurationLikeObject } from "luxon"
import type { Span, Transaction } from "@sentry/tracing"

import { Platform } from "./types"
import core from "./core-singleton"
import deploy from "./deploy"
import difference from "./difference"
import discover from "./discover"
import fs from "fs-extra"
import md5File from "md5-file"
import path from "path"
import { xxhash3 } from "hash-wasm"

require("clarify")

const gameHashes = {
	f9b0347f278b533ace9a744b5b5353f9: Platform.epic, // base game
	c811d53d32fe1dc4e44546df2ab45638: Platform.epic, // ansel unlock
	"1e245f331499dfd25206276e58f0f81f": Platform.epic, // ansel no collision
	f0c6daf3f4610965c45aba2c9edda254: Platform.epic, // ansel unlock + no collision
	"81f5ec2450d4369583d28495445311f6": Platform.steam, // base game
	d5a26538d4500aac83a4767293f10921: Platform.steam, // ansel unlock
	"7be8ce65668d007d4d1f4d0ab80153e3": Platform.steam, // ansel no collision
	c5dcb9edd2c348ca21bcd490a867f717: Platform.steam, // ansel unlock + no collision

	// Gamepass/store protects the EXE from reading so we can't hash it, instead we hash the game config
	"05a3152429d216c83a612dfbc25d3e63": Platform.microsoft
} as {
	[k: string]: Platform
}

if (!core.config.reportErrors) {
	process.on("uncaughtException", (err, origin) => {
		void (async () => {
			if (!core.args["--useConsoleLogging"]) {
				await core.logger.warn("Error reporting is disabled; if you experience this issue again, please enable it so that the problem can be debugged.")
			}

			await core.logger.error(`Uncaught exception! ${err}`, false)
			console.error(origin)
			await core.cleanExit()
		})()
	})

	process.on("unhandledRejection", (err, origin) => {
		void (async () => {
			if (!core.args["--useConsoleLogging"]) {
				await core.logger.warn("Error reporting is disabled; if you experience this issue again, please enable it so that the problem can be debugged.")
			}

			await core.logger.error(`Unhandled promise rejection! ${err}`, false)
			console.error(origin)
			await core.cleanExit()
		})()
	})
}

if (!fs.existsSync(core.config.runtimePath)) {
	void core.logger.error("The Runtime folder couldn't be located, please re-read the installation instructions!")
}

if (!(fs.existsSync(path.join(core.config.retailPath, "Runtime", "chunk0.rpkg")) || fs.existsSync(path.join(core.config.runtimePath, "..", "Retail", "HITMAN3.exe")))) {
	void core.logger.error("HITMAN3.exe couldn't be located, please re-read the installation instructions!")
}

if (fs.existsSync(path.join(core.config.retailPath, "Runtime", "chunk0.rpkg")) && !fs.existsSync(path.join(core.config.retailPath, "..", "MicrosoftGame.Config"))) {
	void core.logger.error("The game config couldn't be located, please re-read the installation instructions!")
}

if (fs.existsSync(path.join(core.config.retailPath, "Runtime", "chunk0.rpkg"))) {
	try {
		fs.accessSync(path.join(core.config.retailPath, "thumbs.dat"), fs.constants.R_OK | fs.constants.W_OK)
	} catch {
		void core.logger.error("thumbs.dat couldn't be accessed; try running Mod Manager.exe in the similarly named folder as administrator!")
	}
}

core.config.platform = fs.existsSync(path.join(core.config.retailPath, "Runtime", "chunk0.rpkg"))
	? gameHashes[md5File.sync(path.join(core.config.retailPath, "..", "MicrosoftGame.Config"))]
	: gameHashes[md5File.sync(path.join(core.config.runtimePath, "..", "Retail", "HITMAN3.exe"))] // Platform detection

let sentryTransaction = {
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

function toHuman(dur: Duration) {
	const units: (keyof DurationLikeObject)[] = ["years", "months", "days", "hours", "minutes", "seconds", "milliseconds"]
	const smallestIdx = units.indexOf("seconds")
	const entries = Object.entries(
		dur
			.shiftTo(...units)
			.normalize()
			.toObject()
	).filter(([_, amount], idx) => amount > 0 && idx <= smallestIdx)
	return entries.map((a) => a[1] + a[0][0]).join("")
}

process.on("SIGINT", () => void core.logger.error("Received SIGINT signal"))
process.on("SIGTERM", () => void core.logger.error("Received SIGTERM signal"))

async function doTheThing() {
	if (typeof core.config.platform === "undefined") {
		await core.logger.error(
			"Could not detect a workable game copy! If the game has recently updated, the framework will also need an update. If you're using a cracked version, that sounds like a you problem."
		)
	}

	const startedDate = DateTime.now()

	if (core.config.reportErrors) {
		await core.logger.info("Initialising error reporting")

		Sentry.init({
			dsn: "https://464c3dd1424b4270803efdf7885c1b90@o1144555.ingest.sentry.io/6208676",
			release: core.isDevBuild ? "dev" : core.FrameworkVersion,
			environment: core.isDevBuild ? "dev" : "production",
			tracesSampleRate: 0.5,
			integrations: [
				new Sentry.Integrations.OnUncaughtException({
					onFatalError: (err) => {
						if (!String(err).includes("write EPIPE")) {
							void core.logger.info("Reporting an error:").then(() => {
								void core.logger.error(`Uncaught exception! ${err}`, false)
							})
						}
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
		sentryTransaction = Sentry.startTransaction({
			op: "deploy",
			name: "Deploy"
		})

		Sentry.configureScope((scope) => {
			scope.setSpan(sentryTransaction)
		})

		Sentry.setTag(
			"game_hash",
			fs.existsSync(path.join(core.config.retailPath, "Runtime", "chunk0.rpkg"))
				? md5File.sync(path.join(core.config.retailPath, "..", "MicrosoftGame.Config"))
				: md5File.sync(path.join(core.config.runtimePath, "..", "Retail", "HITMAN3.exe"))
		)
	}

	await core.logger.verbose("Initialising RPKG instance")
	await core.rpkgInstance.waitForInitialised()

	await core.logger.verbose("Removing existing patch files")
	for (const chunkPatchFile of fs.readdirSync(core.config.runtimePath)) {
		try {
			if (chunkPatchFile.includes("patch")) {
				const chunkPatchNumberMatches = [...chunkPatchFile.matchAll(/chunk[0-9]*patch([0-9]*)\.rpkg/g)]
				const chunkPatchNumber = parseInt(chunkPatchNumberMatches[chunkPatchNumberMatches.length - 1][chunkPatchNumberMatches[chunkPatchNumberMatches.length - 1].length - 1])

				if (chunkPatchNumber >= 200 && chunkPatchNumber <= 300) {
					// The mod framework manages patch files between 200 (inc) and 300 (inc), allowing mods to place runtime files in those ranges
					fs.rmSync(path.join(core.config.runtimePath, chunkPatchFile))
				}
			} else if (parseInt(chunkPatchFile.split(".")[0].slice(5)) > 29) {
				fs.rmSync(path.join(core.config.runtimePath, chunkPatchFile))
			}
		} catch {}
	}

	await core.logger.verbose("Emptying folders")
	fs.emptyDirSync(path.join(process.cwd(), "staging"))
	fs.emptyDirSync(path.join(process.cwd(), "temp"))

	await core.logger.verbose("Beginning discovery")
	const fileMap = await discover()
	fs.ensureDirSync(path.join(process.cwd(), "cache"))

	await core.logger.verbose("Checking cache versions")
	if (fs.existsSync(path.join(process.cwd(), "cache", "map.json"))) {
		if (
			fs.readJSONSync(path.join(process.cwd(), "cache", "map.json")).frameworkVersion < core.FrameworkVersion ||
			fs.readJSONSync(path.join(process.cwd(), "cache", "map.json")).game !==
				(fs.existsSync(path.join(core.config.retailPath, "Runtime", "chunk0.rpkg"))
					? md5File.sync(path.join(core.config.retailPath, "..", "MicrosoftGame.Config"))
					: md5File.sync(path.join(core.config.runtimePath, "..", "Retail", "HITMAN3.exe")))
		) {
			fs.emptyDirSync(path.join(process.cwd(), "cache")) // Empty the cache when the framework or game updates
		}
	}

	await core.logger.verbose("Beginning difference")
	const { invalidData } = await difference(fs.existsSync(path.join(process.cwd(), "cache", "map.json")) ? fs.readJSONSync(path.join(process.cwd(), "cache", "map.json")).files : {}, fileMap)

	await core.logger.verbose("Writing cache")
	fs.writeJSONSync(path.join(process.cwd(), "cache", "map.json"), {
		files: fileMap,
		frameworkVersion: core.FrameworkVersion,
		game: fs.existsSync(path.join(core.config.retailPath, "Runtime", "chunk0.rpkg"))
			? md5File.sync(path.join(core.config.retailPath, "..", "MicrosoftGame.Config"))
			: md5File.sync(path.join(core.config.runtimePath, "..", "Retail", "HITMAN3.exe"))
	})

	await core.logger.verbose("Beginning deploy")
	const { lastServerSideStates } = (await deploy(sentryTransaction, configureSentryScope, invalidData))!

	await core.logger.verbose("Finishing")

	if (core.config.outputConfigToAppDataOnDeploy) {
		fs.ensureDirSync(path.join(process.env.LOCALAPPDATA!, "Simple Mod Framework"))
		fs.writeFileSync(
			path.join(process.env.LOCALAPPDATA!, "Simple Mod Framework", "lastDeploy.json"),
			JSON.stringify({
				...core.config,
				lastServerSideStates: {
					unlockables: lastServerSideStates.unlockables,
					contracts: lastServerSideStates.contracts,
					blobs: lastServerSideStates.blobs ? Object.fromEntries(await Promise.all(Object.entries(lastServerSideStates.blobs).map(async (a) => [a[0], await xxhash3(a[1])]))) : undefined
				}
			})
		)

		if (lastServerSideStates.blobs) {
			fs.emptyDirSync(path.join(process.env.LOCALAPPDATA!, "Simple Mod Framework", "blobs"))
			for (const x of Object.values(lastServerSideStates.blobs)) {
				fs.writeFileSync(path.join(process.env.LOCALAPPDATA!, "Simple Mod Framework", "blobs", await xxhash3(x)), Buffer.from(x, "base64"))
			}
		}
	}

	await core.logger.info(`Done in ${toHuman(startedDate.until(DateTime.now()).toDuration()) || "less than a second"}`)

	await core.cleanExit()
}

void doTheThing()
