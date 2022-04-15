const fs = require("fs-extra")
const klaw = require("klaw-sync")
const path = require("path")
const semver = require("semver")
const json5 = require("json5")
const LosslessJSON = require("lossless-json")
const xxhash3 = require("hash-wasm").xxhash3
const md5 = require("hash-wasm").md5
const deepMerge = require("lodash.merge")

const { config, FrameworkVersion, rpkgInstance, logger } = require("./core-singleton")

/**
 * @return {Promise<{ [x: string]: { hash: string; dependencies: string[]; affected: string[]; }; }>}
 */
module.exports = async function discover() {
	logger.info("Discovering mod contents")

	/** @type {{ [x: string]: { hash: string, dependencies: Array<string>, affected: Array<string> }; }} */
	const fileMap = {}

	for (let mod of config.loadOrder) {
		// NOT Mod folder exists, mod has no manifest, mod has RPKGs (mod is an RPKG-only mod)
		if (
			!(
				fs.existsSync(path.join(process.cwd(), "Mods", mod)) &&
				!fs.existsSync(path.join(process.cwd(), "Mods", mod, "manifest.json")) &&
				klaw(path.join(process.cwd(), "Mods", mod))
					.filter((a) => a.stats.isFile())
					.map((a) => a.path)
					.some((a) => a.endsWith(".rpkg"))
			)
		) {
			// Find mod with ID in Mods folder, set the current mod to that folder
			mod = fs
				.readdirSync(path.join(process.cwd(), "Mods"))
				.find(
					(a) => fs.existsSync(path.join(process.cwd(), "Mods", a, "manifest.json")) && json5.parse(String(fs.readFileSync(path.join(process.cwd(), "Mods", a, "manifest.json")))).id == mod
				)
		} // Essentially, if the mod isn't an RPKG mod, it is referenced by its ID, so this finds the mod folder with the right ID

		if (!fs.existsSync(path.join(process.cwd(), "Mods", mod, "manifest.json"))) {
			logger.info("Discovering RPKG mod: " + mod)

			for (let chunkFolder of fs.readdirSync(path.join(process.cwd(), "Mods", mod))) {
				for (let contentFile of fs.readdirSync(path.join(process.cwd(), "Mods", mod, chunkFolder))) {
					fs.emptyDirSync(path.join(process.cwd(), "temp"))

					await rpkgInstance.callFunction(`-extract_from_rpkg "${path.join(process.cwd(), "Mods", mod, chunkFolder, contentFile)}" -output_path "${path.join(process.cwd(), "temp")}"`)

					fileMap[path.join(process.cwd(), "Mods", mod, chunkFolder, contentFile)] = {
						hash: await xxhash3(fs.readFileSync(path.join(process.cwd(), "Mods", mod, chunkFolder, contentFile))),
						dependencies: [], // Raw files: depend on nothing, overwrite contained files
						affected: klaw(path.join(process.cwd(), "temp"))
							.filter((a) => a.stats.isFile())
							.filter((a) => !a.path.endsWith(".meta"))
							.map((a) => path.basename(a.path).split(".")[0])
					}

					fs.removeSync(path.join(process.cwd(), "temp"))
				}
			}
		} else {
			let manifest = json5.parse(String(fs.readFileSync(path.join(process.cwd(), "Mods", mod, "manifest.json"))))

			logger.info("Discovering mod: " + manifest.name)

			for (let key of ["id", "name", "description", "authors", "version", "frameworkVersion"]) {
				if (typeof manifest[key] == "undefined") {
					logger.error(`Mod ${manifest.name} is missing required manifest field "${key}"!`)
				}
			}

			if (semver.lt(manifest.frameworkVersion, FrameworkVersion)) {
				if (semver.diff(manifest.frameworkVersion, FrameworkVersion) == "major") {
					logger.error(`Mod ${manifest.name} is designed for an older version of the framework and is likely incompatible!`)
				}
			}

			if (semver.gt(manifest.frameworkVersion, FrameworkVersion)) {
				logger.error(`Mod ${manifest.name} is designed for a newer version of the framework and is likely incompatible!`)
			}

			let contentFolders = []
			let blobsFolders = []

			if (
				manifest.contentFolder &&
				manifest.contentFolder.length &&
				fs.existsSync(path.join(process.cwd(), "Mods", mod, manifest.contentFolder)) &&
				fs.readdirSync(path.join(process.cwd(), "Mods", mod, manifest.contentFolder)).length
			) {
				contentFolders.push(manifest.contentFolder)
			}

			if (
				manifest.blobsFolder &&
				manifest.blobsFolder.length &&
				fs.existsSync(path.join(process.cwd(), "Mods", mod, manifest.blobsFolder)) &&
				fs.readdirSync(path.join(process.cwd(), "Mods", mod, manifest.blobsFolder)).length
			) {
				blobsFolders.push(manifest.blobsFolder)
			}

			if (config.modOptions[manifest.id] && manifest.options && manifest.options.length) {
				for (let option of manifest.options.filter(
					(a) =>
						config.modOptions[manifest.id].includes(a.name) ||
						config.modOptions[manifest.id].includes(a.group + ":" + a.name) ||
						(a.type == "requirement" && a.mods.every((b) => config.loadOrder.includes(b)))
				)) {
					if (
						option.contentFolder &&
						option.contentFolder.length &&
						fs.existsSync(path.join(process.cwd(), "Mods", mod, option.contentFolder)) &&
						fs.readdirSync(path.join(process.cwd(), "Mods", mod, option.contentFolder)).length
					) {
						contentFolders.push(option.contentFolder)
					}

					if (
						option.blobsFolder &&
						option.blobsFolder.length &&
						fs.existsSync(path.join(process.cwd(), "Mods", mod, option.blobsFolder)) &&
						fs.readdirSync(path.join(process.cwd(), "Mods", mod, option.blobsFolder)).length
					) {
						blobsFolders.push(option.blobsFolder)
					}

					manifest.localisation || (manifest.localisation = {})
					option.localisation && deepMerge(manifest.localisation, option.localisation)

					manifest.localisationOverrides || (manifest.localisationOverrides = {})
					option.localisationOverrides && deepMerge(manifest.localisationOverrides, option.localisationOverrides)

					manifest.localisedLines || (manifest.localisedLines = {})
					option.localisedLines && deepMerge(manifest.localisedLines, option.localisedLines)

					manifest.runtimePackages || (manifest.runtimePackages = [])
					option.runtimePackages && manifest.runtimePackages.push(...option.runtimePackages)

					manifest.dependencies || (manifest.dependencies = [])
					option.dependencies && manifest.dependencies.push(...option.dependencies)

					manifest.requirements || (manifest.requirements = [])
					option.requirements && manifest.requirements.push(...option.requirements)

					manifest.supportedPlatforms || (manifest.supportedPlatforms = [])
					option.supportedPlatforms && manifest.supportedPlatforms.push(...option.supportedPlatforms)

					manifest.packagedefinition || (manifest.packagedefinition = [])
					option.packagedefinition && manifest.packagedefinition.push(...option.packagedefinition)

					manifest.thumbs || (manifest.thumbs = [])
					option.thumbs && manifest.thumbs.push(...option.thumbs)
				}
			}

			if (manifest.requirements && manifest.requirements.length) {
				for (let req of manifest.requirements) {
					if (!config.loadOrder.includes(req)) {
						logger.error(`Mod ${manifest.name} is missing requirement ${req}!`)
					}
				}
			}

			if (manifest.supportedPlatforms && manifest.supportedPlatforms.length) {
				if (!manifest.supportedPlatforms.includes(config.platform)) {
					logger.error(
						`Mod ${manifest.name} only supports the ${
							manifest.supportedPlatforms.slice(0, -1).length
								? manifest.supportedPlatforms.slice(0, -1).join(", ") + " and " + manifest.supportedPlatforms[manifest.supportedPlatforms.length - 1]
								: manifest.supportedPlatforms[0]
						} platform${manifest.supportedPlatforms.length > 1 ? "s" : ""}!`
					)
				}
			}

			/* ---------------------------------------------------------------------------------------------- */
			/*                                             Content                                            */
			/* ---------------------------------------------------------------------------------------------- */
			for (let contentFolder of contentFolders) {
				for (let chunkFolder of fs.readdirSync(path.join(process.cwd(), "Mods", mod, contentFolder))) {
					for (let contentFilePath of klaw(path.join(process.cwd(), "Mods", mod, contentFolder, chunkFolder))
						.filter((a) => a.stats.isFile())
						.map((a) => a.path)) {
						const dependencies = []
						const affected = []

						let entityContent
						switch (path.basename(contentFilePath).split(".").slice(1).join(".")) {
							case "entity.json": // Edits the given entity; doesn't depend on anything
								entityContent = LosslessJSON.parse(String(fs.readFileSync(contentFilePath)))

								affected.push(entityContent.tempHash, entityContent.tbluHash)
								break
							case "entity.patch.json": // Depends on and edits the patched entity
								entityContent = LosslessJSON.parse(String(fs.readFileSync(contentFilePath)))

								dependencies.push(entityContent.tempHash, entityContent.tbluHash)
								affected.push(entityContent.tempHash, entityContent.tbluHash)
								break
							case "unlockables.json": // Depends on and edits the unlockables ORES
								dependencies.push("0057C2C3941115CA")
								affected.push("0057C2C3941115CA")
								break
							case "repository.json": // Depends on and edits the repository
								dependencies.push("00204D1AFD76AB13")
								affected.push("00204D1AFD76AB13")
								break
							case "contract.json": // Edits the contract, depends on and edits the contracts ORES
								entityContent = LosslessJSON.parse(String(fs.readFileSync(contentFilePath)))

								affected.push("00" + (await md5(("smfContract" + entityContent.Metadata.Id).toLowerCase())).slice(2, 16).toUpperCase())

								dependencies.push("002B07020D21D727")
								affected.push("002B07020D21D727")
								break
							case "JSON.patch.json": // Depends on and edits the patched file
								entityContent = LosslessJSON.parse(String(fs.readFileSync(contentFilePath)))

								dependencies.push(entityContent.file)
								affected.push(entityContent.file)
								break
							case "texture.tga": // Depends on nothing, edits the texture files
								affected.push(...path.basename(contentFilePath).split(".")[0].split("~"))
								break
							case "sfx.wem": // Depends on and edits the patched WWEV
								dependencies.push(path.basename(contentFilePath).split(".")[0].split("~")[0])
								affected.push(path.basename(contentFilePath).split(".")[0].split("~")[0])
								break
							default:
								// Replaces a file with a raw file
								affected.push(path.basename(contentFilePath).split(".")[0])
								break
						}

						fileMap[contentFilePath] = {
							hash: await xxhash3(fs.readFileSync(contentFilePath)),
							dependencies,
							affected
						}
					}
				}
			}

			/* ---------------------------------------------------------------------------------------------- */
			/*                                              Blobs                                             */
			/* ---------------------------------------------------------------------------------------------- */
			if (blobsFolders.length) {
				for (let blobsFolder of blobsFolders) {
					for (let blob of klaw(path.join(process.cwd(), "Mods", mod, blobsFolder))
						.filter((a) => a.stats.isFile())
						.map((a) => a.path)) {
						let blobPath = blob.replace(path.join(process.cwd(), "Mods", mod, blobsFolder), "").slice(1).split(path.sep).join("/").toLowerCase()

						let blobHash
						if (path.extname(blob).startsWith(".jp") || path.extname(blob) == ".png") {
							blobHash = "00" + (await md5(`[assembly:/_pro/online/default/cloudstorage/resources/${blobPath}].pc_gfx`.toLowerCase())).slice(2, 16).toUpperCase()
						} else if (path.extname(blob) == ".json") {
							blobHash = "00" + (await md5(`[assembly:/_pro/online/default/cloudstorage/resources/${blobPath}].pc_json`.toLowerCase())).slice(2, 16).toUpperCase()
						} else {
							blobHash =
								"00" + (await md5(`[assembly:/_pro/online/default/cloudstorage/resources/${blobPath}].pc_${path.extname(blob).slice(1)}`.toLowerCase())).slice(2, 16).toUpperCase()
						}

						fileMap[blob] = {
							hash: await xxhash3(fs.readFileSync(blob)),
							dependencies: ["00858D45F5F9E3CA"],
							affected: ["00858D45F5F9E3CA", blobHash]
						}
					}
				}
			}

			const manifestDependencies = []
			const manifestAffected = []

			/* ---------------------------------------- Localisation ---------------------------------------- */
			if (manifest.localisation) {
				for (let language of Object.keys(manifest.localisation)) {
					for (let string of Object.entries(manifest.localisation[language])) {
						manifestDependencies.push("00F5817876E691F1")
						manifestAffected.push("00F5817876E691F1")
					}
				}
			}

			if (manifest.localisationOverrides) {
				for (let locrHash of Object.keys(manifest.localisationOverrides)) {
					manifestDependencies.push(locrHash)
					manifestAffected.push(locrHash)
				}
			}

			if (manifest.localisedLines) {
				for (let lineHash of Object.keys(manifest.localisedLines)) {
					manifestAffected.push(lineHash)
				}
			}

			fileMap[path.join(process.cwd(), "Mods", mod, "manifest.json")] = {
				hash: await xxhash3(fs.readFileSync(path.join(process.cwd(), "Mods", mod, "manifest.json"))),
				dependencies: manifestDependencies,
				affected: manifestAffected
			}
		}
	}

	Object.entries(fileMap).forEach((a) => {
		fileMap[a[0]] = {
			hash: a[1].hash,
			dependencies: [...new Set(a[1].dependencies)],
			affected: [...new Set(a[1].affected)]
		}
	})

	return fileMap
}

// TODO: invalidate all on game update
