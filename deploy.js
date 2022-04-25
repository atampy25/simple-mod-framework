const QuickEntity = {
	"0.1": require("./quickentity1136"),
	"2.0": require("./quickentity20"),
	"2.1": require("./quickentity"),

	"999.999": require("./quickentity")
}

const fs = require("fs-extra")
const path = require("path")
const child_process = require("child_process")
const LosslessJSON = require("lossless-json")
const md5 = require("md5")
const deepMerge = require("lodash.merge")

const {
	// @ts-ignore
	crc32
} = require("./crc32")

const os = require("os")
const json5 = require("json5")
const klaw = require("klaw-sync")
const rfc6902 = require("rfc6902")

// @ts-ignore
const Piscina = require("piscina")

const { config, rpkgInstance, logger } = require("./core-singleton")

const { extractOrCopyToTemp, copyFromCache, copyToCache, hexflip } = require("./utils")

module.exports = async function deploy(
	sentryTransaction,
	configureSentryScope,
	/** @type {{ filePath: string; data: { hash: string; dependencies: string[]; affected: string[]; }; }[]} */ invalidatedData,
	/** @type {{ filePath: string; data: { hash: string; dependencies: string[]; affected: string[]; }; }[]} */ cachedData,
	/** @type {{ [x: string]: string; }} */ rpkgTypes,
	/** @type {{ [s: string]: any; }} */ WWEVpatches,
	/** @type {any[]} */ runtimePackages,
	/** @type {any[]} */ packagedefinition,
	/** @type {any[]} */ thumbs,
	/** @type {any[]} */ localisation,
	/** @type {{ [x: string]: any; }} */ localisationOverrides
) {
	let sentryModsTransaction = sentryTransaction.startChild({
		op: "stage",
		description: "All mods"
	})
	configureSentryScope(sentryModsTransaction)

	/* ---------------------------------------------------------------------------------------------- */
	/*                                         Stage all mods                                         */
	/* ---------------------------------------------------------------------------------------------- */
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
			let sentryModTransaction = sentryModsTransaction.startChild({
				op: "stage",
				description: mod
			})
			configureSentryScope(sentryModTransaction)

			logger.info("Staging RPKG mod: " + mod)

			for (let chunkFolder of fs.readdirSync(path.join(process.cwd(), "Mods", mod))) {
				try {
					fs.mkdirSync(path.join(process.cwd(), "staging", chunkFolder))
				} catch {}

				fs.emptyDirSync(path.join(process.cwd(), "temp"))

				for (let contentFile of fs.readdirSync(path.join(process.cwd(), "Mods", mod, chunkFolder))) {
					if (
						invalidatedData.some((a) => a.filePath == path.join(process.cwd(), "Mods", mod, chunkFolder, contentFile)) || // must redeploy, invalid cache
						!(await copyFromCache(mod, path.join(chunkFolder, contentFile), path.join(process.cwd(), "temp"))) // cache is not available
					) {
						await rpkgInstance.callFunction(`-extract_from_rpkg "${path.join(process.cwd(), "Mods", mod, chunkFolder, contentFile)}" -output_path "${path.join(process.cwd(), "temp")}"`)
						copyToCache(mod, path.join(process.cwd(), "temp"), path.join(chunkFolder, contentFile))
					}
				}

				rpkgTypes[chunkFolder] = "patch"

				let allFiles = klaw(path.join(process.cwd(), "temp"))
					.filter((a) => a.stats.isFile())
					.map((a) => a.path)

				allFiles.forEach((a) => fs.copyFileSync(a, path.join(process.cwd(), "staging", chunkFolder, path.basename(a))))

				fs.emptyDirSync(path.join(process.cwd(), "temp"))
			}

			sentryModTransaction.finish()
		} else {
			let manifest = json5.parse(String(fs.readFileSync(path.join(process.cwd(), "Mods", mod, "manifest.json"))))

			logger.info("Staging mod: " + manifest.name)

			let sentryModTransaction = sentryModsTransaction.startChild({
				op: "stage",
				description: manifest.id
			})
			configureSentryScope(sentryModTransaction)

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
					(/** @type {{ name: string; group: string; type: string; mods: any[]; }} */ a) =>
						config.modOptions[manifest.id].includes(a.name) ||
						config.modOptions[manifest.id].includes(a.group + ":" + a.name) ||
						(a.type == "requirement" && a.mods.every((/** @type {any} */ b) => config.loadOrder.includes(b)))
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

			/* ---------------------------------------------------------------------------------------------- */
			/*                                             Content                                            */
			/* ---------------------------------------------------------------------------------------------- */
			let entityPatches = []

			let sentryContentTransaction = sentryModTransaction.startChild({
				op: "stage",
				description: "Content"
			})
			configureSentryScope(sentryContentTransaction)

			for (let contentFolder of contentFolders) {
				for (let chunkFolder of fs.readdirSync(path.join(process.cwd(), "Mods", mod, contentFolder))) {
					try {
						fs.mkdirSync(path.join(process.cwd(), "staging", chunkFolder))
					} catch {}

					let contractsORESChunk,
						contractsORESContent = {},
						contractsORESMetaContent = { hash_reference_data: [] }

					try {
						contractsORESChunk = await rpkgInstance.getRPKGOfHash("002B07020D21D727")
					} catch {
						logger.error("Couldn't find the contracts ORES in the game files! Make sure you've installed the framework in the right place.")
					}

					if (
						klaw(path.join(process.cwd(), "Mods", mod, contentFolder, chunkFolder))
							.filter((a) => a.stats.isFile())
							.some((a) => a.path.endsWith("contract.json")) &&
						(invalidatedData.some((a) => a.data.affected.includes("002B07020D21D727")) || !(await copyFromCache(mod, "contractsORES", path.join(process.cwd(), "temp2"))))
					) {
						// we need to re-deploy contracts OR contracts data couldn't be copied from cache
						// There are contracts, extract the contracts ORES and copy it to the temp2 directory

						fs.emptyDirSync(path.join(process.cwd(), "temp2"))

						if (!fs.existsSync(path.join(process.cwd(), "staging", "chunk0", "002B07020D21D727.ORES"))) {
							await rpkgInstance.callFunction(`-extract_from_rpkg "${path.join(config.runtimePath, contractsORESChunk + ".rpkg")}" -filter "002B07020D21D727" -output_path temp2`) // Extract the contracts ORES
						} else {
							fs.ensureDirSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES"))
							fs.copyFileSync(
								path.join(process.cwd(), "staging", "chunk0", "002B07020D21D727.ORES"),
								path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES")
							) // Use the staging one (for mod compat - one mod can extract, patch and build, then the next can patch that one instead)
							fs.copyFileSync(
								path.join(process.cwd(), "staging", "chunk0", "002B07020D21D727.ORES.meta"),
								path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.meta")
							)
						}

						child_process.execSync(`"Third-Party\\OREStool.exe" "${path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES")}"`)
						contractsORESContent = JSON.parse(String(fs.readFileSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.JSON"))))

						await rpkgInstance.callFunction(`-hash_meta_to_json "${path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.meta")}"`)
						contractsORESMetaContent = JSON.parse(String(fs.readFileSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.meta.JSON"))))
					}

					for (let contentFilePath of klaw(path.join(process.cwd(), "Mods", mod, contentFolder, chunkFolder))
						.filter((a) => a.stats.isFile())
						.map((a) => a.path)) {
						let contentType = path.basename(contentFilePath).split(".").slice(1).join(".")

						let entityContent

						let sentryContentFileTransaction = [
							"entity.json",
							"entity.patch.json",
							"unlockables.json",
							"repository.json",
							"contract.json",
							"JSON.patch.json",
							"texture.tga",
							"sfx.wem"
						].includes(contentType)
							? sentryContentTransaction.startChild({
									op: "stageContentFile",
									description: "Stage " + contentType
							  })
							: {
									/**
									 * @param {any[]} args
									 */
									startChild(...args) {
										return {
											/**
											 * @param {any[]} args
											 */
											startChild(...args) {
												return {
													/**
													 * @param {any[]} args
													 */
													startChild(...args) {
														return {
															/**
															 * @param {any[]} args
															 */
															startChild(...args) {
																return {
																	/**
																	 * @param {any[]} args
																	 */
																	startChild(...args) {
																		return {
																			/**
																			 * @param {any[]} args
																			 */
																			startChild(...args) {
																				return {
																					/**
																					 * @param {any[]} args
																					 */
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
							  } // Don't track raw files, only special file types
						configureSentryScope(sentryContentFileTransaction)

						switch (contentType) {
							case "entity.json":
								entityContent = LosslessJSON.parse(String(fs.readFileSync(contentFilePath)))

								logger.debug("Converting entity " + contentFilePath)

								try {
									if (!QuickEntity[Object.keys(QuickEntity)[Object.keys(QuickEntity).findIndex((a) => parseFloat(a) > Number(entityContent.quickEntityVersion.value)) - 1]]) {
										logger.error("Could not find matching QuickEntity version for " + Number(entityContent.quickEntityVersion.value) + "!")
									}
								} catch {
									logger.error("Improper QuickEntity JSON; couldn't find the version!")
								}

								if (
									invalidatedData.some((a) => a.filePath == path.join(process.cwd(), "Mods", mod, chunkFolder, path.basename(contentFilePath))) || // must redeploy, invalid cache
									!(await copyFromCache(mod, path.join(chunkFolder, path.basename(contentFilePath)), path.join(process.cwd(), "staging", chunkFolder))) // cache is not available
								) {
									try {
										await QuickEntity[Object.keys(QuickEntity)[Object.keys(QuickEntity).findIndex((a) => parseFloat(a) > Number(entityContent.quickEntityVersion.value)) - 1]].generate(
											"HM3",
											contentFilePath,
											path.join(process.cwd(), "temp", "temp.TEMP.json"),
											path.join(process.cwd(), "temp", entityContent.tempHash + ".TEMP.meta.json"),
											path.join(process.cwd(), "temp", "temp.TBLU.json"),
											path.join(process.cwd(), "temp", entityContent.tbluHash + ".TBLU.meta.json")
										)
									} catch {
										logger.error(`Could not generate entity ${contentFilePath}!`)
									}
									// Generate the RT source from the QN json

									child_process.execSync(
										'"Third-Party\\ResourceTool.exe" HM3 generate TEMP "' +
											path.join(process.cwd(), "temp", "temp.TEMP.json") +
											'" "' +
											path.join(process.cwd(), "temp", entityContent.tempHash + ".TEMP") +
											'" --simple'
									)
									child_process.execSync(
										'"Third-Party\\ResourceTool.exe" HM3 generate TBLU "' +
											path.join(process.cwd(), "temp", "temp.TBLU.json") +
											'" "' +
											path.join(process.cwd(), "temp", entityContent.tbluHash + ".TBLU") +
											'" --simple'
									)

									await rpkgInstance.callFunction(`-json_to_hash_meta "${path.join(process.cwd(), "temp", entityContent.tempHash + ".TEMP.meta.json")}"`)
									await rpkgInstance.callFunction(`-json_to_hash_meta "${path.join(process.cwd(), "temp", entityContent.tbluHash + ".TBLU.meta.json")}"`)
									// Generate the binary files from the RT json

									fs.copyFileSync(
										path.join(process.cwd(), "temp", entityContent.tempHash + ".TEMP"),
										path.join(process.cwd(), "staging", chunkFolder, entityContent.tempHash + ".TEMP")
									)
									fs.copyFileSync(
										path.join(process.cwd(), "temp", entityContent.tempHash + ".TEMP.meta"),
										path.join(process.cwd(), "staging", chunkFolder, entityContent.tempHash + ".TEMP.meta")
									)
									fs.copyFileSync(
										path.join(process.cwd(), "temp", entityContent.tbluHash + ".TBLU"),
										path.join(process.cwd(), "staging", chunkFolder, entityContent.tbluHash + ".TBLU")
									)
									fs.copyFileSync(
										path.join(process.cwd(), "temp", entityContent.tbluHash + ".TBLU.meta"),
										path.join(process.cwd(), "staging", chunkFolder, entityContent.tbluHash + ".TBLU.meta")
									)
									// Copy the binary files to the staging directory

									copyToCache(mod, path.join(process.cwd(), "temp"), path.join(chunkFolder, path.basename(contentFilePath)))
									// Copy the binary files to the cache
								}

								break
							case "entity.patch.json":
								entityContent = LosslessJSON.parse(String(fs.readFileSync(contentFilePath)))
								entityContent.path = contentFilePath

								logger.debug("Preparing to apply patch " + contentFilePath)

								if (entityPatches.some((a) => a.tempHash == entityContent.tempHash)) {
									entityPatches.find((a) => a.tempHash == entityContent.tempHash).patches.push(entityContent)
								} else {
									try {
										entityPatches.push({
											tempHash: entityContent.tempHash,
											tempRPKG: await rpkgInstance.getRPKGOfHash(entityContent.tempHash),
											tbluHash: entityContent.tbluHash,
											tbluRPKG: await rpkgInstance.getRPKGOfHash(entityContent.tbluHash),
											chunkFolder,
											patches: [entityContent],
											mod
										})
									} catch {
										logger.error("Couldn't find the entity to patch in the game files! Make sure you've installed the framework in the right place.")
									}
								}
								break
							case "unlockables.json":
								entityContent = JSON.parse(String(fs.readFileSync(contentFilePath)))

								let oresChunk
								try {
									oresChunk = await rpkgInstance.getRPKGOfHash("0057C2C3941115CA")
								} catch {
									logger.error("Couldn't find the unlockables ORES in the game files! Make sure you've installed the framework in the right place.")
								}

								logger.debug("Applying unlockable patch " + contentFilePath)

								if (
									invalidatedData.some((a) => a.filePath == path.join(process.cwd(), "Mods", mod, chunkFolder, path.basename(contentFilePath))) || // must redeploy, invalid cache
									!(await copyFromCache(mod, path.join(chunkFolder, path.basename(contentFilePath)), path.join(process.cwd(), "temp", oresChunk))) // cache is not available
								) {
									await extractOrCopyToTemp(oresChunk, "0057C2C3941115CA", "ORES") // Extract the ORES to temp

									child_process.execSync(`"Third-Party\\OREStool.exe" "${path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES")}"`)
									let oresContent = JSON.parse(String(fs.readFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES.JSON"))))

									let oresToPatch = Object.fromEntries(oresContent.map((/** @type {{ Id: any; }} */ a) => [a.Id, a]))
									deepMerge(oresToPatch, entityContent)
									let oresToWrite = Object.values(oresToPatch)

									fs.writeFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES.JSON"), JSON.stringify(oresToWrite))
									fs.rmSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES"))
									child_process.execSync(`"Third-Party\\OREStool.exe" "${path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES.json")}"`)

									await copyToCache(mod, path.join(process.cwd(), "temp", oresChunk), path.join(chunkFolder, path.basename(contentFilePath)))
								}

								fs.copyFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES"), path.join(process.cwd(), "staging", "chunk0", "0057C2C3941115CA.ORES"))
								fs.copyFileSync(
									path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES.meta"),
									path.join(process.cwd(), "staging", "chunk0", "0057C2C3941115CA.ORES.meta")
								)
								break
							case "repository.json":
								entityContent = JSON.parse(String(fs.readFileSync(contentFilePath)))

								let repoRPKG
								try {
									repoRPKG = await rpkgInstance.getRPKGOfHash("00204D1AFD76AB13")
								} catch {
									logger.error("Couldn't find the repository in the game files! Make sure you've installed the framework in the right place.")
								}

								logger.debug("Applying repository patch " + contentFilePath)

								if (
									invalidatedData.some((a) => a.filePath == path.join(process.cwd(), "Mods", mod, chunkFolder, path.basename(contentFilePath))) || // must redeploy, invalid cache
									!(await copyFromCache(mod, path.join(chunkFolder, path.basename(contentFilePath)), path.join(process.cwd(), "temp", repoRPKG))) // cache is not available
								) {
									await extractOrCopyToTemp(repoRPKG, "00204D1AFD76AB13", "REPO") // Extract the REPO to temp

									let repoContent = JSON.parse(String(fs.readFileSync(path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO"))))

									let repoToPatch = Object.fromEntries(repoContent.map((/** @type {{ [x: string]: any; }} */ a) => [a["ID_"], a]))
									deepMerge(repoToPatch, entityContent)
									let repoToWrite = Object.values(repoToPatch)

									let editedItems = new Set(Object.keys(entityContent))

									await rpkgInstance.callFunction(`-hash_meta_to_json "${path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO.meta")}"`)
									let metaContent = JSON.parse(String(fs.readFileSync(path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO.meta.JSON"))))
									for (let repoItem of repoToWrite) {
										if (editedItems.has(repoItem.ID_)) {
											if (repoItem.Runtime) {
												if (!metaContent["hash_reference_data"].find((/** @type {{ hash: string; }} */ a) => a.hash == parseInt(repoItem.Runtime).toString(16).toUpperCase())) {
													metaContent["hash_reference_data"].push({
														hash: parseInt(repoItem.Runtime).toString(16).toUpperCase(),
														flag: "9F"
													}) // Add Runtime of any items to REPO depends if not already there
												}
											}

											if (repoItem.Image) {
												if (
													!metaContent["hash_reference_data"].find(
														(/** @type {{ hash: string; }} */ a) =>
															a.hash ==
															"00" + md5(`[assembly:/_pro/online/default/cloudstorage/resources/${repoItem.Image}].pc_gfx`.toLowerCase()).slice(2, 16).toUpperCase()
													)
												) {
													metaContent["hash_reference_data"].push({
														hash: "00" + md5(`[assembly:/_pro/online/default/cloudstorage/resources/${repoItem.Image}].pc_gfx`.toLowerCase()).slice(2, 16).toUpperCase(),
														flag: "9F"
													}) // Add Image of any items to REPO depends if not already there
												}
											}
										}
									}
									fs.writeFileSync(path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO.meta.JSON"), JSON.stringify(metaContent))
									fs.rmSync(path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO.meta"))
									await rpkgInstance.callFunction(`-json_to_hash_meta "${path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO.meta.JSON")}"`) // Add all runtimes to REPO depends

									fs.writeFileSync(path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO"), JSON.stringify(repoToWrite))

									await copyToCache(mod, path.join(process.cwd(), "temp", repoRPKG), path.join(chunkFolder, path.basename(contentFilePath)))
								}

								fs.copyFileSync(path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO"), path.join(process.cwd(), "staging", "chunk0", "00204D1AFD76AB13.REPO"))
								fs.copyFileSync(
									path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO.meta"),
									path.join(process.cwd(), "staging", "chunk0", "00204D1AFD76AB13.REPO.meta")
								)
								break
							case "contract.json":
								entityContent = LosslessJSON.parse(String(fs.readFileSync(contentFilePath)))

								let contractHash =
									"00" +
									md5(("smfContract" + entityContent.Metadata.Id).toLowerCase())
										.slice(2, 16)
										.toUpperCase()

								logger.debug("Adding contract " + contentFilePath)

								contractsORESContent[contractHash] = entityContent.Metadata.Id // Add the contract to the ORES; this will be a no-op if the cache is used later

								contractsORESMetaContent["hash_reference_data"].push({
									hash: contractHash,
									flag: "9F"
								})

								fs.writeFileSync(path.join(process.cwd(), "staging", "chunk0", contractHash + ".JSON"), LosslessJSON.stringify(entityContent)) // Write the actual contract to the staging directory
								break
							case "JSON.patch.json":
								entityContent = JSON.parse(String(fs.readFileSync(contentFilePath)))

								let rpkgOfFile
								try {
									rpkgOfFile = await rpkgInstance.getRPKGOfHash(entityContent.file)
								} catch {
									logger.error("Couldn't find the file to patch in the game files! Make sure you've installed the framework in the right place.")
								}

								let fileType = entityContent.type || "JSON"

								logger.debug("Applying JSON patch " + contentFilePath)

								if (
									invalidatedData.some((a) => a.filePath == path.join(process.cwd(), "Mods", mod, chunkFolder, path.basename(contentFilePath))) || // must redeploy, invalid cache
									!(await copyFromCache(mod, path.join(chunkFolder, path.basename(contentFilePath)), path.join(process.cwd(), "temp", rpkgOfFile))) // cache is not available
								) {
									await extractOrCopyToTemp(rpkgOfFile, entityContent.file, fileType, chunkFolder) // Extract the JSON to temp

									if (entityContent.type == "ORES") {
										child_process.execSync(`"Third-Party\\OREStool.exe" "${path.join(process.cwd(), "temp", rpkgOfFile, fileType, entityContent.file + "." + fileType)}"`)
										fs.rmSync(path.join(process.cwd(), "temp", rpkgOfFile, fileType, entityContent.file + "." + fileType))
										fs.renameSync(
											path.join(process.cwd(), "temp", rpkgOfFile, fileType, entityContent.file + "." + fileType + ".json"),
											path.join(process.cwd(), "temp", rpkgOfFile, fileType, entityContent.file + "." + fileType)
										)
									}

									let fileContent = JSON.parse(String(fs.readFileSync(path.join(process.cwd(), "temp", rpkgOfFile, fileType, entityContent.file + "." + fileType))))

									if (entityContent.type == "ORES" && Array.isArray(fileContent)) {
										fileContent = Object.fromEntries(fileContent.map((a) => [a.Id, a])) // Change unlockables ORES to be an object
									} else if (entityContent.type == "REPO") {
										fileContent = Object.fromEntries(fileContent.map((/** @type {{ [x: string]: any; }} */ a) => [a["ID_"], a])) // Change REPO to be an object
									}

									rfc6902.applyPatch(fileContent, entityContent.patch) // Apply the JSON patch

									if ((entityContent.type == "ORES" && Object.prototype.toString.call(fileContent) == "[object Object]") || entityContent.type == "REPO") {
										fileContent = Object.values(fileContent) // Change back to an array
									}

									if (entityContent.type == "ORES") {
										fs.renameSync(
											path.join(process.cwd(), "temp", rpkgOfFile, fileType, entityContent.file + "." + fileType),
											path.join(process.cwd(), "temp", rpkgOfFile, fileType, entityContent.file + "." + fileType + ".json")
										)
										fs.writeFileSync(path.join(process.cwd(), "temp", rpkgOfFile, fileType, entityContent.file + "." + fileType + ".json"), JSON.stringify(fileContent))
										child_process.execSync(`"Third-Party\\OREStool.exe" "${path.join(process.cwd(), "temp", rpkgOfFile, fileType, entityContent.file + "." + fileType + ".json")}"`)
									} else {
										fs.writeFileSync(path.join(process.cwd(), "temp", rpkgOfFile, fileType, entityContent.file + "." + fileType), JSON.stringify(fileContent))
									}

									await copyToCache(mod, path.join(process.cwd(), "temp", rpkgOfFile), path.join(chunkFolder, path.basename(contentFilePath)))
								}

								fs.copyFileSync(
									path.join(process.cwd(), "temp", rpkgOfFile, fileType, entityContent.file + "." + fileType),
									path.join(process.cwd(), "staging", chunkFolder, entityContent.file + "." + fileType)
								)
								fs.copyFileSync(
									path.join(process.cwd(), "temp", rpkgOfFile, fileType, entityContent.file + "." + fileType + ".meta"),
									path.join(process.cwd(), "staging", chunkFolder, entityContent.file + "." + fileType + ".meta")
								)
								break
							case "texture.tga":
								logger.debug("Converting texture " + contentFilePath)

								if (
									invalidatedData.some((a) => a.filePath == path.join(process.cwd(), "Mods", mod, chunkFolder, path.basename(contentFilePath))) || // must redeploy, invalid cache
									!(await copyFromCache(mod, path.join(chunkFolder, path.basename(contentFilePath)), path.join(process.cwd(), "temp", chunkFolder))) // cache is not available
								) {
									fs.ensureDirSync(path.join(process.cwd(), "temp", chunkFolder))

									if (path.basename(contentFilePath).split(".")[0].split("~").length > 1) {
										child_process.execSync(
											`"Third-Party\\HMTextureTools" rebuild H3 "${contentFilePath}" --metapath "${contentFilePath + ".meta"}" "${path.join(
												process.cwd(),
												"temp",
												chunkFolder,
												path.basename(contentFilePath).split(".")[0].split("~")[0] + ".TEXT"
											)}" --rebuildboth --texdoutput "${path.join(process.cwd(), "temp", chunkFolder, path.basename(contentFilePath).split(".")[0].split("~")[1] + ".TEXD")}"`
										) // Rebuild texture to TEXT/TEXD

										fs.writeFileSync(
											path.join(process.cwd(), "temp", chunkFolder, path.basename(contentFilePath).split(".")[0].split("~")[0] + ".TEXT.meta.JSON"),
											JSON.stringify({
												hash_value: path.basename(contentFilePath).split(".")[0].split("~")[0],
												hash_offset: 21488715,
												hash_size: 2147483648,
												hash_resource_type: "TEXT",
												hash_reference_table_size: 13,
												hash_reference_table_dummy: 0,
												hash_size_final: 6054,
												hash_size_in_memory: 4294967295,
												hash_size_in_video_memory: 688128,
												hash_reference_data: [
													{
														hash: path.basename(contentFilePath).split(".")[0].split("~")[1],
														flag: "9F"
													}
												]
											})
										)
										fs.writeFileSync(
											path.join(process.cwd(), "temp", chunkFolder, path.basename(contentFilePath).split(".")[0].split("~")[1] + ".TEXD.meta.JSON"),
											JSON.stringify({
												hash_value: path.basename(contentFilePath).split(".")[0].split("~")[1],
												hash_offset: 233821026,
												hash_size: 0,
												hash_resource_type: "TEXD",
												hash_reference_table_size: 0,
												hash_reference_table_dummy: 0,
												hash_size_final: 120811,
												hash_size_in_memory: 4294967295,
												hash_size_in_video_memory: 688128,
												hash_reference_data: []
											})
										)
										await rpkgInstance.callFunction(
											`-json_to_hash_meta "${path.join(process.cwd(), "temp", chunkFolder, path.basename(contentFilePath).split(".")[0].split("~")[0] + ".TEXT.meta.JSON")}"`
										) // Rebuild the TEXT meta
										await rpkgInstance.callFunction(
											`-json_to_hash_meta "${path.join(process.cwd(), "temp", chunkFolder, path.basename(contentFilePath).split(".")[0].split("~")[1] + ".TEXD.meta.JSON")}"`
										) // Rebuild the TEXD meta
									} else {
										// TEXT only
										child_process.execSync(
											`"Third-Party\\HMTextureTools" rebuild H3 "${contentFilePath}" --metapath "${contentFilePath + ".meta"}" "${path.join(
												process.cwd(),
												"temp",
												chunkFolder,
												path.basename(contentFilePath).split(".")[0] + ".TEXT"
											)}"`
										) // Rebuild texture to TEXT only

										fs.writeFileSync(
											path.join(process.cwd(), "temp", chunkFolder, path.basename(contentFilePath).split(".")[0] + ".TEXT.meta.json"),
											JSON.stringify({
												hash_value: path.basename(contentFilePath).split(".")[0].split("~")[0],
												hash_offset: 21488715,
												hash_size: 2147483648,
												hash_resource_type: "TEXT",
												hash_reference_table_size: 13,
												hash_reference_table_dummy: 0,
												hash_size_final: 6054,
												hash_size_in_memory: 4294967295,
												hash_size_in_video_memory: 688128,
												hash_reference_data: []
											})
										)
										await rpkgInstance.callFunction(
											`-json_to_hash_meta "${path.join(process.cwd(), "temp", chunkFolder, path.basename(contentFilePath).split(".")[0] + ".TEXT.meta.json")}"`
										) // Rebuild the meta
									}

									await copyToCache(mod, path.join(process.cwd(), "temp", chunkFolder), path.join(chunkFolder, path.basename(contentFilePath)))
								}

								fs.ensureDirSync(path.join(process.cwd(), "staging", chunkFolder))
								try {
									fs.copyFileSync(
										path.join(process.cwd(), "temp", chunkFolder, path.basename(contentFilePath).split(".")[0] + ".TEXT"),
										path.join(process.cwd(), "staging", chunkFolder, path.basename(contentFilePath).split(".")[0] + ".TEXT")
									)
									fs.copyFileSync(
										path.join(process.cwd(), "temp", chunkFolder, path.basename(contentFilePath).split(".")[1] + ".TEXD"),
										path.join(process.cwd(), "staging", chunkFolder, path.basename(contentFilePath).split(".")[1] + ".TEXD")
									)
									fs.copyFileSync(
										path.join(process.cwd(), "temp", chunkFolder, path.basename(contentFilePath).split(".")[0] + ".TEXT.meta"),
										path.join(process.cwd(), "staging", chunkFolder, path.basename(contentFilePath).split(".")[0] + ".TEXT.meta")
									)
									fs.copyFileSync(
										path.join(process.cwd(), "temp", chunkFolder, path.basename(contentFilePath).split(".")[1] + ".TEXD.meta"),
										path.join(process.cwd(), "staging", chunkFolder, path.basename(contentFilePath).split(".")[1] + ".TEXD.meta")
									)
								} catch {}
								break
							case "sfx.wem":
								if (!WWEVpatches[path.basename(contentFilePath).split(".")[0].split("~")[0]]) {
									WWEVpatches[path.basename(contentFilePath).split(".")[0].split("~")[0]] = []
								}

								// Add the WWEV patch; this will be a no-op if the cache is used later
								WWEVpatches[path.basename(contentFilePath).split(".")[0].split("~")[0]].push({
									index: path.basename(contentFilePath).split(".")[0].split("~")[1],
									filepath: contentFilePath,
									chunk: chunkFolder
								})
								break
							default:
								fs.copyFileSync(contentFilePath, path.join(process.cwd(), "staging", chunkFolder, path.basename(contentFilePath))) // Copy the file to the staging directory; we don't cache these for obvious reasons
								break
						}

						sentryContentFileTransaction.finish()

						fs.emptyDirSync(path.join(process.cwd(), "temp"))
					}

					/* --------- There are contracts, repackage the contracts ORES from the temp2 directory --------- */
					if (
						klaw(path.join(process.cwd(), "Mods", mod, contentFolder, chunkFolder))
							.filter((a) => a.stats.isFile())
							.some((a) => a.path.endsWith("contract.json"))
					) {
						if (invalidatedData.some((a) => a.data.affected.includes("002B07020D21D727")) || !(await copyFromCache(mod, "contractsORES", path.join(process.cwd(), "temp2")))) {
							// we need to re-deploy contracts OR contracts data couldn't be copied from cache

							fs.writeFileSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.meta.JSON"), JSON.stringify(contractsORESMetaContent))
							fs.rmSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.meta"))
							await rpkgInstance.callFunction(`-json_to_hash_meta "${path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.meta.JSON")}"`) // Rebuild the ORES meta

							fs.writeFileSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.JSON"), JSON.stringify(contractsORESContent))
							fs.rmSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES"))
							child_process.execSync(`"Third-Party\\OREStool.exe" "${path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.json")}"`) // Rebuild the ORES

							await copyToCache(mod, path.join(process.cwd(), "temp2"), "contractsORES")
						}

						fs.copyFileSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES"), path.join(process.cwd(), "staging", "chunk0", "002B07020D21D727.ORES"))
						fs.copyFileSync(
							path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.meta"),
							path.join(process.cwd(), "staging", "chunk0", "002B07020D21D727.ORES.meta")
						) // Copy the ORES to the staging directory

						fs.removeSync(path.join(process.cwd(), "temp2"))
					}

					/* ------------------------------ Copy chunk meta to staging folder ----------------------------- */
					if (fs.existsSync(path.join(process.cwd(), "Mods", mod, contentFolder, chunkFolder, chunkFolder + ".meta"))) {
						fs.copyFileSync(
							path.join(process.cwd(), "Mods", mod, contentFolder, chunkFolder, chunkFolder + ".meta"),
							path.join(process.cwd(), "staging", chunkFolder, chunkFolder + ".meta")
						)
						rpkgTypes[chunkFolder] = "base"
					} else {
						rpkgTypes[chunkFolder] = "patch"
					}
				}
			}

			sentryContentTransaction.finish()

			/* ------------------------------------- Multithreaded patching ------------------------------------ */
			let index = 0

			let workerPool = new Piscina({
				filename: "patchWorker.js",
				maxThreads: os.cpus().length / 4 // For an 8-core CPU with 16 logical processors there are 4 max threads
			})

			global.currentWorkerPool = workerPool

			let sentryPatchTransaction = sentryModTransaction.startChild({
				op: "stage",
				description: "Patches"
			})
			configureSentryScope(sentryPatchTransaction)

			await Promise.all(
				entityPatches.map(({ tempHash, tempRPKG, tbluHash, tbluRPKG, chunkFolder, patches }) => {
					index++
					return workerPool.run({
						tempHash,
						tempRPKG,
						tbluHash,
						tbluRPKG,
						chunkFolder,
						patches,
						assignedTemporaryDirectory: "patchWorker" + index,
						useNiceLogs: !process.argv[2],
						invalidatedData,
						cachedData,
						mod
					})
				})
			) // Run each patch in the worker queue and wait for all of them to finish

			global.currentWorkerPool = {
				destroy: () => {}
			}

			sentryPatchTransaction.finish()

			/* ---------------------------------------------------------------------------------------------- */
			/*                                              Blobs                                             */
			/* ---------------------------------------------------------------------------------------------- */
			if (blobsFolders.length) {
				let sentryBlobsTransaction = sentryModTransaction.startChild({
					op: "stage",
					description: "Blobs"
				})
				configureSentryScope(sentryBlobsTransaction)

				fs.emptyDirSync(path.join(process.cwd(), "temp"))

				fs.ensureDirSync(path.join(process.cwd(), "staging", "chunk0"))

				let oresChunk
				try {
					oresChunk = await rpkgInstance.getRPKGOfHash("00858D45F5F9E3CA")
				} catch {
					logger.error("Couldn't find the blobs ORES in the game files! Make sure you've installed the framework in the right place.")
				}

				if (invalidatedData.some((a) => a.data.affected.includes("00858D45F5F9E3CA")) || !(await copyFromCache(mod, "blobsORES", path.join(process.cwd(), "temp")))) {
					// we need to re-deploy the blobs ORES OR the blobs ORES couldn't be copied from cache

					await extractOrCopyToTemp(oresChunk, "00858D45F5F9E3CA", "ORES") // Extract the ORES to temp

					child_process.execSync(`"Third-Party\\OREStool.exe" "${path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES")}"`)
					let oresContent = JSON.parse(String(fs.readFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.JSON"))))

					await rpkgInstance.callFunction(`-hash_meta_to_json "${path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.meta")}"`)
					let metaContent = JSON.parse(String(fs.readFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.meta.JSON"))))

					for (let blobsFolder of blobsFolders) {
						for (let blob of klaw(path.join(process.cwd(), "Mods", mod, blobsFolder))
							.filter((a) => a.stats.isFile())
							.map((a) => a.path)) {
							let blobPath = blob.replace(path.join(process.cwd(), "Mods", mod, blobsFolder), "").slice(1).split(path.sep).join("/").toLowerCase()

							let blobHash
							if (path.extname(blob).startsWith(".jp") || path.extname(blob) == ".png") {
								blobHash = "00" + md5(`[assembly:/_pro/online/default/cloudstorage/resources/${blobPath}].pc_gfx`.toLowerCase()).slice(2, 16).toUpperCase()
							} else if (path.extname(blob) == ".json") {
								blobHash = "00" + md5(`[assembly:/_pro/online/default/cloudstorage/resources/${blobPath}].pc_json`.toLowerCase()).slice(2, 16).toUpperCase()
							} else {
								blobHash =
									"00" +
									md5(`[assembly:/_pro/online/default/cloudstorage/resources/${blobPath}].pc_${path.extname(blob).slice(1)}`.toLowerCase())
										.slice(2, 16)
										.toUpperCase()
							}

							oresContent[blobHash] = blobPath // Add the blob to the ORES

							if (!metaContent["hash_reference_data"].find((/** @type {{ hash: any; }} */ a) => a.hash == blobHash)) {
								metaContent["hash_reference_data"].push({
									hash: blobHash,
									flag: "9F"
								})
							}

							fs.copyFileSync(
								blob,
								path.join(
									process.cwd(),
									"staging",
									"chunk0",
									blobHash +
										"." +
										(path.extname(blob) == ".json"
											? "JSON"
											: path.extname(blob).startsWith(".jp") || path.extname(blob) == ".png"
											? "GFXI"
											: path.extname(blob).slice(1).toUpperCase())
								)
							) // Copy the actual blob to the staging directory
						}
					}

					fs.writeFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.meta.JSON"), JSON.stringify(metaContent))
					fs.rmSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.meta"))
					await rpkgInstance.callFunction(`-json_to_hash_meta "${path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.meta.JSON")}"`) // Rebuild the meta

					fs.writeFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.JSON"), JSON.stringify(oresContent))
					fs.rmSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES"))
					child_process.execSync(`"Third-Party\\OREStool.exe" "${path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.json")}"`) // Rebuild the ORES

					await copyToCache(mod, path.join(process.cwd(), "temp"), "blobsORES")
				}

				fs.copyFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES"), path.join(process.cwd(), "staging", "chunk0", "00858D45F5F9E3CA.ORES"))
				fs.copyFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.meta"), path.join(process.cwd(), "staging", "chunk0", "00858D45F5F9E3CA.ORES.meta")) // Copy the ORES to the staging directory

				fs.emptyDirSync(path.join(process.cwd(), "temp"))

				sentryBlobsTransaction.finish()
			}

			/* -------------------------------------- Runtime packages -------------------------------------- */
			if (manifest.runtimePackages) {
				runtimePackages.push(
					...manifest.runtimePackages.map((/** @type {{ chunk: any; path: any; }} */ a) => {
						return {
							chunk: a.chunk,
							path: a.path,
							mod: mod
						}
					})
				)
			}

			/* ---------------------------------------- Dependencies ---------------------------------------- */
			if (manifest.dependencies) {
				let sentryDependencyTransaction = sentryModTransaction.startChild({
					op: "stage",
					description: "Dependencies"
				})
				configureSentryScope(sentryDependencyTransaction)

				let doneHashes = []
				for (let dependency of manifest.dependencies) {
					if (
						!doneHashes.some(
							(a) => a.id == (typeof dependency == "string" ? dependency : dependency.runtimeID) && a.chunk == (typeof dependency == "string" ? "chunk0" : dependency.toChunk)
						)
					) {
						doneHashes.push({
							id: typeof dependency == "string" ? dependency : dependency.runtimeID,
							chunk: typeof dependency == "string" ? "chunk0" : dependency.toChunk
						})

						if (!(await copyFromCache(mod, path.join("dependencies", typeof dependency == "string" ? dependency : dependency.runtimeID), path.join(process.cwd(), "temp")))) {
							// the dependency files couldn't be copied from the cache

							fs.emptyDirSync(path.join(process.cwd(), "temp"))

							await rpkgInstance.callFunction(
								`-extract_non_base_hash_depends_from "${path.join(config.runtimePath)}" -filter "${
									typeof dependency == "string" ? dependency : dependency.runtimeID
								}" -output_path temp`
							)

							await copyToCache(mod, path.join(process.cwd(), "temp"), path.join("dependencies", typeof dependency == "string" ? dependency : dependency.runtimeID))
						}

						let allFiles = klaw(path.join(process.cwd(), "temp"))
							.filter((a) => a.stats.isFile())
							.map((a) => a.path)
							.map((a) => {
								return {
									rpkg: /00[0-9A-F]*\..*?\\(chunk[0-9]*(?:patch[0-9]*)?)\\/gi.exec(a)[1],
									path: a
								}
							})
							.sort((a, b) =>
								b.rpkg.localeCompare(a.rpkg, undefined, {
									numeric: true,
									sensitivity: "base"
								})
							) // Sort files by RPKG name in descending order

						let allFilesSuperseded = []
						allFiles.forEach((a) => {
							if (!allFilesSuperseded.some((b) => path.basename(b) == path.basename(a.path))) {
								allFilesSuperseded.push(a.path)
							}
						}) // Add files without duplicates (since the list is in desc order patches are first which means that superseded files are added correctly)

						allFilesSuperseded = allFilesSuperseded.filter((a) => !/chunk[0-9]*(?:patch[0-9]*)?\.meta/gi.exec(path.basename(a))) // Remove RPKG metas

						fs.ensureDirSync(path.join(process.cwd(), "staging", typeof dependency == "string" ? "chunk0" : dependency.toChunk))
						allFilesSuperseded.forEach((file) => {
							fs.copySync(file, path.join(process.cwd(), "staging", typeof dependency == "string" ? "chunk0" : dependency.toChunk, path.basename(file)), {
								overwrite: false
							}) // Stage the files, but don't overwrite if they already exist (such as if another mod has edited them)
						})

						fs.emptyDirSync(path.join(process.cwd(), "temp"))
					}
				}

				sentryDependencyTransaction.finish()
			}

			/* ------------------------------------- Package definition ------------------------------------- */
			if (manifest.packagedefinition) {
				packagedefinition.push(...manifest.packagedefinition)
			}

			/* ------------------------------------------- Thumbs ------------------------------------------- */
			if (manifest.thumbs) {
				thumbs.push(...manifest.thumbs)
			}

			/* ---------------------------------------- Localisation ---------------------------------------- */
			if (manifest.localisation) {
				for (let language of Object.keys(manifest.localisation)) {
					for (let string of Object.entries(manifest.localisation[language])) {
						localisation.push({
							language: language,
							locString: string[0],
							text: string[1]
						})
					}
				}
			}

			if (manifest.localisationOverrides) {
				for (let locrHash of Object.keys(manifest.localisationOverrides)) {
					if (!localisationOverrides[locrHash]) {
						localisationOverrides[locrHash] = []
					}

					for (let language of Object.keys(manifest.localisationOverrides[locrHash])) {
						for (let string of Object.entries(manifest.localisationOverrides[locrHash][language])) {
							localisationOverrides[locrHash].push({
								language: language,
								locString: string[0],
								text: string[1]
							})
						}
					}
				}
			}

			if (manifest.localisedLines) {
				let sentryLocalisedLinesTransaction = sentryModTransaction.startChild({
					op: "stage",
					description: "Localised lines"
				})
				configureSentryScope(sentryLocalisedLinesTransaction)

				for (let lineHash of Object.keys(manifest.localisedLines)) {
					fs.emptyDirSync(path.join(process.cwd(), "temp", "chunk0"))
					fs.ensureDirSync(path.join(process.cwd(), "staging", "chunk0"))

					if (invalidatedData.some((a) => a.data.affected.includes(lineHash)) || !(await copyFromCache(mod, path.join("localisedLines", lineHash), path.join(process.cwd(), "temp")))) {
						fs.writeFileSync(
							path.join(process.cwd(), "temp", "chunk0", lineHash + ".LINE"),
							Buffer.from(hexflip(crc32(manifest.localisedLines[lineHash].toUpperCase()).toString(16)) + "00", "hex")
						) // Create the LINE file

						fs.writeFileSync(
							path.join(process.cwd(), "temp", "chunk0", lineHash + ".LINE.meta.JSON"),
							JSON.stringify({
								hash_value: lineHash,
								hash_offset: 163430439,
								hash_size: 2147483648,
								hash_resource_type: "LINE",
								hash_reference_table_size: 13,
								hash_reference_table_dummy: 0,
								hash_size_final: 5,
								hash_size_in_memory: 4294967295,
								hash_size_in_video_memory: 4294967295,
								hash_reference_data: [
									{
										hash: "00F5817876E691F1",
										flag: "1F"
									}
								]
							})
						)

						await rpkgInstance.callFunction(`-json_to_hash_meta "${path.join(process.cwd(), "temp", "chunk0", lineHash + ".LINE.meta.JSON")}"`) // Rebuild the meta

						await copyToCache(mod, path.join(process.cwd(), "temp"), path.join("localisedLines", lineHash))
					}

					fs.copySync(path.join(process.cwd(), "temp"), path.join(process.cwd(), "staging"))
					fs.emptyDirSync(path.join(process.cwd(), "temp"))
				}

				sentryLocalisedLinesTransaction.finish()
			}

			sentryModTransaction.finish()
		}
	}

	sentryModsTransaction.finish()

	if (config.outputToSeparateDirectory) {
		fs.emptyDirSync(path.join(process.cwd(), "Output"))
	} // Make output folder

	/* ---------------------------------------------------------------------------------------------- */
	/*                                          WWEV patches                                          */
	/* ---------------------------------------------------------------------------------------------- */
	let sentryWWEVTransaction = sentryTransaction.startChild({
		op: "stage",
		description: "sfx.wem files"
	})
	configureSentryScope(sentryWWEVTransaction)

	for (let entry of Object.entries(WWEVpatches)) {
		logger.debug("Patching WWEV " + entry[0])

		fs.emptyDirSync(path.join(process.cwd(), "temp"))

		let WWEVhash = entry[0]

		let rpkgOfWWEV
		try {
			rpkgOfWWEV = await rpkgInstance.getRPKGOfHash(WWEVhash)
		} catch {
			logger.error("Couldn't find the WWEV in the game files! Make sure you've installed the framework in the right place.")
		}

		let workingPath = path.join(process.cwd(), "temp", "WWEV", rpkgOfWWEV + ".rpkg", fs.readdirSync(path.join(process.cwd(), "temp", "WWEV", rpkgOfWWEV + ".rpkg"))[0])

		if (invalidatedData.some((a) => a.data.affected.includes(WWEVhash)) || !(await copyFromCache("global", path.join("WWEV", WWEVhash), path.join(process.cwd(), "temp")))) {
			// we need to re-deploy WWEV OR WWEV data couldn't be copied from cache

			await rpkgInstance.callFunction(`-extract_wwev_to_ogg_from "${path.join(config.runtimePath)}" -filter "${WWEVhash}" -output_path temp`) // Extract the WWEV

			for (let patch of entry[1]) {
				fs.copyFileSync(patch.filepath, path.join(workingPath, "wem", patch.index + ".wem")) // Copy the wem
			}

			await rpkgInstance.callFunction(`-rebuild_wwev_in "${path.resolve(path.join(workingPath, ".."))}"`) // Rebuild the WWEV

			await copyToCache("global", path.join(process.cwd(), "temp"), path.join("WWEV", WWEVhash))
		}

		fs.ensureDirSync(path.join(process.cwd(), "staging", entry[1][0].chunk))

		fs.copyFileSync(path.join(workingPath, WWEVhash + ".WWEV"), path.join(process.cwd(), "staging", entry[1][0].chunk, WWEVhash + ".WWEV"))
		fs.copyFileSync(path.join(workingPath, WWEVhash + ".WWEV.meta"), path.join(process.cwd(), "staging", entry[1][0].chunk, WWEVhash + ".WWEV.meta")) // Copy the WWEV and its meta
	}

	sentryWWEVTransaction.finish()

	/* ---------------------------------------------------------------------------------------------- */
	/*                                        Runtime packages                                        */
	/* ---------------------------------------------------------------------------------------------- */
	logger.info("Copying runtime packages")

	let runtimePatchNumber = 201
	for (let runtimeFile of runtimePackages) {
		fs.copyFileSync(
			path.join(process.cwd(), "Mods", runtimeFile.mod, runtimeFile.path),
			config.outputToSeparateDirectory
				? path.join(process.cwd(), "Output", "chunk" + runtimeFile.chunk + "patch" + runtimePatchNumber + ".rpkg")
				: path.join(config.runtimePath, "chunk" + runtimeFile.chunk + "patch" + runtimePatchNumber + ".rpkg")
		)
		runtimePatchNumber++

		if (runtimePatchNumber >= 300) {
			logger.error("More than 95 total runtime packages!")
		} // Framework only manages patch200-300
	}

	/* ---------------------------------------------------------------------------------------------- */
	/*                                          Localisation                                          */
	/* ---------------------------------------------------------------------------------------------- */
	logger.info("Localising text")

	if (localisation.length) {
		let sentryLocalisationTransaction = sentryTransaction.startChild({
			op: "stage",
			description: "Localisation"
		})
		configureSentryScope(sentryLocalisationTransaction)

		let languages = {
			english: "en",
			french: "fr",
			italian: "it",
			german: "de",
			spanish: "es",
			russian: "ru",
			chineseSimplified: "cn",
			chineseTraditional: "tc",
			japanese: "jp"
		}

		fs.emptyDirSync(path.join(process.cwd(), "temp"))

		let localisationFileRPKG
		try {
			localisationFileRPKG = await rpkgInstance.getRPKGOfHash("00F5817876E691F1")
		} catch {
			logger.error("Couldn't find the localisation file in the game files! Make sure you've installed the framework in the right place.")
		}

		if (invalidatedData.some((a) => a.data.affected.includes("00F5817876E691F1")) || !(await copyFromCache("global", path.join("LOCR", "manifest"), path.join(process.cwd(), "temp")))) {
			// we need to re-deploy the localisation files OR the localisation files couldn't be copied from cache

			await rpkgInstance.callFunction(`-extract_locr_to_json_from "${path.join(config.runtimePath, localisationFileRPKG + ".rpkg")}" -filter "00F5817876E691F1" -output_path temp`)

			fs.ensureDirSync(path.join(process.cwd(), "staging", "chunk0"))

			let locrFileContent = JSON.parse(String(fs.readFileSync(path.join(process.cwd(), "temp", "LOCR", localisationFileRPKG + ".rpkg", "00F5817876E691F1.LOCR.JSON"))))
			let locrContent = {}

			for (let localisationLanguage of locrFileContent) {
				locrContent[localisationLanguage[0].Language] = {}
				for (let localisationItem of localisationLanguage.slice(1)) {
					locrContent[localisationLanguage[0].Language]["abc" + localisationItem.StringHash] = localisationItem.String
				}
			}

			for (let item of localisation) {
				let toMerge = {}
				toMerge["abc" + crc32(item.locString.toUpperCase())] = item.text

				deepMerge(locrContent[languages[item.language]], toMerge)

				if (item.language == "english") {
					deepMerge(locrContent["xx"], toMerge)
				}
			}

			/** @type Array<Array<{Language: string}|{StringHash: number, String: string}>> */
			let locrToWrite = []

			for (let language of Object.keys(locrContent)) {
				locrToWrite.push([
					{
						Language: language
					}
				])

				for (let string of Object.keys(locrContent[language])) {
					locrToWrite[locrToWrite.length - 1].push({
						StringHash: parseInt(string.slice(3)),
						String: locrContent[language][string]
					})
				}
			}

			fs.writeFileSync(path.join(process.cwd(), "temp", "LOCR", localisationFileRPKG + ".rpkg", "00F5817876E691F1.LOCR.JSON"), JSON.stringify(locrToWrite))

			await copyToCache("global", path.join(process.cwd(), "temp"), path.join("LOCR", "manifest"))
		}

		await rpkgInstance.callFunction(`-rebuild_locr_from_json_from "${path.join(process.cwd(), "temp", "LOCR", localisationFileRPKG + ".rpkg")}"`) // Rebuild the LOCR
		fs.copyFileSync(
			path.join(process.cwd(), "temp", "LOCR", localisationFileRPKG + ".rpkg", "LOCR.rebuilt", "00F5817876E691F1.LOCR"),
			path.join(process.cwd(), "staging", localisationFileRPKG.replace(/patch[0-9]*/gi, ""), "00F5817876E691F1.LOCR")
		)

		fs.emptyDirSync(path.join(process.cwd(), "temp"))

		sentryLocalisationTransaction.finish()
	}

	if (Object.keys(localisationOverrides).length) {
		let sentryLocalisationOverridesTransaction = sentryTransaction.startChild({
			op: "stage",
			description: "Localisation overrides"
		})
		configureSentryScope(sentryLocalisationOverridesTransaction)

		let languages = {
			english: "en",
			french: "fr",
			italian: "it",
			german: "de",
			spanish: "es",
			russian: "ru",
			chineseSimplified: "cn",
			chineseTraditional: "tc",
			japanese: "jp"
		}

		fs.emptyDirSync(path.join(process.cwd(), "temp"))

		for (let locrHash of Object.keys(localisationOverrides)) {
			let localisationFileRPKG
			try {
				localisationFileRPKG = await rpkgInstance.getRPKGOfHash(locrHash)
			} catch {
				logger.error("Couldn't find the localisation file in the game files! Make sure you've installed the framework in the right place.")
			}

			if (invalidatedData.some((a) => a.data.affected.includes(locrHash)) || !(await copyFromCache("global", path.join("LOCR", locrHash), path.join(process.cwd(), "temp")))) {
				// we need to re-deploy the localisation files OR the localisation files couldn't be copied from cache

				await rpkgInstance.callFunction(`-extract_locr_to_json_from "${path.join(config.runtimePath, localisationFileRPKG + ".rpkg")}" -filter "${locrHash}" -output_path temp`)

				fs.ensureDirSync(path.join(process.cwd(), "staging", "chunk0"))

				let locrFileContent = JSON.parse(String(fs.readFileSync(path.join(process.cwd(), "temp", "LOCR", localisationFileRPKG + ".rpkg", locrHash + ".LOCR.JSON"))))
				let locrContent = {}

				for (let localisationLanguage of locrFileContent) {
					locrContent[localisationLanguage[0].Language] = {}
					for (let localisationItem of localisationLanguage.slice(1)) {
						locrContent[localisationLanguage[0].Language]["abc" + localisationItem.StringHash] = localisationItem.String
					}
				}

				for (let item of localisationOverrides[locrHash]) {
					let toMerge = {}
					toMerge["abc" + item.locString] = item.text

					deepMerge(locrContent[languages[item.language]], toMerge)

					if (item.language == "english") {
						deepMerge(locrContent["xx"], toMerge)
					}
				}

				/** @type Array<Array<{Language: string}|{StringHash: number, String: string}>> */
				let locrToWrite = []

				for (let language of Object.keys(locrContent)) {
					locrToWrite.push([
						{
							Language: language
						}
					])

					for (let string of Object.keys(locrContent[language])) {
						locrToWrite[locrToWrite.length - 1].push({
							StringHash: parseInt(string.slice(3)),
							String: locrContent[language][string]
						})
					}
				}

				fs.writeFileSync(path.join(process.cwd(), "temp", "LOCR", localisationFileRPKG + ".rpkg", locrHash + ".LOCR.JSON"), JSON.stringify(locrToWrite))

				await copyToCache("global", path.join(process.cwd(), "temp"), path.join("LOCR", locrHash))
			}

			await rpkgInstance.callFunction(`-rebuild_locr_from_json_from "${path.join(process.cwd(), "temp", "LOCR", localisationFileRPKG + ".rpkg")}"`) // Rebuild the LOCR
			fs.copyFileSync(
				path.join(process.cwd(), "temp", "LOCR", localisationFileRPKG + ".rpkg", "LOCR.rebuilt", locrHash + ".LOCR"),
				path.join(process.cwd(), "staging", localisationFileRPKG.replace(/patch[0-9]*/gi, ""), locrHash + ".LOCR")
			)

			fs.emptyDirSync(path.join(process.cwd(), "temp"))
		}

		sentryLocalisationOverridesTransaction.finish()
	}

	/* ---------------------------------------------------------------------------------------------- */
	/*                                             Thumbs                                             */
	/* ---------------------------------------------------------------------------------------------- */
	if (config.skipIntro || thumbs.length) {
		logger.info("Patching thumbs")

		let sentryThumbsPatchingTransaction = sentryTransaction.startChild({
			op: "stage",
			description: "Thumbs patching"
		})
		configureSentryScope(sentryThumbsPatchingTransaction)

		fs.emptyDirSync(path.join(process.cwd(), "temp"))

		if (!fs.existsSync(path.join(process.cwd(), "cleanThumbs.dat"))) {
			// If there is no clean thumbs, copy the one from Retail
			fs.copyFileSync(path.join(config.retailPath, "thumbs.dat"), path.join(process.cwd(), "cleanThumbs.dat"))
		}

		child_process.execSync(`"Third-Party\\h6xtea.exe" -d --src "${path.join(process.cwd(), "cleanThumbs.dat")}" --dst "${path.join(process.cwd(), "temp", "thumbs.dat.decrypted")}"`) // Decrypt thumbs

		let thumbsContent = String(fs.readFileSync(path.join(process.cwd(), "temp", "thumbs.dat.decrypted")))
		if (config.skipIntro) {
			// Skip intro
			thumbsContent = thumbsContent.replace("Boot.entity", "MainMenu.entity")
		}

		for (let patch of thumbs) {
			// Manifest patches
			thumbsContent.replace(/\[Hitman5\]\n/gi, "[Hitman5]\n" + patch + "\n")
		}

		fs.writeFileSync(path.join(process.cwd(), "temp", "thumbs.dat.decrypted"), thumbsContent)
		child_process.execSync(
			`"Third-Party\\h6xtea.exe" -e --src "${path.join(process.cwd(), "temp", "thumbs.dat.decrypted")}" --dst "${path.join(process.cwd(), "temp", "thumbs.dat.decrypted.encrypted")}"`
		) // Encrypt thumbs
		fs.copyFileSync(
			path.join(process.cwd(), "temp", "thumbs.dat.decrypted.encrypted"),
			config.outputToSeparateDirectory ? path.join(process.cwd(), "Output", "thumbs.dat") : path.join(config.retailPath, "thumbs.dat")
		) // Output thumbs

		sentryThumbsPatchingTransaction.finish()
	}

	/* ---------------------------------------------------------------------------------------------- */
	/*                                       Package definition                                       */
	/* ---------------------------------------------------------------------------------------------- */
	logger.info("Patching packagedefinition")

	let sentryPackagedefPatchingTransaction = sentryTransaction.startChild({
		op: "stage",
		description: "packagedefinition patching"
	})
	configureSentryScope(sentryPackagedefPatchingTransaction)

	fs.emptyDirSync(path.join(process.cwd(), "temp"))

	if (!fs.existsSync(path.join(process.cwd(), "cleanPackageDefinition.txt"))) {
		// If there is no clean PD, copy the one from Runtime
		fs.copyFileSync(path.join(config.runtimePath, "packagedefinition.txt"), path.join(process.cwd(), "cleanPackageDefinition.txt"))
	}

	child_process.execSync(
		`"Third-Party\\h6xtea.exe" -d --src "${path.join(config.runtimePath, "packagedefinition.txt")}" --dst "${path.join(process.cwd(), "temp", "packagedefinitionVersionCheck.txt")}"`
	)
	if (!String(fs.readFileSync(path.join(process.cwd(), "temp", "packagedefinitionVersionCheck.txt"))).includes("patchlevel=10001")) {
		// Check if Runtime PD is unmodded and if so overwrite current "clean" version
		fs.copyFileSync(path.join(config.runtimePath, "packagedefinition.txt"), path.join(process.cwd(), "cleanPackageDefinition.txt"))
	}

	child_process.execSync(
		`"Third-Party\\h6xtea.exe" -d --src "${path.join(process.cwd(), "cleanPackageDefinition.txt")}" --dst "${path.join(process.cwd(), "temp", "packagedefinition.txt.decrypted")}"`
	) // Decrypt PD
	let packagedefinitionContent = String(fs.readFileSync(path.join(process.cwd(), "temp", "packagedefinition.txt.decrypted")))
		.split(/\r?\n/)
		.join("\r\n")
		.replace(/patchlevel=[0-9]*/g, "patchlevel=10001") // Patch levels

	for (let brick of packagedefinition) {
		// Apply all PD changes
		switch (brick.type) {
			case "partition":
				packagedefinitionContent += "\r\n"
				packagedefinitionContent += `@partition name=${brick.name} parent=${brick.parent} type=${brick.partitionType} patchlevel=10001\r\n`
				break
			case "entity":
				if (!packagedefinitionContent.includes(brick.path)) {
					packagedefinitionContent = packagedefinitionContent.replace(
						new RegExp(`@partition name=${brick.partition} parent=(.*?) type=(.*?) patchlevel=10001\r\n`),
						(a, parent, type) => `@partition name=${brick.partition} parent=${parent} type=${type} patchlevel=10001\r\n${brick.path}\r\n`
					)
				}
				break
		}
	}

	fs.writeFileSync(path.join(process.cwd(), "temp", "packagedefinition.txt.decrypted"), packagedefinitionContent + "\r\n\r\n\r\n\r\n") // Add blank lines to ensure correct encryption (XTEA uses blocks of 8 bytes)
	child_process.execSync(
		`"Third-Party\\h6xtea.exe" -e --src "${path.join(process.cwd(), "temp", "packagedefinition.txt.decrypted")}" --dst "${path.join(
			process.cwd(),
			"temp",
			"packagedefinition.txt.decrypted.encrypted"
		)}"`
	) // Encrypt PD

	fs.copyFileSync(
		path.join(process.cwd(), "temp", "packagedefinition.txt.decrypted.encrypted"),
		config.outputToSeparateDirectory ? path.join(process.cwd(), "Output", "packagedefinition.txt") : path.join(config.runtimePath, "packagedefinition.txt")
	) // Output PD

	sentryPackagedefPatchingTransaction.finish()

	/* ---------------------------------------------------------------------------------------------- */
	/*                                         Generate RPKGs                                         */
	/* ---------------------------------------------------------------------------------------------- */
	logger.info("Generating RPKGs")

	let sentryRPKGGenerationTransaction = sentryTransaction.startChild({
		op: "stage",
		description: "RPKG generation"
	})
	configureSentryScope(sentryRPKGGenerationTransaction)

	for (let stagingChunkFolder of fs.readdirSync(path.join(process.cwd(), "staging"))) {
		await rpkgInstance.callFunction(`-generate_rpkg_quickly_from "${path.join(process.cwd(), "staging", stagingChunkFolder)}" -output_path "${path.join(process.cwd(), "staging")}"`)

		try {
			fs.copyFileSync(
				path.join(process.cwd(), "staging", stagingChunkFolder + ".rpkg"),
				config.outputToSeparateDirectory
					? path.join(process.cwd(), "Output", rpkgTypes[stagingChunkFolder] == "base" ? stagingChunkFolder + ".rpkg" : stagingChunkFolder + "patch300.rpkg")
					: path.join(config.runtimePath, rpkgTypes[stagingChunkFolder] == "base" ? stagingChunkFolder + ".rpkg" : stagingChunkFolder + "patch300.rpkg")
			)
		} catch {
			logger.error("Couldn't copy the RPKG files! Make sure the game isn't running when you deploy your mods.")
		}
	}

	sentryRPKGGenerationTransaction.finish()

	fs.removeSync(path.join(process.cwd(), "staging"))
	fs.removeSync(path.join(process.cwd(), "temp"))
}
