import * as LosslessJSON from "lossless-json"
import * as ts from "./typescript"

import { FrameworkVersion, config, logger, rpkgInstance } from "./core-singleton"

import { type Manifest, OptionType, ModScript } from "./types"
import mergeWith from "lodash.mergewith"
import fs from "fs-extra"
import json5 from "json5"
import klaw from "klaw-sync"
import { md5 } from "hash-wasm"
import path from "path"
import semver from "semver"
import { xxhash3 } from "hash-wasm"
import { ModuleKind, ScriptTarget } from "typescript"
import { compileExpression, useDotAccessOperatorAndOptionalChaining } from "filtrex"

const deepMerge = function (x: any, y: any) {
	return mergeWith(x, y, (orig, src) => {
		if (Array.isArray(orig)) {
			return src
		}
	})
}

export default async function discover(): Promise<{ [x: string]: { hash: string; dependencies: string[]; affected: string[] } }> {
	await logger.info("Discovering mod contents")

	const fileMap: { [x: string]: { hash: string; dependencies: Array<string>; affected: Array<string> } } = {}

	// All base game TEMP and TBLU hashes
	const baseGameEntityHashes = new Set(
		fs
			.readFileSync(path.join(process.cwd(), "Third-Party", "baseGameHashes.txt"), "utf8")
			.split("\n")
			.map((a) => a.trim())
	)

	for (let mod of config.loadOrder) {
		await logger.verbose(`Resolving ${mod}`)

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
					(a) => fs.existsSync(path.join(process.cwd(), "Mods", a, "manifest.json")) && json5.parse(fs.readFileSync(path.join(process.cwd(), "Mods", a, "manifest.json"), "utf8")).id == mod
				)
		} // Essentially, if the mod isn't an RPKG mod, it is referenced by its ID, so this finds the mod folder with the right ID

		await logger.verbose(`Beginning mod discovery of ${mod}`)
		if (!fs.existsSync(path.join(process.cwd(), "Mods", mod, "manifest.json"))) {
			await logger.info("Discovering RPKG mod: " + mod)

			for (const chunkFolder of fs.readdirSync(path.join(process.cwd(), "Mods", mod))) {
				for (const contentFile of fs.readdirSync(path.join(process.cwd(), "Mods", mod, chunkFolder))) {
					fs.emptyDirSync(path.join(process.cwd(), "temp"))

					await logger.verbose(`-extract_from_rpkg "${path.join(process.cwd(), "Mods", mod, chunkFolder, contentFile)}" -output_path "${path.join(process.cwd(), "temp")}"`)
					await rpkgInstance.callFunction(`-extract_from_rpkg "${path.join(process.cwd(), "Mods", mod, chunkFolder, contentFile)}" -output_path "${path.join(process.cwd(), "temp")}"`)

					await logger.verbose(`Adding ${path.join(process.cwd(), "Mods", mod, chunkFolder, contentFile)} to fileMap`)
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
			const manifest: Manifest = json5.parse(fs.readFileSync(path.join(process.cwd(), "Mods", mod, "manifest.json"), "utf8"))

			await logger.info("Discovering mod: " + manifest.name)

			await logger.verbose("Validating manifest")

			for (const key of ["id", "name", "description", "authors", "version", "frameworkVersion"]) {
				if (typeof manifest[key] == "undefined") {
					await logger.error(`Mod ${manifest.name} is missing required manifest field "${key}"!`)
				}
			}

			if (semver.lt(manifest.frameworkVersion, FrameworkVersion)) {
				if (semver.diff(manifest.frameworkVersion, FrameworkVersion) == "major") {
					await logger.error(`Mod ${manifest.name} is designed for an older version of the framework and is likely incompatible!`)
				}
			}

			if (semver.gt(manifest.frameworkVersion, FrameworkVersion)) {
				await logger.error(`Mod ${manifest.name} is designed for a newer version of the framework and is likely incompatible!`)
			}

			await logger.verbose("Getting folders")

			let contentFolders: string[] = []
			let blobsFolders: string[] = []

			const scripts: string[][] = []

			for (const contentFolder of manifest.contentFolders || []) {
				if (
					contentFolder &&
					contentFolder.length &&
					fs.existsSync(path.join(process.cwd(), "Mods", mod, contentFolder)) &&
					fs.readdirSync(path.join(process.cwd(), "Mods", mod, contentFolder)).length
				) {
					contentFolders.push(contentFolder)
				}
			}

			for (const blobsFolder of manifest.blobsFolders || []) {
				if (
					blobsFolder &&
					blobsFolder.length &&
					fs.existsSync(path.join(process.cwd(), "Mods", mod, blobsFolder)) &&
					fs.readdirSync(path.join(process.cwd(), "Mods", mod, blobsFolder)).length
				) {
					blobsFolders.push(blobsFolder)
				}
			}

			manifest.scripts && scripts.push(manifest.scripts)

			if (config.modOptions[manifest.id] && manifest.options && manifest.options.length) {
				await logger.verbose("Merging mod options")

				for (const option of manifest.options.filter(
					(a) =>
						(a.type == OptionType.checkbox && config.modOptions[manifest.id].includes(a.name)) ||
						(a.type == OptionType.select && config.modOptions[manifest.id].includes(a.group + ":" + a.name)) ||
						(a.type == OptionType.conditional &&
							compileExpression(a.condition, { customProp: useDotAccessOperatorAndOptionalChaining })({
								config
							}))
				)) {
					for (const contentFolder of option.contentFolders || []) {
						if (
							contentFolder &&
							contentFolder.length &&
							fs.existsSync(path.join(process.cwd(), "Mods", mod, contentFolder)) &&
							fs.readdirSync(path.join(process.cwd(), "Mods", mod, contentFolder)).length
						) {
							contentFolders.push(contentFolder)
						}
					}

					for (const blobsFolder of option.blobsFolders || []) {
						if (
							blobsFolder &&
							blobsFolder.length &&
							fs.existsSync(path.join(process.cwd(), "Mods", mod, blobsFolder)) &&
							fs.readdirSync(path.join(process.cwd(), "Mods", mod, blobsFolder)).length
						) {
							blobsFolders.push(blobsFolder)
						}
					}

					manifest.localisation || (manifest.localisation = {})
					option.localisation && deepMerge(manifest.localisation, option.localisation)

					manifest.localisationOverrides || (manifest.localisationOverrides = {})
					option.localisationOverrides && deepMerge(manifest.localisationOverrides, option.localisationOverrides)

					manifest.localisedLines || (manifest.localisedLines = {})
					option.localisedLines && deepMerge(manifest.localisedLines, option.localisedLines)

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

					option.scripts && scripts.push(option.scripts)
				}
			}

			contentFolders = [...new Set(contentFolders)]
			blobsFolders = [...new Set(blobsFolders)]

			await logger.verbose("Validating manifest requirements")

			if (manifest.requirements && manifest.requirements.length) {
				for (const req of manifest.requirements) {
					if (!config.loadOrder.includes(req)) {
						await logger.error(`Mod ${manifest.name} is missing requirement ${req}!`)
					}
				}
			}

			if (manifest.supportedPlatforms && manifest.supportedPlatforms.length) {
				if (!manifest.supportedPlatforms.includes(config.platform)) {
					await logger.error(
						`Mod ${manifest.name} only supports the ${
							manifest.supportedPlatforms.slice(0, -1).length
								? manifest.supportedPlatforms.slice(0, -1).join(", ") + " and " + manifest.supportedPlatforms[manifest.supportedPlatforms.length - 1]
								: manifest.supportedPlatforms[0]
						} platform${manifest.supportedPlatforms.length > 1 ? "s" : ""}!`
					)
				}
			}

			await logger.verbose("Discovering scripts")
			for (const files of scripts) {
				ts.compile(
					files.map((a) => path.join(process.cwd(), "Mods", mod, a)),
					{
						esModuleInterop: true,
						allowJs: true,
						target: ScriptTarget.ES2019,
						module: ModuleKind.CommonJS,
						resolveJsonModule: true
					},
					path.join(process.cwd(), "Mods", mod)
				)

				// eslint-disable-next-line @typescript-eslint/no-var-requires
				const modScript = (await require(path.join(
					process.cwd(),
					"compiled",
					path.relative(path.join(process.cwd(), "Mods", mod), path.join(process.cwd(), "Mods", mod, files[0].replace(".ts", ".js")))
				))) as ModScript

				for (const file of files) {
					fileMap[file] = {
						hash: await xxhash3(fs.readFileSync(file)),
						dependencies: [],
						affected: modScript.cachingPolicy.affected
					}
				}

				fs.removeSync(path.join(process.cwd(), "compiled"))
			}

			await logger.verbose("Discovering content")

			/* ---------------------------------------------------------------------------------------------- */
			/*                                             Content                                            */
			/* ---------------------------------------------------------------------------------------------- */
			for (const contentFolder of contentFolders) {
				for (const chunkFolder of fs.readdirSync(path.join(process.cwd(), "Mods", mod, contentFolder))) {
					for (const contentFilePath of klaw(path.join(process.cwd(), "Mods", mod, contentFolder, chunkFolder))
						.filter((a) => a.stats.isFile())
						.map((a) => a.path)) {
						const dependencies = []
						const affected = []

						let entityContent
						let fileToReplace
						switch (path.basename(contentFilePath).split(".").slice(1).join(".")) {
							case "entity.json": // Edits the given entity; doesn't depend on anything
								entityContent = LosslessJSON.parse(fs.readFileSync(contentFilePath, "utf8"))

								if (+entityContent.quickEntityVersion < 3) {
									await logger.info(
										`Mod ${manifest.name} uses a version of QuickEntity prior to 3.0 in ${path.basename(
											contentFilePath
										)}. This makes deployment of this file significantly slower. Mod developers can fix this easily by using an automatic updater available at the QuickEntity 3.1 GitHub releases.`
									)
								}

								affected.push(entityContent.tempHash, entityContent.tbluHash)
								break
							case "entity.patch.json": // Depends on and edits the patched entity
								entityContent = LosslessJSON.parse(fs.readFileSync(contentFilePath, "utf8"))

								if (+entityContent.patchVersion < 5) {
									await logger.info(
										`Mod ${manifest.name} uses a version of QuickEntity prior to 3.0 in ${path.basename(
											contentFilePath
										)}. This makes deployment of this file significantly slower. Mod developers can fix this easily by using an automatic updater available at the QuickEntity 3.1 GitHub releases.`
									)
								} else if (+entityContent.patchVersion < 6) {
									await logger.info(
										`Mod ${manifest.name} uses a QuickEntity 3.0 patch in ${path.basename(
											contentFilePath
										)}. This is acceptable in most cases but can cause compatibility issues. Mod developers can fix this easily by using an automatic updater available at the QuickEntity 3.1 GitHub releases.`
									)
								}

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
								entityContent = LosslessJSON.parse(fs.readFileSync(contentFilePath, "utf8"))

								affected.push("00" + (await md5(("smfContract" + entityContent.Metadata.Id).toLowerCase())).slice(2, 16).toUpperCase())

								dependencies.push("002B07020D21D727")
								affected.push("002B07020D21D727")
								break
							case "JSON.patch.json": // Depends on and edits the patched file
								entityContent = LosslessJSON.parse(fs.readFileSync(contentFilePath, "utf8"))

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
							case "delta": // Depends on and edits the patched file
								dependencies.push(path.basename(contentFilePath).split(".")[0].split("~")[0])
								affected.push(path.basename(contentFilePath).split(".")[0].split("~")[0])
								break
							default: // Replaces a file with a raw file
								fileToReplace = path.basename(contentFilePath).split(".")[0]

								if (baseGameEntityHashes.has(fileToReplace)) {
									await logger.warn(
										`Mod ${manifest.name} replaces a base game entity file (${fileToReplace}) with a raw file. This can cause compatibility issues, it makes the mod harder to work with and it requires more work when the game updates. Mod developers can fix this easily by using an entity.patch.json file.`
									)
								}

								if (fileToReplace == "00204D1AFD76AB13") {
									await logger.warn(
										`Mod ${manifest.name} replaces the repository file (${fileToReplace}) in its entirety. This can cause compatibility issues, it makes the mod harder to work with and it requires more work when the game updates. Mod developers can fix this easily by using a repository.json or JSON.patch.json file.`
									)
								}

								if (fileToReplace == "0057C2C3941115CA") {
									await logger.warn(
										`Mod ${manifest.name} replaces the unlockables file (${fileToReplace}) in its entirety. This can cause compatibility issues, it makes the mod harder to work with and it requires more work when the game updates. Mod developers can fix this easily by using an unlockables.json or JSON.patch.json file.`
									)
								}

								if (path.basename(contentFilePath).split(".")[1] == "WWEV") {
									await logger.warn(
										`Mod ${manifest.name} replaces a sound bank file in its entirety. This can cause compatibility issues, it makes the mod harder to work with and it can require more work when the game updates. Mod developers can fix this easily by using an sfx.wem file.`
									)
								}

								affected.push(fileToReplace)
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

			await logger.verbose("Discovering blobs")

			/* ---------------------------------------------------------------------------------------------- */
			/*                                              Blobs                                             */
			/* ---------------------------------------------------------------------------------------------- */
			if (blobsFolders.length) {
				for (const blobsFolder of blobsFolders) {
					for (const blob of klaw(path.join(process.cwd(), "Mods", mod, blobsFolder))
						.filter((a) => a.stats.isFile())
						.map((a) => a.path)) {
						const blobPath = blob.replace(path.join(process.cwd(), "Mods", mod, blobsFolder), "").slice(1).split(path.sep).join("/").toLowerCase()

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

			await logger.verbose("Discovering manifest keys")

			/* ---------------------------------------- Localisation ---------------------------------------- */
			if (manifest.localisation) {
				for (const language of Object.keys(manifest.localisation)) {
					for (const string of Object.entries(manifest.localisation[language])) {
						manifestDependencies.push("00F5817876E691F1")
						manifestAffected.push("00F5817876E691F1")
					}
				}
			}

			if (manifest.localisationOverrides) {
				for (const locrHash of Object.keys(manifest.localisationOverrides)) {
					manifestDependencies.push(locrHash)
					manifestAffected.push(locrHash)
				}
			}

			if (manifest.localisedLines) {
				for (const lineHash of Object.keys(manifest.localisedLines)) {
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
