// @ts-ignore
// eslint-disable-next-line no-undef
THREE = require("./three-onlymath.min")

const fs = require("fs-extra")
const path = require("path")

const json5 = require("json5")
const luxon = require("luxon")
const md5File = require("md5-file")

const Sentry = require("@sentry/node")
const Tracing = require("@sentry/tracing")

const core = require("./core-singleton")

const discover = require("./discover")
const difference = require("./difference")
const deploy = require("./deploy")

require("clarify")

const gameHashes = {
	// prettier-ignore
	"f8bff5b368f88845af690c61fbf34619": "epic",
	"1ab6a5e004d6c3ff4f330a9a8aa0e3bf": "epic",
	"006b544ef4547fa9926c6db33ab1d6b3": "steam",
	"0ccb00174e1cca55deb6b07d37d75f53": "microsoft"
	// Gamepass/store protects the EXE from reading so we can't hash it, instead we hash the game config
}

if (!core.config.reportErrors) {
	process.on("uncaughtException", (err, origin) => {
		if (!process.argv[2] || process.argv[2] == "kevinMode") {
			core.logger.warn("Error reporting is disabled; if you experience this issue again, please enable it so that the problem can be debugged.")
		}

		core.logger.error("Uncaught exception! " + err, false)
		console.error(origin)
		core.interoperability.cleanExit()
	})

	process.on("unhandledRejection", (err, origin) => {
		if (!process.argv[2] || process.argv[2] == "kevinMode") {
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
															finish() {}
														}
													},
													finish() {}
												}
											},
											finish() {}
										}
									},
									finish() {}
								}
							},
							finish() {}
						}
					},
					finish() {}
				}
			},
			finish() {}
		}
	},
	finish() {}
}

function configureSentryScope(transaction) {
	if (core.config.reportErrors)
		Sentry.configureScope((scope) => {
			// @ts-ignore
			scope.setSpan(transaction)
		})
}

core.interoperability.cleanExit = function () {
	if (core.config.reportErrors) {
		Sentry.getCurrentHub().getScope().getTransaction().finish()

		core.interoperability.sentryTransaction.finish()
	}

	Sentry.close(2000).then(() => {
		core.rpkgInstance.exit()
		try {
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
		id: core.config.errorReportingID
	})

	core.interoperability.sentryTransaction = Sentry.startTransaction({
		op: "deploy",
		name: "Deploy"
	})

	Sentry.configureScope((scope) => {
		// @ts-ignore
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
	let startedDate = luxon.DateTime.now()

	await core.rpkgInstance.waitForInitialised()

	for (let chunkPatchFile of fs.readdirSync(core.config.runtimePath)) {
		try {
			if (chunkPatchFile.includes("patch")) {
				let chunkPatchNumberMatches = [...chunkPatchFile.matchAll(/chunk[0-9]*patch([0-9]*)\.rpkg/g)]
				let chunkPatchNumber = parseInt(chunkPatchNumberMatches[chunkPatchNumberMatches.length - 1][chunkPatchNumberMatches[chunkPatchNumberMatches.length - 1].length - 1])

				if (chunkPatchNumber >= 200 && chunkPatchNumber <= 300) {
					// The mod framework manages patch files between 200 (inc) and 300 (inc), allowing mods to place runtime files in those ranges
					fs.rmSync(path.join(core.config.runtimePath, chunkPatchFile))
				}
			} else if (parseInt(chunkPatchFile.split(".")[0].slice(5)) > 27) {
				fs.rmSync(path.join(core.config.runtimePath, chunkPatchFile))
			}
		} catch {}
	}

	fs.emptyDirSync(path.join(process.cwd(), "staging"))
	fs.emptyDirSync(path.join(process.cwd(), "temp"))

	let thumbs = []
	let packagedefinition = []
	let localisation = []
	let localisationOverrides = {}
	let runtimePackages = []
	let WWEVpatches = {}

	/** @type {{ [x: string]: string; }} */
	let rpkgTypes = {}

	const fileMap = await discover()
	fs.ensureDirSync(path.join(process.cwd(), "cache"))

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

	const { invalidData, cachedData } = await difference(
		fs.existsSync(path.join(process.cwd(), "cache", "map.json")) ? fs.readJSONSync(path.join(process.cwd(), "cache", "map.json")).files : {},
		fileMap
	)

	fs.writeJSONSync(path.join(process.cwd(), "cache", "map.json"), {
		files: fileMap,
		frameworkVersion: core.FrameworkVersion,
		game: fs.existsSync(path.join(core.config.retailPath, "Runtime", "chunk0.rpkg"))
			? md5File.sync(path.join(core.config.retailPath, "..", "MicrosoftGame.Config"))
			: md5File.sync(path.join(core.config.runtimePath, "..", "Retail", "HITMAN3.exe"))
	})

	await deploy(
		core.interoperability.sentryTransaction,
		configureSentryScope,
		invalidData,
		cachedData,
		rpkgTypes,
		WWEVpatches,
		runtimePackages,
		packagedefinition,
		thumbs,
		localisation,
		localisationOverrides
	)

	if (global.errored) {
		core.logger.error("Deploy failed.", false)
		core.interoperability.cleanExit()
	} else {
		if (core.config.outputConfigToAppDataOnDeploy) {
			fs.ensureDirSync(path.join(process.env.LOCALAPPDATA, "Simple Mod Framework"))
			fs.writeFileSync(path.join(process.env.LOCALAPPDATA, "Simple Mod Framework", "lastDeploy.json"), json5.stringify(core.config))
		}

		if (process.argv[2]) {
			core.logger.info("Deployed all mods successfully.")
		} else {
			core.logger.info(
				"Done " +
					luxon.DateTime.now()
						.plus({
							// @ts-ignore
							milliseconds: luxon.DateTime.now() - startedDate
						})
						.toRelative() +
					"."
			)
		}

		core.interoperability.cleanExit()
	}
}

doTheThing()
