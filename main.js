// @ts-ignore
// eslint-disable-next-line no-undef
THREE = require("./three-onlymath.min")

const fs = require("fs-extra")
const path = require("path")

const json5 = require("json5")
const luxon = require("luxon")
const md5File = require("md5-file")

const core = require("./core")

const { logger } = require("./utils")

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

process.on("SIGINT", core.cleanExit)
process.on("SIGTERM", core.cleanExit)

if (!core.config.reportErrors) {
	process.on("uncaughtException", (err, origin) => {
		if (!process.argv[2] || process.argv[2] == "kevinMode") {
			logger.warn(
				"Error reporting is disabled; if you experience this issue again, please enable it so that the problem can be debugged."
			)
		}

		logger.error("Uncaught exception! " + err, false)
		console.error(origin)
		core.cleanExit()
	})

	process.on("unhandledRejection", (err, origin) => {
		if (!process.argv[2] || process.argv[2] == "kevinMode") {
			logger.warn(
				"Error reporting is disabled; if you experience this issue again, please enable it so that the problem can be debugged."
			)
		}

		logger.error("Unhandled promise rejection! " + err, false)
		console.error(origin)
		core.cleanExit()
	})
}

if (!fs.existsSync(core.config.runtimePath)) {
	logger.error(
		"The Runtime folder couldn't be located, please re-read the installation instructions!"
	)
}

if (
	!fs.existsSync(path.join(core.config.retailPath, "Runtime", "chunk0.rpkg")) &&
	!fs.existsSync(path.join(core.config.runtimePath, "..", "Retail", "HITMAN3.exe"))
) {
	logger.error("HITMAN3.exe couldn't be located, please re-read the installation instructions!")
}

if (
	fs.existsSync(path.join(core.config.retailPath, "Runtime", "chunk0.rpkg")) &&
	!fs.existsSync(path.join(core.config.retailPath, "..", "MicrosoftGame.Config"))
) {
	logger.error(
		"The game config couldn't be located, please re-read the installation instructions!"
	)
}

core.config.platform = fs.existsSync(path.join(core.config.retailPath, "Runtime", "chunk0.rpkg"))
	? gameHashes[md5File.sync(path.join(core.config.retailPath, "..", "MicrosoftGame.Config"))]
	: gameHashes[md5File.sync(path.join(core.config.runtimePath, "..", "Retail", "HITMAN3.exe"))] // Platform detection

if (typeof core.config.platform == "undefined") {
	logger.error(
		"Unknown platform/game version - update both the game and the framework and if that doesn't work, contact Atampy26 on Hitman Forum!"
	)
}

async function doTheThing() {
	let startedDate = luxon.DateTime.now()

	await core.rpkgInstance.waitForInitialised()

	for (let chunkPatchFile of fs.readdirSync(core.config.runtimePath)) {
		try {
			if (chunkPatchFile.includes("patch")) {
				let chunkPatchNumberMatches = [
					...chunkPatchFile.matchAll(/chunk[0-9]*patch([0-9]*)\.rpkg/g)
				]
				let chunkPatchNumber = parseInt(
					chunkPatchNumberMatches[chunkPatchNumberMatches.length - 1][
						chunkPatchNumberMatches[chunkPatchNumberMatches.length - 1].length - 1
					]
				)

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

	let rpkgTypes = {}

	await deploy(
		rpkgTypes,
		WWEVpatches,
		runtimePackages,
		packagedefinition,
		thumbs,
		localisation,
		localisationOverrides
	)

	if (core.config.outputConfigToAppDataOnDeploy) {
		fs.ensureDirSync(path.join(process.env.LOCALAPPDATA, "Simple Mod Framework"))
		fs.writeFileSync(
			path.join(process.env.LOCALAPPDATA, "Simple Mod Framework", "lastDeploy.json"),
			json5.stringify(core.config)
		)
	}

	if (process.argv[2]) {
		logger.info("Deployed all mods successfully.")
	} else {
		logger.info(
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

	core.cleanExit()
}

doTheThing()
