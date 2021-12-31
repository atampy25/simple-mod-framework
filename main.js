const FrameworkVersion = "1.0.0"

// @ts-ignore
// eslint-disable-next-line no-undef
THREE = require("./three-onlymath.min")

const QuickEntity = {
	"0.1": require("./quickentity1136"),
	"2.0": require("./quickentity20"),
	"2.1": require("./quickentity"),
	
	"999.999": require("./quickentity")
}

const RPKG = require("./rpkg")

const fs = require("fs-extra")
const path = require("path")
const emptyFolder = require("empty-folder")
const { promisify } = require("util")
const child_process = require("child_process")
const LosslessJSON = require("lossless-json")
const md5 = require("md5")
const glob = require("glob")
const deepMerge = require("lodash.merge")

// @ts-ignore
const { crc32 } = require("./crc32")

const readRecursive = require('fs-readdir-recursive')
const os = require("os")
const json5 = require("json5")
const semver = require('semver')
const klaw = require('klaw-sync')
const rfc6902 = require('rfc6902')
const chalk = require('chalk')
const luxon = require('luxon')

require("clarify")

// @ts-ignore
const Piscina = require('piscina')

const logger = !process.argv[2] ? {
	debug: function (text) {
		process.stdout.write(chalk`{grey DEBUG\t${text}}\n`)
	},

	info: function (text) {
		process.stdout.write(chalk`{blue INFO}\t${text}\n`)
	},

	error: function (text, exitAfter = true) {
		process.stderr.write(chalk`{red ERROR}\t${text}\n`)
		console.trace()

		if (exitAfter) cleanExit()
	}
} : {
	debug: console.debug,
	info: console.info,
	error: function(a) {
		console.log(a)
		cleanExit()
	}
} // Any arguments will cause coloured logging to be disabled

process.on('SIGINT', cleanExit)
process.on('SIGTERM', cleanExit)

process.on('uncaughtException', (err, origin) => {
	logger.error("Uncaught exception! " + err, false)
	console.error(origin)
	cleanExit()
})

process.on('unhandledRejection', (err, origin) => {
	logger.error("Unhandled promise rejection! " + err, false)
	console.error(origin)
	cleanExit()
})

const config = json5.parse(String(fs.readFileSync(path.join(process.cwd(), "config.json"))))
config.runtimePath = path.resolve(process.cwd(), config.runtimePath)

const rpkgInstance = new RPKG.RPKGInstance()

function cleanExit() {
	rpkgInstance.exit()
	try {
		global.currentWorkerPool.destroy()
	} catch {}
	process.exit()
}

function hexflip(input) {
	let output = ""

	for (let i = input.length; i > 0 / 2; i = i -2) {
		output += input.substr(i-2, 2)
	}

	return output
}

async function extractOrCopyToTemp(rpkgOfFile, file, type, stagingChunk = "chunk0") {
	if (!fs.existsSync(path.join(process.cwd(), "staging", stagingChunk, file + "." + type))) {
		await rpkgInstance.callFunction(`-extract_from_rpkg "${path.join(config.runtimePath, rpkgOfFile + ".rpkg")}" -filter "${file}" -output_path temp`) // Extract the file
	} else {
		fs.ensureDirSync(path.join(process.cwd(), "temp", rpkgOfFile, type))
		fs.copyFileSync(path.join(process.cwd(), "staging", stagingChunk, file + "." + type), path.join(process.cwd(), "temp", rpkgOfFile, type, file + "." + type)) // Use the staging one (for mod compat - one mod can extract, patch and build, then the next can patch that one instead)
		fs.copyFileSync(path.join(process.cwd(), "staging", stagingChunk, file + "." + type + ".meta"), path.join(process.cwd(), "temp", rpkgOfFile, type, file + "." + type + ".meta"))
	}
}

async function stageAllMods() {
	let startedDate = luxon.DateTime.now()

	await rpkgInstance.waitForInitialised()

	for (let chunkPatchFile of fs.readdirSync(config.runtimePath)) {
		try {
			if (chunkPatchFile.includes("patch")) {
				let chunkPatchNumberMatches = [...chunkPatchFile.matchAll(/chunk[0-9]*patch([0-9]*)\.rpkg/g)]
				let chunkPatchNumber = parseInt(chunkPatchNumberMatches[chunkPatchNumberMatches.length - 1][chunkPatchNumberMatches[chunkPatchNumberMatches.length - 1].length - 1])

				if (chunkPatchNumber >= 200 && chunkPatchNumber < 300) { // The mod framework manages patch files between 200 (inc) and 300 (exc), allowing mods to place runtime files in those ranges
					fs.rmSync(path.join(config.runtimePath, chunkPatchFile))
				}
			} else if (parseInt(chunkPatchFile.split(".")[0].slice(5)) > 27) {
				fs.rmSync(path.join(config.runtimePath, chunkPatchFile))
			}
		} catch {}
	}

	try {
		await promisify(emptyFolder)("staging", true)
	} catch {}

	try {
		await promisify(emptyFolder)("temp", true)
	} catch {}

	fs.mkdirSync("staging")
	fs.mkdirSync("temp")

	let packagedefinition = []
	let localisation = []
	let localisationOverrides = {}
	let runtimePackages = []
	let WWEVpatches = {}

	let rpkgTypes = {}


	/* ---------------------------------------------------------------------------------------------- */
	/*                                         Stage all mods                                         */
	/* ---------------------------------------------------------------------------------------------- */
	for (let mod of config.loadOrder) {
		// NOT Mod folder exists, mod has no manifest, mod has RPKGs (mod is an RPKG-only mod)
		if (!(fs.existsSync(path.join(process.cwd(), "Mods", mod)) && !fs.existsSync(path.join(process.cwd(), "Mods", mod, "manifest.json")) && klaw(path.join(process.cwd(), "Mods", mod)).filter(a=>a.stats.size > 0).map(a=>a.path).some(a=>a.endsWith(".rpkg")))) {
			// Find mod with ID in Mods folder, set the current mod to that folder
			mod = fs.readdirSync(path.join(process.cwd(), "Mods")).find(a=>fs.existsSync(path.join(process.cwd(), "Mods", a, "manifest.json")) && json5.parse(String(fs.readFileSync(path.join(process.cwd(), "Mods", a, "manifest.json")))).id == mod)
		} // Essentially, if the mod isn't an RPKG mod, it is referenced by its ID, so this finds the mod folder with the right ID

		if (!fs.existsSync(path.join(process.cwd(), "Mods", mod, "manifest.json"))) {
			for (let chunkFolder of fs.readdirSync(path.join(process.cwd(), "Mods", mod))) {
				try {
					fs.mkdirSync(path.join(process.cwd(), "staging", chunkFolder))
				} catch {}

				try {
					await promisify(emptyFolder)("temp", true)
				} catch {}
				fs.mkdirSync("temp") // Clear the temp directory

				for (let contentFile of fs.readdirSync(path.join(process.cwd(), "Mods", mod, chunkFolder))) {
					await rpkgInstance.callFunction(`-extract_from_rpkg "${path.join(process.cwd(), "Mods", mod, chunkFolder, contentFile)}" -output_path "${path.join(process.cwd(), "temp")}"`)
				}
				
				rpkgTypes[chunkFolder] = "patch"

				let allFiles = klaw(path.join(process.cwd(), "temp")).filter(a=>a.stats.size > 0).map(a=>a.path)

				allFiles.forEach(a=>fs.copyFileSync(a, path.join(process.cwd(), "staging", chunkFolder, path.basename(a))))

				try {
					await promisify(emptyFolder)("temp", true)
				} catch {}
				fs.mkdirSync("temp") // Clear the temp directory
			}
		} else {
			let manifest = json5.parse(String(fs.readFileSync(path.join(process.cwd(), "Mods", mod, "manifest.json"))))

			logger.info("Staging mod: " + manifest.name)

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

			if (manifest.contentFolder && manifest.contentFolder.length && fs.existsSync(path.join(process.cwd(), "Mods", mod, manifest.contentFolder)) && fs.readdirSync(path.join(process.cwd(), "Mods", mod, manifest.contentFolder)).length) {
				contentFolders.push(manifest.contentFolder)
			}

			if (manifest.blobsFolder && manifest.blobsFolder.length && fs.existsSync(path.join(process.cwd(), "Mods", mod, manifest.blobsFolder)) && fs.readdirSync(path.join(process.cwd(), "Mods", mod, manifest.blobsFolder)).length) {
				blobsFolders.push(manifest.blobsFolder)
			}

			if (config.modOptions[manifest.id] && manifest.options && manifest.options.length) {
				for (let option of manifest.options.filter(a => (config.modOptions[manifest.id].includes(a.name)) || (a.type == "requirement" && a.mods.every(b=>config.loadOrder.includes(b))))) {
					if (option.contentFolder && option.contentFolder.length && fs.existsSync(path.join(process.cwd(), "Mods", mod, option.contentFolder)) && fs.readdirSync(path.join(process.cwd(), "Mods", mod, option.contentFolder)).length) {
						contentFolders.push(option.contentFolder)
					}

					if (option.blobsFolder && option.blobsFolder.length && fs.existsSync(path.join(process.cwd(), "Mods", mod, option.blobsFolder)) && fs.readdirSync(path.join(process.cwd(), "Mods", mod, option.blobsFolder)).length) {
						blobsFolders.push(option.blobsFolder)
					}

					option.localisation && deepMerge(manifest.localisation, option.localisation)
					option.localisationOverrides && deepMerge(manifest.localisationOverrides, option.localisationOverrides)
					option.localisedLines && deepMerge(manifest.localisedLines, option.localisedLines)
					
					option.runtimePackages && manifest.runtimePackages.push(...option.runtimePackages)
					option.dependencies && manifest.dependencies.push(...option.dependencies)
					option.requirements && manifest.requirements.push(...option.requirements)
				}
			}

			if (manifest.requirements) {
				for (let req of manifest.requirements) {
					if (!config.loadOrder.includes(req)) {
						logger.error(`Mod ${manifest.name} is missing requirement ${req}!`)
					}
				}
			}

			/* ---------------------------------------------------------------------------------------------- */
			/*                                             Content                                            */
			/* ---------------------------------------------------------------------------------------------- */
			let entityPatches = []
			
			for (let contentFolder of contentFolders) {
				for (let chunkFolder of fs.readdirSync(path.join(process.cwd(), "Mods", mod, contentFolder))) {
					try {
						fs.mkdirSync(path.join(process.cwd(), "staging", chunkFolder))
					} catch {}
	
					let contractsORESChunk, contractsORESContent, contractsORESMetaContent
					if (readRecursive(path.join(process.cwd(), "Mods", mod, contentFolder, chunkFolder)).some(a=>a.endsWith("contract.json"))) {
						try {
							await promisify(emptyFolder)("temp2", true)
						} catch {}
						fs.mkdirSync("temp2") // Make/clear the temp2 directory
	
						contractsORESChunk = await rpkgInstance.getRPKGOfHash("002B07020D21D727")
	
						if (!fs.existsSync(path.join(process.cwd(), "staging", "chunk0", "002B07020D21D727.ORES"))) {
							await rpkgInstance.callFunction(`-extract_from_rpkg "${path.join(config.runtimePath, contractsORESChunk + ".rpkg")}" -filter "002B07020D21D727" -output_path temp2`) // Extract the contracts ORES
						} else {
							fs.ensureDirSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES"))
							fs.copyFileSync(path.join(process.cwd(), "staging", "chunk0", "002B07020D21D727.ORES"), path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES")) // Use the staging one (for mod compat - one mod can extract, patch and build, then the next can patch that one instead)
							fs.copyFileSync(path.join(process.cwd(), "staging", "chunk0", "002B07020D21D727.ORES.meta"), path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.meta"))
						}
						
						child_process.execSync(`"Third-Party\\OREStool.exe" "${path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES")}"`)
						contractsORESContent = JSON.parse(String(fs.readFileSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.JSON"))))
	
						await rpkgInstance.callFunction(`-hash_meta_to_json "${path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.meta")}"`)
						contractsORESMetaContent = JSON.parse(String(fs.readFileSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.meta.JSON"))))
					} // There are contracts, extract the contracts ORES and copy it to the temp2 directory
	
					for (let contentFile of readRecursive(path.join(process.cwd(), "Mods", mod, contentFolder, chunkFolder))) {
						let contentType = path.basename(contentFile).split(".").slice(1).join(".")
						let contentFilePath = path.join(process.cwd(), "Mods", mod, contentFolder, chunkFolder, contentFile)
		
						let entityContent
						switch (contentType) {
							case "entity.json":
								entityContent = LosslessJSON.parse(String(fs.readFileSync(contentFilePath)))

								logger.debug("Converting entity " + contentFilePath)

								if (!QuickEntity[Object.keys(QuickEntity)[Object.keys(QuickEntity).findIndex(a=> parseFloat(a) > Number(entityContent.quickEntityVersion.value)) - 1]]) {
									logger.error("Could not find matching QuickEntity version for " + Number(entityContent.quickEntityVersion.value) + "!")
								}

								await (QuickEntity[Object.keys(QuickEntity)[Object.keys(QuickEntity).findIndex(a=> parseFloat(a) > Number(entityContent.quickEntityVersion.value)) - 1]]).generate("HM3", contentFilePath,
															path.join(process.cwd(), "temp", "temp.TEMP.json"),
															path.join(process.cwd(), "temp", "temp.TEMP.meta.json"),
															path.join(process.cwd(), "temp", "temp.TBLU.json"),
															path.join(process.cwd(), "temp", "temp.TBLU.meta.json")) // Generate the RT files from the QN json
								
								child_process.execSync("\"Third-Party\\ResourceTool.exe\" HM3 generate TEMP \"" + path.join(process.cwd(), "temp", "temp.TEMP.json") + "\" \"" + path.join(process.cwd(), "temp", "temp.TEMP") + "\" --simple")
								child_process.execSync("\"Third-Party\\ResourceTool.exe\" HM3 generate TBLU \"" + path.join(process.cwd(), "temp", "temp.TBLU.json") + "\" \"" + path.join(process.cwd(), "temp", "temp.TBLU") + "\" --simple")
								await rpkgInstance.callFunction(`-json_to_hash_meta "${path.join(process.cwd(), "temp", "temp.TEMP.meta.json")}"`)
								await rpkgInstance.callFunction(`-json_to_hash_meta "${path.join(process.cwd(), "temp", "temp.TBLU.meta.json")}"`) // Generate the binary files from the RT json
		
								fs.copyFileSync(path.join(process.cwd(), "temp", "temp.TEMP"), path.join(process.cwd(), "staging", chunkFolder, entityContent.tempHash + ".TEMP"))
								fs.copyFileSync(path.join(process.cwd(), "temp", "temp.TEMP.meta"), path.join(process.cwd(), "staging", chunkFolder, entityContent.tempHash + ".TEMP.meta"))
								fs.copyFileSync(path.join(process.cwd(), "temp", "temp.TBLU"), path.join(process.cwd(), "staging", chunkFolder, entityContent.tbluHash + ".TBLU"))
								fs.copyFileSync(path.join(process.cwd(), "temp", "temp.TBLU.meta"), path.join(process.cwd(), "staging", chunkFolder, entityContent.tbluHash + ".TBLU.meta")) // Copy the binary files to the staging directory
								break;
							case "entity.patch.json":
								entityContent = LosslessJSON.parse(String(fs.readFileSync(contentFilePath)))
	
								logger.debug("Preparing to apply patch " + contentFilePath)

								entityPatches.push({
									contentFilePath,
									chunkFolder,
									entityContent,
									tempRPKG: await rpkgInstance.getRPKGOfHash(entityContent.tempHash),
									tbluRPKG: await rpkgInstance.getRPKGOfHash(entityContent.tbluHash)
								})
								break;
							case "unlockables.json":
								entityContent = JSON.parse(String(fs.readFileSync(contentFilePath)))
								let oresChunk = await rpkgInstance.getRPKGOfHash("0057C2C3941115CA")

								logger.debug("Applying unlockable patch " + contentFilePath)

								await extractOrCopyToTemp(oresChunk, "0057C2C3941115CA", "ORES") // Extract the ORES to temp
	
								child_process.execSync(`"Third-Party\\OREStool.exe" "${path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES")}"`)
								let oresContent = JSON.parse(String(fs.readFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES.JSON"))))
	
								let oresToPatch = Object.fromEntries(oresContent.map(a=>[a.Id, a]))
								deepMerge(oresToPatch, entityContent)
								let oresToWrite = Object.values(oresToPatch)
	
								fs.writeFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES.JSON"), JSON.stringify(oresToWrite))
								fs.rmSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES"))
								child_process.execSync(`"Third-Party\\OREStool.exe" "${path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES.json")}"`)
	
								fs.copyFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES"), path.join(process.cwd(), "staging", "chunk0", "0057C2C3941115CA.ORES"))
								fs.copyFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES.meta"), path.join(process.cwd(), "staging", "chunk0", "0057C2C3941115CA.ORES.meta"))
								break;
							case "repository.json":
								entityContent = JSON.parse(String(fs.readFileSync(contentFilePath)))
	
								let repoRPKG = await rpkgInstance.getRPKGOfHash("00204D1AFD76AB13")

								logger.debug("Applying repository patch " + contentFilePath)

								await extractOrCopyToTemp(repoRPKG, "00204D1AFD76AB13", "REPO") // Extract the REPO to temp
	
								let repoContent = JSON.parse(String(fs.readFileSync(path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO"))))
	
								let repoToPatch = Object.fromEntries(repoContent.map(a=>[a["ID_"], a]))
								deepMerge(repoToPatch, entityContent)
								let repoToWrite = Object.values(repoToPatch)
	
								let editedItems = new Set(Object.keys(entityContent))
	
								await rpkgInstance.callFunction(`-hash_meta_to_json "${path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO.meta")}"`)
								let metaContent = JSON.parse(String(fs.readFileSync(path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO.meta.JSON"))))
								for (let repoItem of repoToWrite) {
									if (editedItems.has(repoItem.ID_)) {
										if (repoItem.Runtime) {
											if (!metaContent["hash_reference_data"].find(a=>a.hash == parseInt(repoItem.Runtime).toString(16).toUpperCase())) {
												metaContent["hash_reference_data"].push({
													"hash": parseInt(repoItem.Runtime).toString(16).toUpperCase(),
													"flag": "9F"
												}) // Add Runtime of any items to REPO depends if not already there
											}
										}
		
										if (repoItem.Image) {
											if (!metaContent["hash_reference_data"].find(a=>a.hash == "00" + md5(`[assembly:/_pro/online/default/cloudstorage/resources/${repoItem.Image}].pc_gfx`.toLowerCase()).slice(2, 16).toUpperCase())) {
												metaContent["hash_reference_data"].push({
													"hash": "00" + md5(`[assembly:/_pro/online/default/cloudstorage/resources/${repoItem.Image}].pc_gfx`.toLowerCase()).slice(2, 16).toUpperCase(),
													"flag": "9F"
												}) // Add Image of any items to REPO depends if not already there
											}
										}
									}
								}
								fs.writeFileSync(path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO.meta.JSON"), JSON.stringify(metaContent))
								fs.rmSync(path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO.meta"))
								await rpkgInstance.callFunction(`-json_to_hash_meta "${path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO.meta.JSON")}"`) // Add all runtimes to REPO depends
	
								fs.writeFileSync(path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO"), JSON.stringify(repoToWrite))
								fs.copyFileSync(path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO"), path.join(process.cwd(), "staging", "chunk0", "00204D1AFD76AB13.REPO"))
								fs.copyFileSync(path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO.meta"), path.join(process.cwd(), "staging", "chunk0", "00204D1AFD76AB13.REPO.meta"))
								break;
							case "contract.json":
								entityContent = LosslessJSON.parse(String(fs.readFileSync(contentFilePath)))
	
								let contractHash = "00" + md5(("smfContract" + entityContent.Metadata.Id).toLowerCase()).slice(2, 16).toUpperCase()

								logger.debug("Adding contract " + contentFilePath)
	
								contractsORESContent[contractHash] = entityContent.Metadata.Id // Add the contract to the ORES
	
								contractsORESMetaContent["hash_reference_data"].push({
									"hash": contractHash,
									"flag": "9F"
								})
	
								fs.writeFileSync(path.join(process.cwd(), "staging", "chunk0", contractHash + ".JSON"), LosslessJSON.stringify(entityContent)) // Write the actual contract to the staging directory
								break;
							case "JSON.patch.json":
								entityContent = JSON.parse(String(fs.readFileSync(contentFilePath)))
	
								let rpkgOfFile = await rpkgInstance.getRPKGOfHash(entityContent.file)

								logger.debug("Applying JSON patch " + contentFilePath)

								await extractOrCopyToTemp(rpkgOfFile, entityContent.file, "JSON", chunkFolder) // Extract the JSON to temp
	
								let fileContent = JSON.parse(String(fs.readFileSync(path.join(process.cwd(), "temp", rpkgOfFile, "JSON", entityContent.file + ".JSON"))))

								rfc6902.applyPatch(fileContent, entityContent.patch) // Apply the JSON patch

								fs.writeFileSync(path.join(process.cwd(), "temp", rpkgOfFile, "JSON", entityContent.file + ".JSON"), JSON.stringify(fileContent))
								fs.copyFileSync(path.join(process.cwd(), "temp", rpkgOfFile, "JSON", entityContent.file + ".JSON"), path.join(process.cwd(), "staging", chunkFolder, entityContent.file + ".JSON"))
								fs.copyFileSync(path.join(process.cwd(), "temp", rpkgOfFile, "JSON", entityContent.file + ".JSON.meta"), path.join(process.cwd(), "staging", chunkFolder, entityContent.file + ".JSON.meta"))
								break;
							case "texture.tga":
								logger.debug("Converting texture " + contentFilePath)
								if (path.basename(contentFile).split(".")[0].split("~").length > 1) {
									child_process.execSync(`"Third-Party\\HMTextureTools" rebuild H3 "${contentFilePath}" --metapath "${contentFilePath + ".meta"}" "${path.join(process.cwd(), "staging", chunkFolder, path.basename(contentFile).split(".")[0].split("~")[0] + ".TEXT")}" --rebuildboth --texdoutput "${path.join(process.cwd(), "staging", chunkFolder, path.basename(contentFile).split(".")[0].split("~")[1] + ".TEXD")}"`) // Rebuild texture to TEXT/TEXD
								} else { // TEXT only
									child_process.execSync(`"Third-Party\\HMTextureTools" rebuild H3 "${contentFilePath}" --metapath "${contentFilePath + ".meta"}" "${path.join(process.cwd(), "staging", chunkFolder, path.basename(contentFile).split(".")[0] + ".TEXT")}"`) // Rebuild texture to TEXT only
								}
								break;
							case "sfx.wem":
								if (!WWEVpatches[path.basename(contentFile).split(".")[0].split("~")[0]]) { WWEVpatches[path.basename(contentFile).split(".")[0].split("~")[0]] = [] }
								WWEVpatches[path.basename(contentFile).split(".")[0].split("~")[0]].push({
									index: path.basename(contentFile).split(".")[0].split("~")[1],
									filepath: contentFilePath,
									chunk: chunkFolder
								})
								break;
							default:
								fs.copyFileSync(contentFilePath, path.join(process.cwd(), "staging", chunkFolder, path.basename(contentFile))) // Copy the file to the staging directory
								break;
						}
		
						try {
							await promisify(emptyFolder)("temp", true)
						} catch {}
						fs.mkdirSync("temp") // Clear the temp directory
					}
	
					/* --------- There are contracts, repackage the contracts ORES from the temp2 directory --------- */
					if (readRecursive(path.join(process.cwd(), "Mods", mod, contentFolder, chunkFolder)).some(a=>a.endsWith("contract.json"))) {
						fs.writeFileSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.meta.JSON"), JSON.stringify(contractsORESMetaContent))
						fs.rmSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.meta"))
						await rpkgInstance.callFunction(`-json_to_hash_meta "${path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.meta.JSON")}"`) // Rebuild the ORES meta
	
						fs.writeFileSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.JSON"), JSON.stringify(contractsORESContent))
						fs.rmSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES"))
						child_process.execSync(`"Third-Party\\OREStool.exe" "${path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.json")}"`) // Rebuild the ORES
	
						fs.copyFileSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES"), path.join(process.cwd(), "staging", "chunk0", "002B07020D21D727.ORES"))
						fs.copyFileSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.meta"), path.join(process.cwd(), "staging", "chunk0", "002B07020D21D727.ORES.meta")) // Copy the ORES to the staging directory
					
						try {
							await promisify(emptyFolder)("temp2", true)
						} catch {}
					}
	
					/* ------------------------------ Copy chunk meta to staging folder ----------------------------- */
					if (fs.existsSync(path.join(process.cwd(), "Mods", mod, contentFolder, chunkFolder, chunkFolder + ".meta"))) {
						fs.copyFileSync(path.join(process.cwd(), "Mods", mod, contentFolder, chunkFolder, chunkFolder + ".meta"), path.join(process.cwd(), "staging", chunkFolder, chunkFolder + ".meta"))
						rpkgTypes[chunkFolder] = "base"
					} else {
						rpkgTypes[chunkFolder] = "patch"
					}
				}
			}
	
			/* ------------------------------------- Multithreaded patching ------------------------------------ */
			let index = 0

			let workerPool = new Piscina({
				filename: "patchWorker.js",
				maxThreads: os.cpus().length / 4 // For an 8-core CPU with 16 logical processors there are 4 max threads
			});

			global.currentWorkerPool = workerPool

			await Promise.all(entityPatches.map(({contentFilePath, chunkFolder, entityContent, tempRPKG, tbluRPKG}) => {
				index ++
				return workerPool.run({
					contentFilePath,
					chunkFolder,
					entityContent,
					tempRPKG,
					tbluRPKG,
					assignedTemporaryDirectory: "patchWorker" + index,
					useNiceLogs: !process.argv[2]
				})
			})); // Run each patch in the worker queue and wait for all of them to finish

			/* ---------------------------------------------------------------------------------------------- */
			/*                                              Blobs                                             */
			/* ---------------------------------------------------------------------------------------------- */
			if (blobsFolders.length) {
				try {
					await promisify(emptyFolder)("temp", true)
				} catch {}
				fs.mkdirSync("temp") // Clear the temp directory

				fs.ensureDirSync(path.join(process.cwd(), "staging", "chunk0"))

				let oresChunk = await rpkgInstance.getRPKGOfHash("00858D45F5F9E3CA")

				await extractOrCopyToTemp(oresChunk, "00858D45F5F9E3CA", "ORES") // Extract the ORES to temp

				child_process.execSync(`"Third-Party\\OREStool.exe" "${path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES")}"`)
				let oresContent = JSON.parse(String(fs.readFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.JSON"))))

				await rpkgInstance.callFunction(`-hash_meta_to_json "${path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.meta")}"`)
				let metaContent = JSON.parse(String(fs.readFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.meta.JSON"))))

				for (let blobsFolder of blobsFolders) {
					for (let blob of glob.sync(path.join(process.cwd(), "Mods", mod, blobsFolder, "**/*.*"))) {
						let blobPath = path.resolve(blob).split(path.resolve(process.cwd()))[1].split(path.sep).slice(4).join("/")
	
						let blobHash
						if (path.extname(blob).startsWith(".jp") || path.extname(blob) == ".png") {
							blobHash = "00" + md5((`[assembly:/_pro/online/default/cloudstorage/resources/${blobPath}].pc_gfx`).toLowerCase()).slice(2, 16).toUpperCase()
						} else if (path.extname(blob) == ".json") {
							blobHash = "00" + md5((`[assembly:/_pro/online/default/cloudstorage/resources/${blobPath}].pc_json`).toLowerCase()).slice(2, 16).toUpperCase()
						} else {
							blobHash = "00" + md5((`[assembly:/_pro/online/default/cloudstorage/resources/${blobPath}].pc_${path.extname(blob).slice(1)}`).toLowerCase()).slice(2, 16).toUpperCase()
						}
	
						oresContent[blobHash] = blobPath // Add the blob to the ORES
	
						if (!metaContent["hash_reference_data"].find(a=>a.hash == blobHash)) {
							metaContent["hash_reference_data"].push({
								"hash": blobHash,
								"flag": "9F"
							})
						}
	
						fs.copyFileSync(blob, path.join(process.cwd(), "staging", "chunk0", blobHash + "." + ((path.extname(blob) == ".json") ? "JSON" :
																											(path.extname(blob).startsWith(".jp") || path.extname(blob) == ".png") ? "GFXI" :
																											path.extname(blob).slice(1).toUpperCase()))) // Copy the actual blob to the staging directory
					}
				}

				fs.writeFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.meta.JSON"), JSON.stringify(metaContent))
				fs.rmSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.meta"))
				await rpkgInstance.callFunction(`-json_to_hash_meta "${path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.meta.JSON")}"`) // Rebuild the meta

				fs.writeFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.JSON"), JSON.stringify(oresContent))
				fs.rmSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES"))
				child_process.execSync(`"Third-Party\\OREStool.exe" "${path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.json")}"`) // Rebuild the ORES

				fs.copyFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES"), path.join(process.cwd(), "staging", "chunk0", "00858D45F5F9E3CA.ORES"))
				fs.copyFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.meta"), path.join(process.cwd(), "staging", "chunk0", "00858D45F5F9E3CA.ORES.meta")) // Copy the ORES to the staging directory

				try {
					await promisify(emptyFolder)("temp", true)
				} catch {}
				fs.mkdirSync("temp") // Clear the temp directory
			}

			/* -------------------------------------- Runtime packages -------------------------------------- */
			if (manifest.runtimePackages) {
					runtimePackages.push(...manifest.runtimePackages.map(a=>{
					return {
						chunk: a.chunk,
						path: a.path,
						mod: mod
					}
				}))
			}

			/* ---------------------------------------- Dependencies ---------------------------------------- */
			if (manifest.dependencies) {
				for (let dependency of manifest.dependencies) {
					try {
						await promisify(emptyFolder)("temp", true)
					} catch {}
					fs.mkdirSync("temp") // Clear the temp directory

					await rpkgInstance.callFunction(`-extract_non_base_hash_depends_from "${path.join(config.runtimePath)}" -filter "${dependency}" -output_path temp`)

					let allFiles = klaw(path.join(process.cwd(), "temp")).filter(a=>a.stats.size > 0).map(a=>a.path).map(a=>{ return {rpkg: (/00[0-9A-F]*\..*?\\(chunk[0-9]*(?:patch[0-9]*)?)\\/gi).exec(a)[1], path: a} }).sort((a,b) => b.rpkg.localeCompare(a.rpkg, undefined, {numeric: true, sensitivity: 'base'}))
					// Sort files by RPKG name in descending order
					
					let allFilesSuperseded = []
					allFiles.forEach(a => { if (!allFilesSuperseded.some(b => path.basename(b) == path.basename(a.path))) { allFilesSuperseded.push(a.path) } })
					// Add files without duplicates (since the list is in desc order patches are first which means that superseded files are added correctly)
					
					allFilesSuperseded = allFilesSuperseded.filter(a=>!/chunk[0-9]*(?:patch[0-9]*)?\.meta/gi.exec(path.basename(a)))
					// Remove RPKG metas

					fs.ensureDirSync(path.join(process.cwd(), "staging", "chunk0"))
					allFilesSuperseded.forEach(file => {
						fs.copySync(file, path.join(process.cwd(), "staging", "chunk0", path.basename(file)), { overwrite: false }) // Stage the files, but don't overwrite if they already exist (such as if another mod has edited them)
					})

					try {
						await promisify(emptyFolder)("temp", true)
					} catch {}
					fs.mkdirSync("temp") // Clear the temp directory
				}
			}
		
			/* ------------------------------------- Package definition ------------------------------------- */
			if (manifest.packagedefinition) {
				packagedefinition.push(...manifest.packagedefinition)
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
				for (let lineHash of Object.keys(manifest.localisedLines)) {
					fs.ensureDirSync(path.join(process.cwd(), "staging", "chunk0"))
					
					fs.writeFileSync(path.join(process.cwd(), "staging", "chunk0", lineHash + ".LINE"), Buffer.from(hexflip(crc32(manifest.localisedLines[lineHash].toUpperCase()).toString(16)) + "00", "hex")) // Create the LINE file
					
					fs.writeFileSync(path.join(process.cwd(), "staging", "chunk0", lineHash + ".LINE.meta.JSON"), JSON.stringify({ // Create its meta
						"hash_value": lineHash,
						"hash_offset": 163430439,
						"hash_size": 2147483648,
						"hash_resource_type": "LINE",
						"hash_reference_table_size": 13,
						"hash_reference_table_dummy": 0,
						"hash_size_final": 5,
						"hash_size_in_memory": 4294967295,
						"hash_size_in_video_memory": 4294967295,
						"hash_reference_data": [
							{
								"hash": "00F5817876E691F1", // localisedLines only supports localisation key
								"flag": "1F"
							}
						]
					}))
					await rpkgInstance.callFunction(`-json_to_hash_meta "${path.join(process.cwd(), "staging", "chunk0", lineHash + ".LINE.meta.JSON")}"`) // Rebuild the meta
				}
			}
		}
	}

	if (config.outputToSeparateDirectory) {
		try {
			await promisify(emptyFolder)("Output", true)
		} catch {}
		fs.mkdirSync("Output")
	} // Make output folder

	/* ---------------------------------------------------------------------------------------------- */
	/*                                          WWEV patches                                          */
	/* ---------------------------------------------------------------------------------------------- */
	for (let entry of Object.entries(WWEVpatches)) {
		logger.debug("Patching WWEV " + entry[0])

		try {
			await promisify(emptyFolder)("temp", true)
		} catch {}
		fs.mkdirSync("temp") // Clear the temp directory

		let WWEVhash = entry[0]
		let rpkgOfWWEV = await rpkgInstance.getRPKGOfHash(WWEVhash)
	
		await rpkgInstance.callFunction(`-extract_wwev_to_ogg_from "${path.join(config.runtimePath)}" -filter "${WWEVhash}" -output_path temp`) // Extract the WWEV

		let workingPath = path.join(process.cwd(), "temp", "WWEV", rpkgOfWWEV + ".rpkg", fs.readdirSync(path.join(process.cwd(), "temp", "WWEV", rpkgOfWWEV + ".rpkg"))[0])

		for (let patch of entry[1]) {
			fs.copyFileSync(patch.filepath, path.join(workingPath, "wem", patch.index + ".wem")) // Copy the wem
		}
	
		await rpkgInstance.callFunction(`-rebuild_wwev_in "${path.resolve(path.join(workingPath, ".."))}"`) // Rebuild the WWEV

		fs.ensureDirSync(path.join(process.cwd(), "staging", entry[1][0].chunk))

		fs.copyFileSync(path.join(workingPath, WWEVhash + ".WWEV"), path.join(process.cwd(), "staging", entry[1][0].chunk, WWEVhash + ".WWEV"))
		fs.copyFileSync(path.join(workingPath, WWEVhash + ".WWEV.meta"), path.join(process.cwd(), "staging", entry[1][0].chunk, WWEVhash + ".WWEV.meta")) // Copy the WWEV and its meta
	}

	/* ---------------------------------------------------------------------------------------------- */
	/*                                        Runtime packages                                        */
	/* ---------------------------------------------------------------------------------------------- */
	logger.info("Copying runtime packages")

	let runtimePatchNumber = 205
	for (let runtimeFile of runtimePackages) {
		// {
		//     "chunk": 0,
		//     "path": "portedhashes.rpkg"
		// }

		fs.copyFileSync(path.join(process.cwd(), "Mods", runtimeFile.mod, runtimeFile.path), config.outputToSeparateDirectory ? path.join(process.cwd(), "Output", "chunk" + runtimeFile.chunk + "patch" + runtimePatchNumber + ".rpkg") : path.join(config.runtimePath, "chunk" + runtimeFile.chunk + "patch" + runtimePatchNumber + ".rpkg"))
		runtimePatchNumber ++

		if (runtimePatchNumber >= 300) {
			logger.error("More than 94 total runtime packages!")
		} // Framework only manages patch200-300
	}

	/* ---------------------------------------------------------------------------------------------- */
	/*                                          Localisation                                          */
	/* ---------------------------------------------------------------------------------------------- */
	logger.info("Localising text")

	if (localisation.length) {
		let languages = {
			"english": "en",
			"french": "fr",
			"italian": "it",
			"german": "de",
			"spanish": "es",
			"russian": "ru",
			"chineseSimplified": "cn",
			"chineseTraditional": "tc",
			"japanese": "jp"
		}

		try {
			await promisify(emptyFolder)("temp", true)
		} catch {}
		fs.mkdirSync("temp") // Clear the temp directory

		let localisationFileRPKG = await rpkgInstance.getRPKGOfHash("00F5817876E691F1")
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
			locrToWrite.push([{
				"Language": language
			}])

			for (let string of Object.keys(locrContent[language])) {
				locrToWrite[locrToWrite.length - 1].push({
					"StringHash": parseInt(string.slice(3)),
					"String": locrContent[language][string]
				})
			}
		}

		fs.writeFileSync(path.join(process.cwd(), "temp", "LOCR", localisationFileRPKG + ".rpkg", "00F5817876E691F1.LOCR.JSON"), JSON.stringify(locrToWrite))
		await rpkgInstance.callFunction(`-rebuild_locr_from_json_from "${path.join(process.cwd(), "temp", "LOCR", localisationFileRPKG + ".rpkg")}"`) // Rebuild the LOCR
		fs.copyFileSync(path.join(process.cwd(), "temp", "LOCR", localisationFileRPKG + ".rpkg", "LOCR.rebuilt", "00F5817876E691F1.LOCR"), path.join(process.cwd(), "staging", localisationFileRPKG.replace(/patch[0-9]*/gi, ""), "00F5817876E691F1.LOCR"))

		try {
			await promisify(emptyFolder)("temp", true)
		} catch {}
		fs.mkdirSync("temp") // Clear the temp directory
	}

	if (Object.keys(localisationOverrides).length) {
		let languages = {
			"english": "en",
			"french": "fr",
			"italian": "it",
			"german": "de",
			"spanish": "es",
			"russian": "ru",
			"chineseSimplified": "cn",
			"chineseTraditional": "tc",
			"japanese": "jp"
		}

		try {
			await promisify(emptyFolder)("temp", true)
		} catch {}
		fs.mkdirSync("temp") // Clear the temp directory

		for (let locrHash of Object.keys(localisationOverrides)) {
			let localisationFileRPKG = await rpkgInstance.getRPKGOfHash(locrHash)
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
				toMerge["abc" + crc32(item.locString.toUpperCase())] = item.text
	
				deepMerge(locrContent[languages[item.language]], toMerge)
	
				if (item.language == "english") {
					deepMerge(locrContent["xx"], toMerge)
				}
			}
	
			/** @type Array<Array<{Language: string}|{StringHash: number, String: string}>> */
			let locrToWrite = []
	
			for (let language of Object.keys(locrContent)) {
				locrToWrite.push([{
					"Language": language
				}])
	
				for (let string of Object.keys(locrContent[language])) {
					locrToWrite[locrToWrite.length - 1].push({
						"StringHash": parseInt(string.slice(3)),
						"String": locrContent[language][string]
					})
				}
			}
	
			fs.writeFileSync(path.join(process.cwd(), "temp", "LOCR", localisationFileRPKG + ".rpkg", locrHash + ".LOCR.JSON"), JSON.stringify(locrToWrite))
			await rpkgInstance.callFunction(`-rebuild_locr_from_json_from "${path.join(process.cwd(), "temp", "LOCR", localisationFileRPKG + ".rpkg")}"`) // Rebuild the LOCR
			fs.copyFileSync(path.join(process.cwd(), "temp", "LOCR", localisationFileRPKG + ".rpkg", "LOCR.rebuilt", locrHash + ".LOCR"), path.join(process.cwd(), "staging", localisationFileRPKG.replace(/patch[0-9]*/gi, ""), locrHash + ".LOCR"))
	
			try {
				await promisify(emptyFolder)("temp", true)
			} catch {}
			fs.mkdirSync("temp") // Clear the temp directory
		}
	}

	/* ---------------------------------------------------------------------------------------------- */
	/*                                             Thumbs                                             */
	/* ---------------------------------------------------------------------------------------------- */
	if (!fs.existsSync(path.join(process.cwd(), "cleanThumbs.dat"))) { // If there is no clean thumbs, copy the one from Retail
		fs.copyFileSync(path.join(config.runtimePath, "..", "Retail", "thumbs.dat"), path.join(process.cwd(), "cleanThumbs.dat"))
	}

	child_process.execSync(`"Third-Party\\h6xtea.exe" -d --src "${path.join(config.runtimePath, "..", "Retail", "thumbs.dat")}" --dst "${path.join(process.cwd(), "temp", "thumbsVersionCheck.dat")}"`)
	if (!String(fs.readFileSync(path.join(process.cwd(), "temp", "thumbsVersionCheck.dat"))).includes("MainMenu.entity")) { // Check if thumbs has no skip intro and if so overwrite current "clean" version
		fs.copyFileSync(path.join(config.runtimePath, "..", "Retail", "thumbs.dat"), path.join(process.cwd(), "cleanThumbs.dat"))
	}

	if (config.skipIntro) { // Skip intro
		child_process.execSync(`"Third-Party\\h6xtea.exe" -d --src "${path.join(process.cwd(), "cleanThumbs.dat")}" --dst "${path.join(process.cwd(), "temp", "thumbs.dat.decrypted")}"`) // Decrypt thumbs
		fs.writeFileSync(path.join(process.cwd(), "temp", "thumbs.dat.decrypted"), String(fs.readFileSync(path.join(process.cwd(), "temp", "thumbs.dat.decrypted"))).replace("Boot.entity", "MainMenu.entity")) // Replace Boot with MainMenu
		child_process.execSync(`"Third-Party\\h6xtea.exe" -e --src "${path.join(process.cwd(), "temp", "thumbs.dat.decrypted")}" --dst "${path.join(process.cwd(), "temp", "thumbs.dat.decrypted.encrypted")}"`) // Encrypt thumbs
		
		fs.copyFileSync(path.join(process.cwd(), "temp", "thumbs.dat.decrypted.encrypted"), config.outputToSeparateDirectory ? path.join(process.cwd(), "Output", "thumbs.dat") : path.join(config.runtimePath, "..", "Retail", "thumbs.dat")) // Output thumbs
	}

	/* ---------------------------------------------------------------------------------------------- */
	/*                                       Package definition                                       */
	/* ---------------------------------------------------------------------------------------------- */
	logger.info("Patching packagedefinition")

	if (!fs.existsSync(path.join(process.cwd(), "cleanPackageDefinition.txt"))) { // If there is no clean PD, copy the one from Runtime
		fs.copyFileSync(path.join(config.runtimePath, "packagedefinition.txt"), path.join(process.cwd(), "cleanPackageDefinition.txt"))
	}

	child_process.execSync(`"Third-Party\\h6xtea.exe" -d --src "${path.join(config.runtimePath, "packagedefinition.txt")}" --dst "${path.join(process.cwd(), "temp", "packagedefinitionVersionCheck.txt")}"`)
	if (!String(fs.readFileSync(path.join(process.cwd(), "temp", "packagedefinitionVersionCheck.txt"))).includes("patchlevel=10001")) { // Check if Runtime PD is unmodded and if so overwrite current "clean" version
		fs.copyFileSync(path.join(config.runtimePath, "packagedefinition.txt"), path.join(process.cwd(), "cleanPackageDefinition.txt"))
	}

	child_process.execSync(`"Third-Party\\h6xtea.exe" -d --src "${path.join(process.cwd(), "cleanPackageDefinition.txt")}" --dst "${path.join(process.cwd(), "temp", "packagedefinition.txt.decrypted")}"`) // Decrypt PD
	let packagedefinitionContent = String(fs.readFileSync(path.join(process.cwd(), "temp", "packagedefinition.txt.decrypted"))).replace(/patchlevel=[0-9]*/g, "patchlevel=10001") // Patch levels

	for (let brick of packagedefinition) { // Apply all PD changes
		switch (brick.type) {
			case "partition":
				packagedefinitionContent += "\r\n"
				packagedefinitionContent += `@partition name=${brick.name} parent=${brick.parent} type=${brick.partitionType} patchlevel=10001\r\n`
				break;
			case "entity":
				if (!packagedefinitionContent.includes(brick.path)) {
					packagedefinitionContent = packagedefinitionContent.replace(new RegExp(`@partition name=${brick.partition} parent=(.*?) type=(.*?) patchlevel=10001\r\n`), (a, parent, type) => `@partition name=${brick.partition} parent=${parent} type=${type} patchlevel=10001\r\n${brick.path}\r\n`)
				}
				break;
		}
	}

	fs.writeFileSync(path.join(process.cwd(), "temp", "packagedefinition.txt.decrypted"), packagedefinitionContent + "\r\n\r\n\r\n\r\n") // Add blank lines to ensure correct encryption (XTEA uses blocks of 8 bytes)
	child_process.execSync(`"Third-Party\\h6xtea.exe" -e --src "${path.join(process.cwd(), "temp", "packagedefinition.txt.decrypted")}" --dst "${path.join(process.cwd(), "temp", "packagedefinition.txt.decrypted.encrypted")}"`) // Encrypt PD

	fs.copyFileSync(path.join(process.cwd(), "temp", "packagedefinition.txt.decrypted.encrypted"), config.outputToSeparateDirectory ? path.join(process.cwd(), "Output", "packagedefinition.txt") : path.join(config.runtimePath, "packagedefinition.txt")) // Output PD

	try {
		await promisify(emptyFolder)("temp", true)
	} catch {}
	fs.mkdirSync("temp")

	/* ---------------------------------------------------------------------------------------------- */
	/*                                         Generate RPKGs                                         */
	/* ---------------------------------------------------------------------------------------------- */
	logger.info("Generating RPKGs")

	for (let stagingChunkFolder of fs.readdirSync(path.join(process.cwd(), "staging"))) {
		await rpkgInstance.callFunction(`-generate_rpkg_from "${path.join(process.cwd(), "staging", stagingChunkFolder)}" -output_path "${path.join(process.cwd(), "staging")}"`)
		fs.copyFileSync(path.join(process.cwd(), "staging", stagingChunkFolder + ".rpkg"), config.outputToSeparateDirectory ? path.join(process.cwd(), "Output", (rpkgTypes[stagingChunkFolder] == "base" ? stagingChunkFolder + ".rpkg" : stagingChunkFolder + "patch200.rpkg")) : path.join(config.runtimePath, (rpkgTypes[stagingChunkFolder] == "base" ? stagingChunkFolder + ".rpkg" : stagingChunkFolder + "patch200.rpkg")))
	}

	try {
		await promisify(emptyFolder)("staging", true)
	} catch {}
	try {
		await promisify(emptyFolder)("temp", true)
	} catch {}

	if (process.argv[2]) {
		logger.info("Deployed all mods successfully.")
	} else {
		// @ts-ignore
		logger.info("Done " + luxon.DateTime.now().plus({milliseconds: (luxon.DateTime.now() - startedDate)}).toRelative() + ".")
	}

	cleanExit()
}

stageAllMods()
