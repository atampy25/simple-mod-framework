import * as LosslessJSON from "lossless-json"
import * as rfc6902 from "rfc6902"
import * as rust_utils from "./smf-rust"
import * as ts from "./typescript"

import type { DeployInstruction, HMLanguageToolsLOCR, Manifest, ManifestOptionData, ModScript } from "./types"
import { ModuleKind, ScriptTarget } from "typescript"
import { compileExpression, useDotAccessOperatorAndOptionalChaining } from "filtrex"
import { config, logger, rpkgInstance } from "./core-singleton"
import { copyFromCache, copyToCache, extractOrCopyToTemp, getQuickEntityFromPatchVersion, getQuickEntityFromVersion, hexflip, normaliseToHash } from "./utils"

import { OptionType } from "./types"
import Piscina from "piscina"
import type { Transaction } from "@sentry/tracing"
import child_process from "child_process"
import { crc32 } from "./crc32"
import fs from "fs-extra"
import json5 from "json5"
import klaw from "klaw-sync"
import md5 from "md5"
import mergeWith from "lodash.mergewith"
import os from "os"
import path from "path"
import { xxhash3 } from "hash-wasm"

const deepMerge = function (x: any, y: any) {
	return mergeWith(x, y, (orig, src) => {
		if (Array.isArray(orig)) {
			return src
		}
	})
}

const execCommand = function (command: string) {
	void logger.verbose(`Executing command ${command}`)
	child_process.execSync(command, { stdio: ["pipe", "pipe", "inherit"] })
}

const callRPKGFunction = async function (command: string) {
	await logger.verbose(`Executing RPKG function ${command}`)
	return await rpkgInstance.callFunction(command)
}

const RPKGHashCache: Record<string, [string, boolean]> = {}

const getRPKGOfHash = async function (hash: string): Promise<string> {
	await logger.verbose(`Getting RPKG of hash ${hash}`)

	if (RPKGHashCache[hash]) {
		await logger.verbose(`Returning RPKG of hash ${hash} from cache`)
		return RPKGHashCache[hash][0]
	} else {
		try {
			const x = await rpkgInstance.getRPKGOfHash(hash)
			RPKGHashCache[hash] = [x, false]
			return x
		} catch {
			await logger.error(`Couldn't find ${hash} in the game files! Make sure your game is up-to-date and you've installed the framework in the right place.`)

			process.exit(1) // This is unreachable but TypeScript doesn't know that
		}
	}
}

export default async function deploy(
	sentryTransaction: Transaction,
	configureSentryScope: (transaction: unknown) => void,
	invalidatedData: {
		filePath: string
		data: { hash: string; dependencies: string[]; affected: string[] }
	}[]
) {
	if (fs.existsSync(path.join(process.cwd(), "cache", "rpkgHashCache.json"))) {
		Object.assign(RPKGHashCache, Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(path.join(process.cwd(), "cache", "rpkgHashCache.json"), "utf8"))).map((a) => [a[0], [a[1], false]])))
	}

	const allRPKGTypes: Record<string, "base" | "patch"> = {}

	const WWEVpatches: Record<
		string,
		{
			index: string
			content: string | Blob
			chunk: string
		}[]
	> = {}

	const packagedefinition: ManifestOptionData["packagedefinition"] = []
	const thumbs: string[] = []

	const localisation: {
		language: keyof ManifestOptionData["localisation"]
		locString: string
		text: string
	}[] = []

	const localisationOverrides: Record<
		string,
		{
			language: keyof ManifestOptionData["localisation"]
			locString: string
			text: string
		}[]
	> = {}

	const contractsToAddToDestinations: {
		id: string
		before?: string
		after?: string
		context?: string
	}[] = []

	const deployInstructions: DeployInstruction[] = []

	const sentryModsTransaction = sentryTransaction.startChild({
		op: "stage",
		description: "All mods"
	})
	configureSentryScope(sentryModsTransaction)

	const lastServerSideStates = {} as {
		unlockables: any
		contracts: Record<string, any>
		peacockPlugins: string[]
	}

	/* ---------------------------------------------------------------------------------------------- */
	/*                                          Analyse mods                                          */
	/* ---------------------------------------------------------------------------------------------- */
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
			const foundMod = fs
				.readdirSync(path.join(process.cwd(), "Mods"))
				.find((a) => fs.existsSync(path.join(process.cwd(), "Mods", a, "manifest.json")) && json5.parse(fs.readFileSync(path.join(process.cwd(), "Mods", a, "manifest.json"), "utf8")).id === mod)

			if (!foundMod) {
				await logger.error(`Could not resolve mod ${mod} to its folder in Mods!`)
				return
			}

			mod = foundMod
		} // Essentially, if the mod isn't an RPKG mod, it is referenced by its ID, so this finds the mod folder with the right ID

		if (!fs.existsSync(path.join(process.cwd(), "Mods", mod, "manifest.json"))) {
			const sentryModTransaction = sentryModsTransaction.startChild({
				op: "stage",
				description: mod
			})
			configureSentryScope(sentryModTransaction)

			await logger.info(`Staging RPKG mod: ${mod}`)

			for (const chunkFolder of fs.readdirSync(path.join(process.cwd(), "Mods", mod))) {
				fs.ensureDirSync(path.join(process.cwd(), "staging", chunkFolder))

				fs.emptyDirSync(path.join(process.cwd(), "temp"))

				for (const contentFile of fs.readdirSync(path.join(process.cwd(), "Mods", mod, chunkFolder))) {
					if (
						invalidatedData.some((a) => a.filePath === path.join(process.cwd(), "Mods", mod, chunkFolder, contentFile)) || // must redeploy, invalid cache
						!(await copyFromCache(mod, path.join(chunkFolder, contentFile), path.join(process.cwd(), "temp"))) // cache is not available
					) {
						await callRPKGFunction(`-extract_from_rpkg "${path.join(process.cwd(), "Mods", mod, chunkFolder, contentFile)}" -output_path "${path.join(process.cwd(), "temp")}"`)
						await copyToCache(mod, path.join(process.cwd(), "temp"), path.join(chunkFolder, contentFile))
					}
				}

				allRPKGTypes[chunkFolder] = "patch"

				const allFiles = klaw(path.join(process.cwd(), "temp"))
					.filter((a) => a.stats.isFile())
					.map((a) => a.path)

				allFiles.forEach((a) => fs.copyFileSync(a, path.join(process.cwd(), "staging", chunkFolder, path.basename(a))))

				fs.emptyDirSync(path.join(process.cwd(), "temp"))
			}

			sentryModTransaction.finish()
		} else {
			const manifest: Manifest = json5.parse(fs.readFileSync(path.join(process.cwd(), "Mods", mod, "manifest.json"), "utf8"))

			const sentryModTransaction = sentryModsTransaction.startChild({
				op: "analyse",
				description: manifest.id
			})
			configureSentryScope(sentryModTransaction)

			await logger.info(`Analysing framework mod: ${manifest.name}`)

			const sentryDiskAnalysisTransaction = sentryModTransaction.startChild({
				op: "analyse",
				description: "Disk analysis"
			})
			configureSentryScope(sentryDiskAnalysisTransaction)

			let contentFolders: string[] = []
			let blobsFolders: string[] = []

			const scripts: string[][] = []

			for (const contentFolder of manifest.contentFolders || []) {
				if (contentFolder?.length && fs.readdirSync(path.join(process.cwd(), "Mods", mod, contentFolder)).length) {
					contentFolders.push(contentFolder)
				}
			}

			for (const blobsFolder of manifest.blobsFolders || []) {
				if (blobsFolder?.length && fs.readdirSync(path.join(process.cwd(), "Mods", mod, blobsFolder)).length) {
					blobsFolders.push(blobsFolder)
				}
			}

			manifest.scripts && scripts.push(manifest.scripts)

			if (config.modOptions[manifest.id] && manifest.options && manifest.options.length) {
				await logger.verbose("Merging mod options")

				for (const option of manifest.options.filter(
					(a) =>
						(a.type === OptionType.checkbox && config.modOptions[manifest.id].includes(a.name)) ||
						(a.type === OptionType.select && config.modOptions[manifest.id].includes(`${a.group}:${a.name}`)) ||
						(a.type === OptionType.conditional &&
							compileExpression(a.condition, {
								customProp: useDotAccessOperatorAndOptionalChaining
							})({
								config
							}))
				)) {
					for (const contentFolder of option.contentFolders || []) {
						if (contentFolder?.length && fs.existsSync(path.join(process.cwd(), "Mods", mod, contentFolder)) && fs.readdirSync(path.join(process.cwd(), "Mods", mod, contentFolder)).length) {
							contentFolders.push(contentFolder)
						}
					}

					for (const blobsFolder of option.blobsFolders || []) {
						if (blobsFolder?.length && fs.existsSync(path.join(process.cwd(), "Mods", mod, blobsFolder)) && fs.readdirSync(path.join(process.cwd(), "Mods", mod, blobsFolder)).length) {
							blobsFolders.push(blobsFolder)
						}
					}

					manifest.localisation || (manifest.localisation = {} as ManifestOptionData["localisation"])
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

					manifest.peacockPlugins || (manifest.peacockPlugins = [])
					option.peacockPlugins && manifest.peacockPlugins.push(...option.peacockPlugins)

					option.scripts && scripts.push(option.scripts)
				}
			}

			contentFolders = [...new Set(contentFolders)]
			blobsFolders = [...new Set(blobsFolders)]

			const content: DeployInstruction["content"] = []
			const blobs: DeployInstruction["blobs"] = []
			const rpkgTypes: DeployInstruction["rpkgTypes"] = {}

			for (const contentFolder of contentFolders) {
				for (const chunkFolder of fs.readdirSync(path.join(process.cwd(), "Mods", mod, contentFolder))) {
					for (const contentFilePath of klaw(path.join(process.cwd(), "Mods", mod, contentFolder, chunkFolder))
						.filter((a) => a.stats.isFile())
						.map((a) => a.path)) {
						const contentType = path.basename(contentFilePath).split(".").slice(1).join(".")

						await logger.verbose(`Registering ${contentType} file ${contentFilePath}`)

						content.push({
							source: "disk",
							chunk: Number(chunkFolder.replace(/chunk/gi, "")),
							path: contentFilePath,
							type: contentType
						})
					}

					/* ------------------------------ Copy chunk meta to staging folder ----------------------------- */
					if (fs.existsSync(path.join(process.cwd(), "Mods", mod, contentFolder, chunkFolder, `${chunkFolder}.meta`))) {
						rpkgTypes[chunkFolder] = {
							type: "base",
							chunkMeta: path.join(process.cwd(), "Mods", mod, contentFolder, chunkFolder, `${chunkFolder}.meta`)
						}
					} else {
						rpkgTypes[chunkFolder] = {
							type: "patch"
						}
					}
				}
			}

			for (const blobsFolder of blobsFolders) {
				for (const blob of klaw(path.join(process.cwd(), "Mods", mod, blobsFolder))
					.filter((a) => a.stats.isFile())
					.map((a) => a.path)) {
					const blobPath = blob.replace(path.join(process.cwd(), "Mods", mod, blobsFolder), "").slice(1).split(path.sep).join("/").toLowerCase()

					let blobHash: string
					if (path.extname(blob).startsWith(".jp") || path.extname(blob) === ".png") {
						blobHash = `00${md5(`[assembly:/_pro/online/default/cloudstorage/resources/${blobPath}].pc_gfx`.toLowerCase()).slice(2, 16).toUpperCase()}`
					} else if (path.extname(blob) === ".json") {
						blobHash = `00${md5(`[assembly:/_pro/online/default/cloudstorage/resources/${blobPath}].pc_json`.toLowerCase()).slice(2, 16).toUpperCase()}`
					} else {
						blobHash = `00${md5(`[assembly:/_pro/online/default/cloudstorage/resources/${blobPath}].pc_${path.extname(blob).slice(1)}`.toLowerCase())
							.slice(2, 16)
							.toUpperCase()}`
					}

					blobs.push({
						source: "disk",
						filePath: blob,
						blobPath,
						blobHash
					})
				}
			}

			const deployInstruction: DeployInstruction = {
				id: manifest.id,
				name: manifest.name,
				cacheFolder: manifest.id,
				manifestSources: {
					localisation: manifest.localisation,
					localisationOverrides: manifest.localisationOverrides,
					localisedLines: manifest.localisedLines,
					dependencies: manifest.dependencies,
					requirements: manifest.requirements,
					supportedPlatforms: manifest.supportedPlatforms,
					packagedefinition: manifest.packagedefinition,
					thumbs: manifest.thumbs,
					peacockPlugins: (manifest.peacockPlugins || []).map((a) => path.join(process.cwd(), "Mods", mod, a)),
					scripts
				},
				content,
				blobs,
				rpkgTypes
			}

			sentryDiskAnalysisTransaction.finish()

			if (deployInstruction.manifestSources.scripts.length) {
				const sentryScriptsTransaction = sentryModTransaction.startChild({
					op: "analyse",
					description: "analysis scripts"
				})
				configureSentryScope(sentryScriptsTransaction)

				for (const files of deployInstruction.manifestSources.scripts) {
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

					fs.ensureDirSync(path.join(process.cwd(), "scriptTempFolder"))

					await modScript.analysis(
						{
							config,
							deployInstruction,
							modRoot: path.join(process.cwd(), "Mods", mod),
							tempFolder: path.join(process.cwd(), "scriptTempFolder")
						},
						{
							rpkg: {
								callRPKGFunction,
								getRPKGOfHash,
								async extractFileFromRPKG(hash: string, rpkg: string) {
									await logger.verbose(`Extracting ${hash} from ${rpkg}`)
									await rpkgInstance.callFunction(
										`-extract_from_rpkg "${path.join(config.runtimePath, `${rpkg}.rpkg`)}" -filter "${hash}" -output_path ${path.join(process.cwd(), "scriptTempFolder")}`
									)
								}
							},
							utils: {
								execCommand,
								extractOrCopyToTemp,
								getQuickEntityFromVersion,
								getQuickEntityFromPatchVersion,
								hexflip
							},
							logger: {
								verbose: (a) => logger.verbose(a, manifest.name),
								debug: (a) => logger.debug(a, manifest.name),
								info: (a) => logger.info(a, manifest.name),
								warn: (a) => logger.warn(a, manifest.name),
								error: (a, b) => logger.error(a, b, manifest.name)
							}
						}
					)

					fs.removeSync(path.join(process.cwd(), "scriptTempFolder"))

					fs.removeSync(path.join(process.cwd(), "compiled"))
				}

				sentryScriptsTransaction.finish()
			}

			deployInstructions.push(deployInstruction)

			sentryModTransaction.finish()
		}
	}

	/* ---------------------------------------------------------------------------------------------- */
	/*                                      Execute instructions                                      */
	/* ---------------------------------------------------------------------------------------------- */
	for (const instruction of deployInstructions) {
		const sentryModTransaction = sentryModsTransaction.startChild({
			op: "stage",
			description: instruction.id
		})
		configureSentryScope(sentryModTransaction)

		await logger.info(`Deploying ${instruction.id}`)

		if (instruction.manifestSources.scripts.length) {
			await logger.verbose("beforeDeploy scripts")

			const sentryScriptsTransaction = sentryModTransaction.startChild({
				op: "stage",
				description: "beforeDeploy scripts"
			})
			configureSentryScope(sentryScriptsTransaction)

			for (const files of instruction.manifestSources.scripts) {
				await logger.verbose(`Executing script: ${files[0]}`)

				ts.compile(
					files.map((a) => path.join(process.cwd(), "Mods", instruction.cacheFolder, a)),
					{
						esModuleInterop: true,
						allowJs: true,
						target: ScriptTarget.ES2019,
						module: ModuleKind.CommonJS,
						resolveJsonModule: true
					},
					path.join(process.cwd(), "Mods", instruction.cacheFolder)
				)

				// eslint-disable-next-line @typescript-eslint/no-var-requires
				const modScript = (await require(path.join(
					process.cwd(),
					"compiled",
					path.relative(path.join(process.cwd(), "Mods", instruction.cacheFolder), path.join(process.cwd(), "Mods", instruction.cacheFolder, files[0].replace(".ts", ".js")))
				))) as ModScript

				fs.ensureDirSync(path.join(process.cwd(), "scriptTempFolder"))

				await modScript.beforeDeploy(
					{
						config,
						deployInstruction: instruction,
						modRoot: path.join(process.cwd(), "Mods", instruction.cacheFolder),
						tempFolder: path.join(process.cwd(), "scriptTempFolder")
					},
					{
						rpkg: {
							callRPKGFunction,
							getRPKGOfHash,
							async extractFileFromRPKG(hash: string, rpkg: string) {
								await logger.verbose(`Extracting ${hash} from ${rpkg}`)
								await rpkgInstance.callFunction(`-extract_from_rpkg "${path.join(config.runtimePath, `${rpkg}.rpkg`)}" -filter "${hash}" -output_path ${path.join(process.cwd(), "scriptTempFolder")}`)
							}
						},
						utils: {
							execCommand,
							extractOrCopyToTemp,
							getQuickEntityFromVersion,
							getQuickEntityFromPatchVersion,
							hexflip
						},
						logger: {
							verbose: (a) => logger.verbose(a, instruction.name),
							debug: (a) => logger.debug(a, instruction.name),
							info: (a) => logger.info(a, instruction.name),
							warn: (a) => logger.warn(a, instruction.name),
							error: (a, b) => logger.error(a, b, instruction.name)
						}
					}
				)

				fs.removeSync(path.join(process.cwd(), "scriptTempFolder"))

				fs.removeSync(path.join(process.cwd(), "compiled"))
			}

			sentryScriptsTransaction.finish()
		}

		lastServerSideStates.peacockPlugins ??= []
		lastServerSideStates.peacockPlugins.push(...instruction.manifestSources.peacockPlugins)

		await logger.verbose("Content")

		const entityPatches: {
			tempHash: string
			tempRPKG: string
			tbluHash: string
			tbluRPKG: string
			chunkFolder: string
			patches: unknown[]
			mod: string
		}[] = []

		/* ---------------------------------------------------------------------------------------------- */
		/*                                             Content                                            */
		/* ---------------------------------------------------------------------------------------------- */
		const sentryContentTransaction = sentryModTransaction.startChild({
			op: "stage",
			description: "Content"
		})
		configureSentryScope(sentryContentTransaction)

		instruction.content.sort((a, b) =>
			(a.order || (a.source === "disk" ? a.chunk + a.path : a.chunk + a.identifier)).localeCompare(b.order || (b.source === "disk" ? b.chunk + b.path : b.chunk + b.identifier), "en-AU", {
				numeric: true
			})
		)

		instruction.blobs.sort((a, b) =>
			(a.order || a.blobPath).localeCompare(b.order || b.blobPath, "en-AU", {
				numeric: true
			})
		)

		let contractsCacheInvalid = false

		let contractsORESChunk
		let contractsORESContent = {} as Record<string, Record<string, unknown>>
		let contractsORESMetaContent = {
			hash_reference_data: [] as Record<string, unknown>[]
		}

		await logger.verbose("Check contracts ORES necessary")

		if (instruction.content.some((a) => a.type === "contract.json")) {
			contractsORESChunk = await getRPKGOfHash("002B07020D21D727")

			if (invalidatedData.some((a) => a.data.affected.includes("002B07020D21D727")) || !(await copyFromCache(instruction.cacheFolder, "contractsORES", path.join(process.cwd(), "temp2")))) {
				contractsCacheInvalid = true

				// we need to re-deploy the contracts ORES OR the contracts ORES couldn't be copied from cache
				// extract the contracts ORES and copy it to the temp2 directory

				fs.emptyDirSync(path.join(process.cwd(), "temp2"))

				if (!fs.existsSync(path.join(process.cwd(), "staging", "chunk0", "002B07020D21D727.ORES"))) {
					await callRPKGFunction(`-extract_from_rpkg "${path.join(config.runtimePath, `${contractsORESChunk}.rpkg`)}" -filter "002B07020D21D727" -output_path temp2`) // Extract the contracts ORES
				} else {
					fs.ensureDirSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES"))
					fs.copyFileSync(path.join(process.cwd(), "staging", "chunk0", "002B07020D21D727.ORES"), path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES")) // Use the staging one (for mod compat - one mod can extract, patch and build, then the next can patch that one instead)
					fs.copyFileSync(path.join(process.cwd(), "staging", "chunk0", "002B07020D21D727.ORES.meta"), path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.meta"))
				}

				execCommand(`"Third-Party\\OREStool.exe" "${path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES")}"`)

				await callRPKGFunction(`-hash_meta_to_json "${path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.meta")}"`)
			}

			contractsORESContent = JSON.parse(fs.readFileSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.JSON"), "utf8"))
			contractsORESMetaContent = JSON.parse(fs.readFileSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.meta.JSON"), "utf8"))
		}

		for (const content of instruction.content) {
			const contentIdentifier = content.source === "disk" ? content.path : content.identifier

			fs.ensureDirSync(path.join(process.cwd(), "staging", `chunk${content.chunk}`))

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			let entityContent: any

			const sentryContentFileTransaction = [
				"entity.json",
				"entity.patch.json",
				"unlockables.json",
				"repository.json",
				"contract.json",
				"JSON.patch.json",
				"material.json",
				"texture.tga",
				"sfx.wem",
				"delta",
				"locr.json"
			].includes(content.type)
				? sentryContentTransaction.startChild({
						op: "stageContentFile",
						description: `Stage ${content.type}`
				  })
				: {
						startChild() {
							return {
								startChild() {
									return {
										startChild() {
											return {
												startChild() {
													return {
														startChild() {
															return {
																startChild() {
																	return {
																		startChild() {
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

			content.source === "disk" && logger.verbose(`Staging ${content.type} file ${content.path}`)
			content.source === "virtual" && logger.verbose(`Staging virtual ${content.type} file ${content.identifier}`)

			switch (content.type) {
				case "entity.json": {
					await logger.debug(`Converting entity ${contentIdentifier}`)

					entityContent = LosslessJSON.parse(String(content.source === "disk" ? fs.readFileSync(content.path) : await content.content.text()))

					try {
						if (!getQuickEntityFromVersion(entityContent.quickEntityVersion.value)) {
							await logger.error(`Could not find matching QuickEntity version for ${Number(entityContent.quickEntityVersion.value)}!`)
						}
					} catch {
						await logger.error("Improper QuickEntity JSON; couldn't find the version!")
					}

					RPKGHashCache[entityContent.tempHash] = [`chunk${content.chunk}`, true]
					RPKGHashCache[entityContent.tbluHash] = [`chunk${content.chunk}`, true]

					if (+entityContent.quickEntityVersion.value < 3) {
						if (content.source === "disk") {
							await logger.info(`Optimising entity.json file ${contentIdentifier}`)

							fs.ensureDirSync(path.join(process.cwd(), "qn-update"))

							const comments = Object.entries(entityContent.entities).filter((a) => (a[1] as { type: string | undefined }).type === "comment")

							await getQuickEntityFromVersion(entityContent.quickEntityVersion.value).generate(
								"HM3",
								content.path,
								path.join(process.cwd(), "qn-update", "temp.json"),
								path.join(process.cwd(), "qn-update", "temp.meta.json"),
								path.join(process.cwd(), "qn-update", "tblu.json"),
								path.join(process.cwd(), "qn-update", "tblu.meta.json")
							)

							await getQuickEntityFromVersion("3.1").convert(
								"HM3",
								path.join(process.cwd(), "qn-update", "temp.json"),
								path.join(process.cwd(), "qn-update", "temp.meta.json"),
								path.join(process.cwd(), "qn-update", "tblu.json"),
								path.join(process.cwd(), "qn-update", "tblu.meta.json"),
								content.path
							)

							fs.writeFileSync(
								content.path,
								LosslessJSON.stringify(
									Object.assign(LosslessJSON.parse(fs.readFileSync(content.path, "utf8")), {
										comments: comments.map((a: [string, { parent: string; name: string; text: string }]) => {
											return {
												parent: a[1].parent,
												name: a[1].name,
												text: a[1].text
											}
										})
									})
								)
							)

							fs.removeSync(path.join(process.cwd(), "qn-update"))

							entityContent = LosslessJSON.parse(fs.readFileSync(content.path, "utf8"))

							if (!config.developerMode) {
								await logger.warn(
									`Optimised an entity.json file from ${instruction.id}. This should improve the speed of deploys from now on. Consider contacting the mod developer to run this process on their end rather than the user's computer.`
								)
							} else {
								await logger.warn(`Automatically upgraded an entity.json file from ${instruction.id} to the latest QuickEntity version.`)
							}
						} else {
							await logger.warn(`Mod ${instruction.id} emits a virtual QuickEntity JSON with a version less than 3.1 using scripting. This should not be the case.`)
						}
					} else if (+entityContent.quickEntityVersion.value < 3.1) {
						if (content.source === "disk") {
							await logger.info(`Optimising entity.json file ${contentIdentifier}`)

							fs.ensureDirSync(path.join(process.cwd(), "qn-update"))

							const comments = entityContent.comments

							await getQuickEntityFromVersion(entityContent.quickEntityVersion.value).generate(
								"HM3",
								content.path,
								path.join(process.cwd(), "qn-update", "temp.json"),
								path.join(process.cwd(), "qn-update", "temp.meta.json"),
								path.join(process.cwd(), "qn-update", "tblu.json"),
								path.join(process.cwd(), "qn-update", "tblu.meta.json")
							)

							await getQuickEntityFromVersion("3.1").convert(
								"HM3",
								path.join(process.cwd(), "qn-update", "temp.json"),
								path.join(process.cwd(), "qn-update", "temp.meta.json"),
								path.join(process.cwd(), "qn-update", "tblu.json"),
								path.join(process.cwd(), "qn-update", "tblu.meta.json"),
								content.path
							)

							fs.writeFileSync(
								content.path,
								LosslessJSON.stringify(
									Object.assign(LosslessJSON.parse(fs.readFileSync(content.path, "utf8")), {
										comments
									})
								)
							)

							fs.removeSync(path.join(process.cwd(), "qn-update"))

							entityContent = LosslessJSON.parse(fs.readFileSync(content.path, "utf8"))

							if (!config.developerMode) {
								await logger.warn(
									`Optimised an entity.json file from ${instruction.id}. This should improve the speed of deploys from now on. Consider contacting the mod developer to run this process on their end rather than the user's computer.`
								)
							} else {
								await logger.warn(`Automatically upgraded an entity.json file from ${instruction.id} to the latest QuickEntity version.`)
							}
						} else {
							await logger.warn(`Mod ${instruction.id} emits a virtual QuickEntity JSON with a version less than 3.1 using scripting. This should not be the case.`)
						}
					}

					await logger.verbose("Cache check")
					if (
						invalidatedData.some((a) => a.filePath === contentIdentifier) || // must redeploy, invalid cache
						!(await copyFromCache(
							instruction.cacheFolder,
							path.join(`chunk${content.chunk}`, `${path.basename(contentIdentifier).slice(0, 15)}-${await xxhash3(contentIdentifier)}`),
							path.join(process.cwd(), "staging", `chunk${content.chunk}`)
						)) // cache is not available
					) {
						let contentPath

						if (content.source === "disk") {
							contentPath = content.path
						} else {
							fs.ensureDirSync(path.join(process.cwd(), "virtual"))
							fs.writeFileSync(path.join(process.cwd(), "virtual", "entity.json"), Buffer.from(await content.content.arrayBuffer()))
							contentPath = path.join(process.cwd(), "virtual", "entity.json")
						}

						try {
							await logger.verbose("QN generate")

							await getQuickEntityFromVersion(entityContent.quickEntityVersion.value).generate(
								"HM3",
								contentPath,
								path.join(process.cwd(), "temp", "temp.TEMP.json"),
								path.join(process.cwd(), "temp", `${entityContent.tempHash}.TEMP.meta.json`),
								path.join(process.cwd(), "temp", "temp.TBLU.json"),
								path.join(process.cwd(), "temp", `${entityContent.tbluHash}.TBLU.meta.json`)
							)
						} catch {
							await logger.error(`Could not generate entity ${contentIdentifier}!`)
						}

						fs.removeSync(path.join(process.cwd(), "virtual"))

						// Generate the RT source from the QN json
						execCommand(
							`"Third-Party\\ResourceTool.exe" HM3 generate TEMP "${path.join(process.cwd(), "temp", "temp.TEMP.json")}" "${path.join(
								process.cwd(),
								"temp",
								`${entityContent.tempHash}.TEMP`
							)}" --simple`
						)
						execCommand(
							`"Third-Party\\ResourceTool.exe" HM3 generate TBLU "${path.join(process.cwd(), "temp", "temp.TBLU.json")}" "${path.join(
								process.cwd(),
								"temp",
								`${entityContent.tbluHash}.TBLU`
							)}" --simple`
						)

						await callRPKGFunction(`-json_to_hash_meta "${path.join(process.cwd(), "temp", `${entityContent.tempHash}.TEMP.meta.json`)}"`)
						await callRPKGFunction(`-json_to_hash_meta "${path.join(process.cwd(), "temp", `${entityContent.tbluHash}.TBLU.meta.json`)}"`)
						// Generate the binary files from the RT json

						fs.copyFileSync(path.join(process.cwd(), "temp", `${entityContent.tempHash}.TEMP`), path.join(process.cwd(), "staging", `chunk${content.chunk}`, `${entityContent.tempHash}.TEMP`))
						fs.copyFileSync(
							path.join(process.cwd(), "temp", `${entityContent.tempHash}.TEMP.meta`),
							path.join(process.cwd(), "staging", `chunk${content.chunk}`, `${entityContent.tempHash}.TEMP.meta`)
						)
						fs.copyFileSync(path.join(process.cwd(), "temp", `${entityContent.tbluHash}.TBLU`), path.join(process.cwd(), "staging", `chunk${content.chunk}`, `${entityContent.tbluHash}.TBLU`))
						fs.copyFileSync(
							path.join(process.cwd(), "temp", `${entityContent.tbluHash}.TBLU.meta`),
							path.join(process.cwd(), "staging", `chunk${content.chunk}`, `${entityContent.tbluHash}.TBLU.meta`)
						)
						// Copy the binary files to the staging directory

						await copyToCache(
							instruction.cacheFolder,
							path.join(process.cwd(), "temp"),
							path.join(`chunk${content.chunk}`, `${path.basename(contentIdentifier).slice(0, 15)}-${await xxhash3(contentIdentifier)}`)
						)
						// Copy the binary files to the cache
					}

					break
				}
				case "entity.patch.json": {
					await logger.debug(`Preparing to apply patch ${contentIdentifier}`)

					entityContent = content.source === "disk" ? LosslessJSON.parse(fs.readFileSync(content.path, "utf8")) : LosslessJSON.parse(await content.content.text())
					entityContent.path = contentIdentifier

					if (+entityContent.patchVersion.value < 6) {
						if (content.source === "disk") {
							await logger.info(`Optimising entity.patch.json file ${contentIdentifier}`)

							const tempRPKG = await rpkgInstance.getRPKGOfHash(entityContent.tempHash)
							const tbluRPKG = await rpkgInstance.getRPKGOfHash(entityContent.tbluHash)

							fs.ensureDirSync("qn-update")

							await callRPKGFunction(`-extract_from_rpkg "${path.join(config.runtimePath, `${tempRPKG}.rpkg`)}" -filter "${entityContent.tempHash}" -output_path "qn-update"`)
							await callRPKGFunction(`-extract_from_rpkg "${path.join(config.runtimePath, `${tbluRPKG}.rpkg`)}" -filter "${entityContent.tbluHash}" -output_path "qn-update"`)

							await Promise.all([
								execCommand(
									`"${path.join(process.cwd(), "Third-Party", "ResourceTool.exe")}" HM3 convert TEMP "${path.join(
										process.cwd(),
										"qn-update",
										tempRPKG,
										"TEMP",
										`${entityContent.tempHash}.TEMP`
									)}" "${path.join(process.cwd(), "qn-update", tempRPKG, "TEMP", `${entityContent.tempHash}.TEMP`)}.json" --simple`
								),
								execCommand(
									`"${path.join(process.cwd(), "Third-Party", "ResourceTool.exe")}" HM3 convert TBLU "${path.join(
										process.cwd(),
										"qn-update",
										tbluRPKG,
										"TBLU",
										`${entityContent.tbluHash}.TBLU`
									)}" "${path.join(process.cwd(), "qn-update", tbluRPKG, "TBLU", `${entityContent.tbluHash}.TBLU`)}.json" --simple`
								)
							])

							await callRPKGFunction(`-hash_meta_to_json "${path.join(process.cwd(), "qn-update", tempRPKG, "TEMP", `${entityContent.tempHash}.TEMP.meta`)}"`)
							await callRPKGFunction(`-hash_meta_to_json "${path.join(process.cwd(), "qn-update", tbluRPKG, "TBLU", `${entityContent.tbluHash}.TBLU.meta`)}"`)

							if (+entityContent.patchVersion.value < 3) {
								await getQuickEntityFromPatchVersion(entityContent.patchVersion.value).convert(
									"HM3",
									"ids",
									path.join(process.cwd(), "qn-update", tempRPKG, "TEMP", `${entityContent.tempHash}.TEMP.json`),
									path.join(process.cwd(), "qn-update", tempRPKG, "TEMP", `${entityContent.tempHash}.TEMP.meta.JSON`),
									path.join(process.cwd(), "qn-update", tbluRPKG, "TBLU", `${entityContent.tbluHash}.TBLU.json`),
									path.join(process.cwd(), "qn-update", tbluRPKG, "TBLU", `${entityContent.tbluHash}.TBLU.meta.JSON`),
									// @ts-expect-error Two different versions of the same function; TypeScript doesn't have a way of overloading a "type-only" function
									path.join(process.cwd(), "qn-update", "QuickEntityJSON.json")
								) // Generate the QN json from the RT files
							} else {
								await getQuickEntityFromPatchVersion(entityContent.patchVersion.value).convert(
									"HM3",
									path.join(process.cwd(), "qn-update", tempRPKG, "TEMP", `${entityContent.tempHash}.TEMP.json`),
									path.join(process.cwd(), "qn-update", tempRPKG, "TEMP", `${entityContent.tempHash}.TEMP.meta.JSON`),
									path.join(process.cwd(), "qn-update", tbluRPKG, "TBLU", `${entityContent.tbluHash}.TBLU.json`),
									path.join(process.cwd(), "qn-update", tbluRPKG, "TBLU", `${entityContent.tbluHash}.TBLU.meta.JSON`),
									path.join(process.cwd(), "qn-update", "QuickEntityJSON.json")
								) // Generate the QN json from the RT files
							}

							fs.writeFileSync(path.join(process.cwd(), "qn-update", "patch.json"), LosslessJSON.stringify(entityContent))

							await getQuickEntityFromPatchVersion(entityContent.patchVersion.value).applyPatchJSON(
								path.join(process.cwd(), "qn-update", "QuickEntityJSON.json"),
								path.join(process.cwd(), "qn-update", "patch.json"),
								path.join(process.cwd(), "qn-update", "PatchedQuickEntityJSON.json")
							) // Patch the QN json

							await getQuickEntityFromPatchVersion(entityContent.patchVersion.value).generate(
								"HM3",
								path.join(process.cwd(), "qn-update", "QuickEntityJSON.json"),
								path.join(process.cwd(), "qn-update", "temp.json"),
								path.join(process.cwd(), "qn-update", "temp.meta.json"),
								path.join(process.cwd(), "qn-update", "tblu.json"),
								path.join(process.cwd(), "qn-update", "tblu.meta.json")
							)

							await getQuickEntityFromVersion("3.1").convert(
								"HM3",
								path.join(process.cwd(), "qn-update", "temp.json"),
								path.join(process.cwd(), "qn-update", "temp.meta.json"),
								path.join(process.cwd(), "qn-update", "tblu.json"),
								path.join(process.cwd(), "qn-update", "tblu.meta.json"),
								path.join(process.cwd(), "qn-update", "QuickEntityJSON-qn31.json")
							)

							await getQuickEntityFromPatchVersion(entityContent.patchVersion.value).generate(
								"HM3",
								path.join(process.cwd(), "qn-update", "PatchedQuickEntityJSON.json"),
								path.join(process.cwd(), "qn-update", "temp.json"),
								path.join(process.cwd(), "qn-update", "temp.meta.json"),
								path.join(process.cwd(), "qn-update", "tblu.json"),
								path.join(process.cwd(), "qn-update", "tblu.meta.json")
							)

							await getQuickEntityFromVersion("3.1").convert(
								"HM3",
								path.join(process.cwd(), "qn-update", "temp.json"),
								path.join(process.cwd(), "qn-update", "temp.meta.json"),
								path.join(process.cwd(), "qn-update", "tblu.json"),
								path.join(process.cwd(), "qn-update", "tblu.meta.json"),
								path.join(process.cwd(), "qn-update", "PatchedQuickEntityJSON-qn31.json")
							)

							// @ts-expect-error The method isn't defined on the interface but is defined in the actual shim
							await getQuickEntityFromVersion("3.1").createPatchJSON(
								path.join(process.cwd(), "qn-update", "QuickEntityJSON-qn31.json"),
								path.join(process.cwd(), "qn-update", "PatchedQuickEntityJSON-qn31.json"),
								content.path
							)

							fs.removeSync(path.join(process.cwd(), "qn-update"))

							entityContent = LosslessJSON.parse(fs.readFileSync(content.path, "utf8"))
							entityContent.path = contentIdentifier

							if (!config.developerMode) {
								await logger.warn(
									`Optimised an entity.patch.json file from ${instruction.id}. This should improve the speed of deploys from now on. Consider contacting the mod developer to run this process on their end rather than the user's computer.`
								)
							} else {
								await logger.warn(`Automatically upgraded an entity.patch.json file from ${instruction.id} to the latest QuickEntity version.`)
							}
						} else {
							await logger.warn(`Mod ${instruction.id} emits a virtual QuickEntity patch JSON with a patch version less than 6 using scripting. This should not be the case.`)
						}
					}

					if (entityPatches.some((a) => a.tempHash === entityContent.tempHash)) {
						entityPatches.find((a) => a.tempHash === entityContent.tempHash)!.patches.push(entityContent)
					} else {
						entityPatches.push({
							tempHash: entityContent.tempHash,
							tempRPKG: await getRPKGOfHash(entityContent.tempHash),
							tbluHash: entityContent.tbluHash,
							tbluRPKG: await getRPKGOfHash(entityContent.tbluHash),
							chunkFolder: `chunk${content.chunk}`,
							patches: [entityContent],
							mod: instruction.cacheFolder
						})
					}
					break
				}
				case "unlockables.json": {
					await logger.debug(`Applying unlockable patch ${contentIdentifier}`)

					entityContent = content.source === "disk" ? JSON.parse(fs.readFileSync(content.path, "utf8")) : JSON.parse(await content.content.text())

					const oresChunk = await getRPKGOfHash("0057C2C3941115CA")

					if (
						invalidatedData.some((a) => a.filePath === contentIdentifier) || // must redeploy, invalid cache
						!(await copyFromCache(
							instruction.cacheFolder,
							path.join(`chunk${content.chunk}`, `${path.basename(contentIdentifier).slice(0, 15)}-${await xxhash3(contentIdentifier)}`),
							path.join(process.cwd(), "temp", oresChunk)
						)) // cache is not available
					) {
						await extractOrCopyToTemp(oresChunk, "0057C2C3941115CA", "ORES") // Extract the ORES to temp

						execCommand(`"Third-Party\\OREStool.exe" "${path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES")}"`)
						const oresContent = JSON.parse(fs.readFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES.JSON"), "utf8"))

						await logger.verbose("Deep merge")
						const oresToPatch = Object.fromEntries(oresContent.map((a: { Id: string }) => [a.Id, a]))
						deepMerge(oresToPatch, entityContent)
						const oresToWrite = Object.entries(oresToPatch).map((a) => ({ ...a[1], Id: a[1].Id || a[0] }))

						fs.writeFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES.JSON"), JSON.stringify(oresToWrite))
						fs.rmSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES"))
						execCommand(`"Third-Party\\OREStool.exe" "${path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES.json")}"`)

						await copyToCache(
							instruction.cacheFolder,
							path.join(process.cwd(), "temp", oresChunk),
							path.join(`chunk${content.chunk}`, `${path.basename(contentIdentifier).slice(0, 15)}-${await xxhash3(contentIdentifier)}`)
						)
					}

					execCommand(`"Third-Party\\OREStool.exe" "${path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES")}"`)
					lastServerSideStates["unlockables"] = JSON.parse(fs.readFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES.JSON"), "utf8"))

					fs.copyFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES"), path.join(process.cwd(), "staging", "chunk0", "0057C2C3941115CA.ORES"))
					fs.copyFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES.meta"), path.join(process.cwd(), "staging", "chunk0", "0057C2C3941115CA.ORES.meta"))
					break
				}
				case "repository.json": {
					await logger.debug(`Applying repository patch ${contentIdentifier}`)

					entityContent = content.source === "disk" ? JSON.parse(fs.readFileSync(content.path, "utf8")) : JSON.parse(await content.content.text())

					const repoRPKG = await getRPKGOfHash("00204D1AFD76AB13")

					if (
						invalidatedData.some((a) => a.filePath === contentIdentifier) || // must redeploy, invalid cache
						!(await copyFromCache(
							instruction.cacheFolder,
							path.join(`chunk${content.chunk}`, `${path.basename(contentIdentifier).slice(0, 15)}-${await xxhash3(contentIdentifier)}`),
							path.join(process.cwd(), "temp", repoRPKG)
						)) // cache is not available
					) {
						await extractOrCopyToTemp(repoRPKG, "00204D1AFD76AB13", "REPO") // Extract the REPO to temp

						const repoContent = JSON.parse(fs.readFileSync(path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO"), "utf8"))

						const repoToPatch = Object.fromEntries(repoContent.map((a: { [x: string]: unknown }) => [a["ID_"], a]))
						deepMerge(repoToPatch, entityContent)
						const repoToWrite = Object.entries(repoToPatch).map((a) => ({ ...a[1], ID_: a[1].ID_ || a[0] }))

						const editedItems = new Set(Object.keys(entityContent))

						await callRPKGFunction(`-hash_meta_to_json "${path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO.meta")}"`)
						const metaContent = JSON.parse(fs.readFileSync(path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO.meta.JSON"), "utf8"))
						for (const repoItem of repoToWrite) {
							if (editedItems.has(repoItem.ID_)) {
								if (repoItem.Runtime) {
									if (!metaContent["hash_reference_data"].find((a: { hash: string }) => a.hash === parseInt(repoItem.Runtime).toString(16).toUpperCase())) {
										metaContent["hash_reference_data"].push({
											hash: parseInt(repoItem.Runtime).toString(16).toUpperCase(),
											flag: "9F"
										}) // Add Runtime of any items to REPO depends if not already there
									}
								}

								if (repoItem.Image) {
									if (
										!metaContent["hash_reference_data"].find(
											(a: { hash: string }) => a.hash === `00${md5(`[assembly:/_pro/online/default/cloudstorage/resources/${repoItem.Image}].pc_gfx`.toLowerCase()).slice(2, 16).toUpperCase()}`
										)
									) {
										metaContent["hash_reference_data"].push({
											hash: `00${md5(`[assembly:/_pro/online/default/cloudstorage/resources/${repoItem.Image}].pc_gfx`.toLowerCase()).slice(2, 16).toUpperCase()}`,
											flag: "9F"
										}) // Add Image of any items to REPO depends if not already there
									}
								}
							}
						}
						fs.writeFileSync(path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO.meta.JSON"), JSON.stringify(metaContent))
						fs.rmSync(path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO.meta"))
						await callRPKGFunction(`-json_to_hash_meta "${path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO.meta.JSON")}"`) // Add all runtimes to REPO depends

						fs.writeFileSync(path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO"), JSON.stringify(repoToWrite))

						await copyToCache(
							instruction.cacheFolder,
							path.join(process.cwd(), "temp", repoRPKG),
							path.join(`chunk${content.chunk}`, `${path.basename(contentIdentifier).slice(0, 15)}-${await xxhash3(contentIdentifier)}`)
						)
					}

					fs.copyFileSync(path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO"), path.join(process.cwd(), "staging", "chunk0", "00204D1AFD76AB13.REPO"))
					fs.copyFileSync(path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO.meta"), path.join(process.cwd(), "staging", "chunk0", "00204D1AFD76AB13.REPO.meta"))
					break
				}
				case "contract.json": {
					await logger.debug(`Adding contract ${contentIdentifier}`)

					entityContent = content.source === "disk" ? LosslessJSON.parse(fs.readFileSync(content.path, "utf8")) : LosslessJSON.parse(await content.content.text())

					if (entityContent.SMF) {
						if (entityContent.SMF.destinations?.addToDestinations) {
							contractsToAddToDestinations.push({
								id: entityContent.Metadata.Id,
								before: entityContent.SMF.destinations.placeBefore,
								after: entityContent.SMF.destinations.placeAfter,
								context: entityContent.SMF.destinations.narrativeContext
							})
						}
					}

					lastServerSideStates["contracts"] ??= {}
					lastServerSideStates["contracts"][entityContent.Metadata.Id] = entityContent

					let contractHash
					if (!Object.values(contractsORESContent).includes(entityContent.Metadata.Id)) {
						contractHash = `00${md5(`smfContract${entityContent.Metadata.Id}`.toLowerCase()).slice(2, 16).toUpperCase()}`

						contractsORESContent[contractHash] = entityContent.Metadata.Id // Add the contract to the ORES; this will be a no-op if the cache is used later

						contractsORESMetaContent["hash_reference_data"].push({
							hash: contractHash,
							flag: "9F"
						})
					} else {
						contractHash = Object.entries(contractsORESContent).find((a) => a[1] === entityContent.Metadata.Id)![0]
					}

					fs.writeFileSync(path.join(process.cwd(), "staging", "chunk0", `${contractHash}.JSON`), LosslessJSON.stringify(entityContent)) // Write the actual contract to the staging directory
					break
				}
				case "JSON.patch.json": {
					await logger.debug(`Applying JSON patch ${contentIdentifier}`)

					entityContent = content.source === "disk" ? JSON.parse(fs.readFileSync(content.path, "utf8")) : JSON.parse(await content.content.text())

					if (entityContent.file === "004F4B738474CEAD" && (entityContent.patch as any[]).every((a) => a.op === "add" && a.path === "/Root/Children/-")) {
						if (content.source === "disk") {
							const contractsToAdd = (entityContent.patch as any[]).map((a) => a.value)

							const allContracts = Object.fromEntries(
								instruction.content
									.map((a) => (a.source === "disk" && a.type === "contract.json" ? a.path : false))
									.filter((a) => a)
									.map((a) => [fs.readJSONSync(a).Metadata.Id, [a, fs.readJSONSync(a)]])
							)

							if (contractsToAdd.every((a) => allContracts[a.Id])) {
								for (const contract of contractsToAdd) {
									fs.writeJSONSync(
										allContracts[contract.Id][0],
										deepMerge(allContracts[contract.Id][1], {
											SMF: {
												destinations: {
													addToDestinations: true,
													peacockIntegration: true,
													narrativeContext: contract.NarrativeContext
												}
											}
										})
									)
								}

								fs.removeSync(content.path)

								if (!config.developerMode) {
									await logger.warn(`Reconfigured contracts from ${instruction.id}.`)
								} else {
									await logger.warn(`Updated a destination enabling JSON from ${instruction.id} to use the contract SMF key.`)
								}

								break
							}
						} else {
							await logger.warn(`Mod ${instruction.id} emits a destination-enabling JSON.patch.json using scripting. This should not be the case.`)
						}
					}

					const rpkgOfFile = await getRPKGOfHash(entityContent.file)

					const fileType = entityContent.type || "JSON"

					if (
						invalidatedData.some((a) => a.filePath === contentIdentifier) || // must redeploy, invalid cache
						!(await copyFromCache(
							instruction.cacheFolder,
							path.join(`chunk${content.chunk}`, `${path.basename(contentIdentifier).slice(0, 15)}-${await xxhash3(contentIdentifier)}`),
							path.join(process.cwd(), "temp", rpkgOfFile)
						)) // cache is not available
					) {
						await extractOrCopyToTemp(rpkgOfFile, entityContent.file, fileType, `chunk${content.chunk}`) // Extract the JSON to temp

						if (entityContent.type === "ORES") {
							execCommand(`"Third-Party\\OREStool.exe" "${path.join(process.cwd(), "temp", rpkgOfFile, fileType, `${entityContent.file}.${fileType}`)}"`)
							fs.rmSync(path.join(process.cwd(), "temp", rpkgOfFile, fileType, `${entityContent.file}.${fileType}`))
							fs.renameSync(
								path.join(process.cwd(), "temp", rpkgOfFile, fileType, `${entityContent.file}.${fileType}.json`),
								path.join(process.cwd(), "temp", rpkgOfFile, fileType, `${entityContent.file}.${fileType}`)
							)
						}

						let fileContent = JSON.parse(fs.readFileSync(path.join(process.cwd(), "temp", rpkgOfFile, fileType, `${entityContent.file}.${fileType}`), "utf8"))

						if (entityContent.type === "ORES" && Array.isArray(fileContent)) {
							fileContent = Object.fromEntries(fileContent.map((a) => [a.Id, a])) // Change unlockables ORES to be an object
						} else if (entityContent.type === "REPO") {
							fileContent = Object.fromEntries(fileContent.map((a: { [x: string]: unknown }) => [a["ID_"], a])) // Change REPO to be an object
						}

						rfc6902.applyPatch(fileContent, entityContent.patch) // Apply the JSON patch

						if ((entityContent.type === "ORES" && Object.prototype.toString.call(fileContent) === "[object Object]") || entityContent.type === "REPO") {
							fileContent = Object.values(fileContent) // Change back to an array
						}

						if (entityContent.type === "ORES") {
							fs.renameSync(
								path.join(process.cwd(), "temp", rpkgOfFile, fileType, `${entityContent.file}.${fileType}`),
								path.join(process.cwd(), "temp", rpkgOfFile, fileType, `${entityContent.file}.${fileType}.json`)
							)
							fs.writeFileSync(path.join(process.cwd(), "temp", rpkgOfFile, fileType, `${entityContent.file}.${fileType}.json`), JSON.stringify(fileContent))
							execCommand(`"Third-Party\\OREStool.exe" "${path.join(process.cwd(), "temp", rpkgOfFile, fileType, `${entityContent.file}.${fileType}.json`)}"`)
						} else {
							fs.writeFileSync(path.join(process.cwd(), "temp", rpkgOfFile, fileType, `${entityContent.file}.${fileType}`), JSON.stringify(fileContent))
						}

						await copyToCache(
							instruction.cacheFolder,
							path.join(process.cwd(), "temp", rpkgOfFile),
							path.join(`chunk${content.chunk}`, `${path.basename(contentIdentifier).slice(0, 15)}-${await xxhash3(contentIdentifier)}`)
						)
					}

					if (contractsORESContent[entityContent.file]) {
						const fileContent = JSON.parse(fs.readFileSync(path.join(process.cwd(), "temp", rpkgOfFile, fileType, `${entityContent.file}.${fileType}`), "utf8"))
						lastServerSideStates["contracts"][fileContent.Metadata.Id] = fileContent
					} else if (entityContent.type === "ORES" && entityContent.file === "0057C2C3941115CA") {
						execCommand(`"Third-Party\\OREStool.exe" "${path.join(process.cwd(), "temp", rpkgOfFile, fileType, `${entityContent.file}.${fileType}`)}"`)
						const fileContent = JSON.parse(fs.readFileSync(path.join(process.cwd(), "temp", rpkgOfFile, fileType, `${entityContent.file}.${fileType}.JSON`), "utf8"))
						lastServerSideStates["unlockables"] = fileContent
					}

					fs.copyFileSync(
						path.join(process.cwd(), "temp", rpkgOfFile, fileType, `${entityContent.file}.${fileType}`),
						path.join(process.cwd(), "staging", `chunk${content.chunk}`, `${entityContent.file}.${fileType}`)
					)
					fs.copyFileSync(
						path.join(process.cwd(), "temp", rpkgOfFile, fileType, `${entityContent.file}.${fileType}.meta`),
						path.join(process.cwd(), "staging", `chunk${content.chunk}`, `${entityContent.file}.${fileType}.meta`)
					)
					break
				}
				case "material.json": {
					await logger.debug(`Converting material ${contentIdentifier}`)

					let contentFilePath
					if (content.source === "disk") {
						contentFilePath = content.path
					} else {
						fs.ensureDirSync(path.join(process.cwd(), "virtual"))
						fs.writeFileSync(path.join(process.cwd(), "virtual", "material.json"), Buffer.from(await content.content.arrayBuffer()))
						contentFilePath = path.join(process.cwd(), "virtual", "material.json")
					}

					await callRPKGFunction(`-json_to_material "${contentFilePath}" -output_path "${path.join(process.cwd(), "staging", `chunk${content.chunk}`)}"`)

					fs.removeSync(path.join(process.cwd(), "virtual"))
					break
				}
				case "texture.tga": {
					await logger.debug(`Converting texture ${contentIdentifier}`)

					if (
						invalidatedData.some((a) => a.filePath === contentIdentifier) || // must redeploy, invalid cache
						!(await copyFromCache(
							instruction.cacheFolder,
							path.join(`chunk${content.chunk}`, `${path.basename(contentIdentifier).slice(0, 15)}-${await xxhash3(contentIdentifier)}`),
							path.join(process.cwd(), "temp", `chunk${content.chunk}`)
						)) // cache is not available
					) {
						fs.ensureDirSync(path.join(process.cwd(), "temp", `chunk${content.chunk}`))

						if ((content.source === "disk" && path.basename(content.path).split(".")[0].split("~").length > 1) || (content.source === "virtual" && content.extraInformation.texdHash)) {
							// TEXT and TEXD

							let contentFilePath
							if (content.source === "disk") {
								contentFilePath = content.path
							} else {
								fs.ensureDirSync(path.join(process.cwd(), "virtual"))
								fs.writeFileSync(path.join(process.cwd(), "virtual", "texture.tga"), Buffer.from(await content.content.arrayBuffer()))
								fs.writeFileSync(path.join(process.cwd(), "virtual", "texture.tga.meta"), Buffer.from(await content.extraInformation.textureMeta!.arrayBuffer()))
								contentFilePath = path.join(process.cwd(), "virtual", "texture.tga")
							}

							execCommand(
								`"Third-Party\\HMTextureTools" rebuild H3 "${contentFilePath}" --metapath "${`${contentFilePath}.meta`}" "${path.join(
									process.cwd(),
									"temp",
									`chunk${content.chunk}`,
									`${content.source === "disk" ? path.basename(content.path).split(".")[0].split("~")[0] : content.extraInformation.textHash}.TEXT`
								)}" --rebuildboth --texdoutput "${path.join(
									process.cwd(),
									"temp",
									`chunk${content.chunk}`,
									`${content.source === "disk" ? path.basename(content.path).split(".")[0].split("~")[1] : content.extraInformation.texdHash}.TEXD`
								)}"`
							) // Rebuild texture to TEXT/TEXD

							fs.writeFileSync(
								path.join(
									process.cwd(),
									"temp",
									`chunk${content.chunk}`,
									`${content.source === "disk" ? path.basename(content.path).split(".")[0].split("~")[0] : content.extraInformation.textHash}.TEXT.meta.JSON`
								),
								JSON.stringify({
									hash_value: content.source === "disk" ? path.basename(content.path).split(".")[0].split("~")[0] : content.extraInformation.textHash,
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
											hash: content.source === "disk" ? path.basename(content.path).split(".")[0].split("~")[1] : content.extraInformation.texdHash,
											flag: "9F"
										}
									]
								})
							)

							fs.writeFileSync(
								path.join(
									process.cwd(),
									"temp",
									`chunk${content.chunk}`,
									`${content.source === "disk" ? path.basename(content.path).split(".")[0].split("~")[1] : content.extraInformation.texdHash}.TEXD.meta.JSON`
								),
								JSON.stringify({
									hash_value: content.source === "disk" ? path.basename(content.path).split(".")[0].split("~")[1] : content.extraInformation.texdHash,
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

							await callRPKGFunction(
								`-json_to_hash_meta "${path.join(
									process.cwd(),
									"temp",
									`chunk${content.chunk}`,
									`${content.source === "disk" ? path.basename(content.path).split(".")[0].split("~")[0] : content.extraInformation.textHash}.TEXT.meta.JSON`
								)}"`
							) // Rebuild the TEXT meta

							await callRPKGFunction(
								`-json_to_hash_meta "${path.join(
									process.cwd(),
									"temp",
									`chunk${content.chunk}`,
									`${content.source === "disk" ? path.basename(content.path).split(".")[0].split("~")[1] : content.extraInformation.texdHash}.TEXD.meta.JSON`
								)}"`
							) // Rebuild the TEXD meta

							fs.removeSync(path.join(process.cwd(), "virtual"))
						} else {
							// TEXT only

							let contentFilePath
							if (content.source === "disk") {
								contentFilePath = content.path
							} else {
								fs.ensureDirSync(path.join(process.cwd(), "virtual"))
								fs.writeFileSync(path.join(process.cwd(), "virtual", "texture.tga"), Buffer.from(await content.content.arrayBuffer()))
								fs.writeFileSync(path.join(process.cwd(), "virtual", "texture.tga.meta"), Buffer.from(await content.extraInformation.textureMeta!.arrayBuffer()))
								contentFilePath = path.join(process.cwd(), "virtual", "texture.tga")
							}

							execCommand(
								`"Third-Party\\HMTextureTools" rebuild H3 "${contentFilePath}" --metapath "${`${contentFilePath}.meta`}" "${path.join(
									process.cwd(),
									"temp",
									`chunk${content.chunk}`,
									`${path.basename(contentFilePath).split(".")[0]}.TEXT`
								)}"`
							) // Rebuild texture to TEXT only

							fs.writeFileSync(
								path.join(
									process.cwd(),
									"temp",
									`chunk${content.chunk}`,
									`${content.source === "disk" ? path.basename(content.path).split(".")[0].split("~")[0] : content.extraInformation.textHash}.TEXT.meta.json`
								),
								JSON.stringify({
									hash_value: content.source === "disk" ? path.basename(content.path).split(".")[0].split("~")[0] : content.extraInformation.textHash,
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

							await callRPKGFunction(
								`-json_to_hash_meta "${path.join(
									process.cwd(),
									"temp",
									`chunk${content.chunk}`,
									`${content.source === "disk" ? path.basename(content.path).split(".")[0].split("~")[0] : content.extraInformation.textHash}.TEXT.meta.json`
								)}"`
							) // Rebuild the meta

							fs.removeSync(path.join(process.cwd(), "virtual"))
						}

						await copyToCache(
							instruction.cacheFolder,
							path.join(process.cwd(), "temp", `chunk${content.chunk}`),
							path.join(`chunk${content.chunk}`, `${path.basename(contentIdentifier).slice(0, 15)}-${await xxhash3(contentIdentifier)}`)
						)
					}

					fs.ensureDirSync(path.join(process.cwd(), "staging", `chunk${content.chunk}`))

					// Copy TEXT stuff
					fs.copyFileSync(
						path.join(
							process.cwd(),
							"temp",
							`chunk${content.chunk}`,
							`${content.source === "disk" ? path.basename(content.path).split(".")[0].split("~")[0] : content.extraInformation.textHash}.TEXT`
						),
						path.join(
							process.cwd(),
							"staging",
							`chunk${content.chunk}`,
							`${content.source === "disk" ? path.basename(content.path).split(".")[0].split("~")[0] : content.extraInformation.textHash}.TEXT`
						)
					)
					fs.copyFileSync(
						path.join(
							process.cwd(),
							"temp",
							`chunk${content.chunk}`,
							`${content.source === "disk" ? path.basename(content.path).split(".")[0].split("~")[0] : content.extraInformation.textHash}.TEXT.meta`
						),
						path.join(
							process.cwd(),
							"staging",
							`chunk${content.chunk}`,
							`${content.source === "disk" ? path.basename(content.path).split(".")[0].split("~")[0] : content.extraInformation.textHash}.TEXT.meta`
						)
					)

					// Copy TEXD stuff if necessary
					if ((content.source === "disk" && path.basename(content.path).split(".")[0].split("~").length > 1) || (content.source === "virtual" && content.extraInformation.texdHash)) {
						fs.copyFileSync(
							path.join(
								process.cwd(),
								"temp",
								`chunk${content.chunk}`,
								`${content.source === "disk" ? path.basename(content.path).split(".")[0].split("~")[1] : content.extraInformation.texdHash}.TEXD`
							),
							path.join(
								process.cwd(),
								"staging",
								`chunk${content.chunk}`,
								`${content.source === "disk" ? path.basename(content.path).split(".")[0].split("~")[1] : content.extraInformation.texdHash}.TEXD`
							)
						)
						fs.copyFileSync(
							path.join(
								process.cwd(),
								"temp",
								`chunk${content.chunk}`,
								`${content.source === "disk" ? path.basename(content.path).split(".")[0].split("~")[1] : content.extraInformation.texdHash}.TEXD.meta`
							),
							path.join(
								process.cwd(),
								"staging",
								`chunk${content.chunk}`,
								`${content.source === "disk" ? path.basename(content.path).split(".")[0].split("~")[1] : content.extraInformation.texdHash}.TEXD.meta`
							)
						)
					}
					break
				}
				case "sfx.wem": {
					if (!WWEVpatches[content.source === "disk" ? path.basename(content.path).split(".")[0].split("~")[0] : content.extraInformation.wwevHash!]) {
						WWEVpatches[content.source === "disk" ? path.basename(content.path).split(".")[0].split("~")[0] : content.extraInformation.wwevHash!] = []
					}

					// Add the WWEV patch; this will be a no-op if the cache is used later
					WWEVpatches[content.source === "disk" ? path.basename(content.path).split(".")[0].split("~")[0] : String(content.extraInformation.wwevHash)].push({
						index: content.source === "disk" ? path.basename(content.path).split(".")[0].split("~")[1] : String(content.extraInformation.wwevElement),
						content: content.source === "disk" ? content.path : content.content,
						chunk: `chunk${content.chunk}`
					})
					break
				}
				case "delta": {
					await logger.debug(`Patching delta ${contentIdentifier}`)

					const runtimeID = content.source === "disk" ? path.basename(content.path).split(".")[0].split("~")[0] : content.extraInformation.runtimeID!
					const fileType = content.source === "disk" ? path.basename(content.path).split(".")[0].split("~")[1] : content.extraInformation.fileType!

					if (
						invalidatedData.some((a) => a.filePath === contentIdentifier) || // must redeploy, invalid cache
						!(await copyFromCache(
							instruction.cacheFolder,
							path.join(`chunk${content.chunk}`, `${path.basename(contentIdentifier).slice(0, 15)}-${await xxhash3(contentIdentifier)}`),
							path.join(process.cwd(), "temp", `chunk${content.chunk}`)
						)) // cache is not available
					) {
						fs.ensureDirSync(path.join(process.cwd(), "temp", `chunk${content.chunk}`))

						const rpkgOfFile = await getRPKGOfHash(runtimeID)

						await extractOrCopyToTemp(rpkgOfFile, runtimeID, fileType, `chunk${content.chunk}`) // Extract the file to temp // Extract the file to temp // Extract the file to temp // Extract the file to temp

						let contentFilePath
						if (content.source === "disk") {
							contentFilePath = content.path
						} else {
							fs.ensureDirSync(path.join(process.cwd(), "virtual"))
							fs.writeFileSync(path.join(process.cwd(), "virtual", "patch.delta"), Buffer.from(await content.content.arrayBuffer()))
							contentFilePath = path.join(process.cwd(), "virtual", "patch.delta")
						}

						execCommand(
							`"Third-Party\\xdelta3" -d -s "${path.join(process.cwd(), "temp", rpkgOfFile, fileType, `${runtimeID}.${fileType}`)}" "${contentFilePath}" "${path.join(
								process.cwd(),
								"temp",
								`chunk${content.chunk}`,
								`${runtimeID}.${fileType}`
							)}"`
						) // Patch file with delta

						fs.removeSync(path.join(process.cwd(), "virtual"))

						await copyToCache(
							instruction.cacheFolder,
							path.join(process.cwd(), "temp", `chunk${content.chunk}`),
							path.join(`chunk${content.chunk}`, `${path.basename(contentIdentifier).slice(0, 15)}-${await xxhash3(contentIdentifier)}`)
						)
					}

					fs.ensureDirSync(path.join(process.cwd(), "staging", `chunk${content.chunk}`))

					// Copy patched file to staging
					fs.copyFileSync(
						path.join(process.cwd(), "temp", `chunk${content.chunk}`, `${runtimeID}.${fileType}`),
						path.join(process.cwd(), "staging", `chunk${content.chunk}`, `${runtimeID}.${fileType}`)
					)
					break
				}
				case "clng.json":
				case "ditl.json":
				case "dlge.json":
				case "locr.json":
				case "rtlv.json": {
					const binaryType = content.type.split(".")[0].toUpperCase()
					await logger.debug(
						((): string => {
							switch (binaryType) {
								case "CLNG":
									return `Converting languages file ${contentIdentifier}`
								case "DITL":
									return `Converting soundtags file ${contentIdentifier}`
								case "DLGE":
									return `Converting dialogue file ${contentIdentifier}`
								case "LOCR":
									return `Converting localisation file ${contentIdentifier}`
								case "RTLV":
									return `Converting runtime localised video file ${contentIdentifier}`
								default:
									return `` // We will never hit this, but stops typescript complaining
							}
						})()
					)

					entityContent = content.source === "disk" ? JSON.parse(fs.readFileSync(content.path, "utf8")) : JSON.parse(await content.content.text())

					const hash = normaliseToHash(entityContent["hash"])

					if (
						invalidatedData.some((a) => a.filePath === contentIdentifier) || // must redeploy, invalid cache
						!(await copyFromCache(instruction.cacheFolder, path.join(`chunk${content.chunk}`, await xxhash3(contentIdentifier)), path.join(process.cwd(), "temp", `chunk${content.chunk}`))) // cache is not available
					) {
						fs.ensureDirSync(path.join(process.cwd(), "temp", `chunk${content.chunk}`))

						let contentFilePath
						if (content.source === "disk") {
							contentFilePath = content.path
						} else {
							fs.ensureDirSync(path.join(process.cwd(), "virtual"))
							fs.writeFileSync(path.join(process.cwd(), "virtual", content.type), Buffer.from(await content.content.arrayBuffer()))
							contentFilePath = path.join(process.cwd(), "virtual", content.type)
						}

						execCommand(
							`"Third-Party\\HMLanguageTools" rebuild H3 ${binaryType} "${contentFilePath}" "${path.join(
								process.cwd(),
								"temp",
								`chunk${content.chunk}`,
								`${hash}.${binaryType}`
							)}" --metapath "${path.join(process.cwd(), "temp", `chunk${content.chunk}`, `${hash}.${binaryType}.meta.json`)}"`
						)

						fs.removeSync(path.join(process.cwd(), "virtual"))

						await copyToCache(instruction.cacheFolder, path.join(process.cwd(), "temp", `chunk${content.chunk}`), path.join(`chunk${content.chunk}`, await xxhash3(contentIdentifier)))
					}

					fs.ensureDirSync(path.join(process.cwd(), "staging", `chunk${content.chunk}`))

					// Copy converted files
					fs.copyFileSync(path.join(process.cwd(), "temp", `chunk${content.chunk}`, `${hash}.${binaryType}`), path.join(process.cwd(), "staging", `chunk${content.chunk}`, `${hash}.${binaryType}`))
					fs.copyFileSync(
						path.join(process.cwd(), "temp", `chunk${content.chunk}`, `${hash}.${binaryType}.meta.json`),
						path.join(process.cwd(), "staging", `chunk${content.chunk}`, `${hash}.${binaryType}.meta.json`)
					)
					break
				}
				default: // Copy the file to the staging directory; we don't cache these for obvious reasons
					if (
						(content.source === "disk" ? path.basename(content.path).split(".").slice(1).join(".") : content.extraInformation.fileType!).length === 4 ||
						(content.source === "disk" ? path.basename(content.path).split(".").slice(1).join(".") : content.extraInformation.fileType!).endsWith("meta") ||
						(content.source === "disk" ? path.basename(content.path).split(".").slice(1).join(".") : content.extraInformation.fileType!).endsWith("meta.json")
					) {
						fs.writeFileSync(
							content.source === "disk"
								? path.join(process.cwd(), "staging", `chunk${content.chunk}`, path.basename(content.path))
								: path.join(process.cwd(), "staging", `chunk${content.chunk}`, `${content.extraInformation.runtimeID!}.${content.extraInformation.fileType!}`),
							content.source === "disk" ? fs.readFileSync(content.path) : Buffer.from(await content.content.arrayBuffer())
						)
					}
					break
			}

			sentryContentFileTransaction.finish()

			fs.emptyDirSync(path.join(process.cwd(), "temp"))
		}

		if (instruction.content.some((a) => a.type === "contract.json")) {
			contractsORESChunk = contractsORESChunk as string

			if (contractsCacheInvalid) {
				// we need to re-deploy the contracts ORES OR the contracts ORES couldn't be copied from cache

				fs.writeFileSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.meta.JSON"), JSON.stringify(contractsORESMetaContent))
				fs.rmSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.meta"))
				await callRPKGFunction(`-json_to_hash_meta "${path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.meta.JSON")}"`) // Rebuild the ORES meta

				fs.writeFileSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.JSON"), JSON.stringify(contractsORESContent))
				fs.rmSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES"))
				execCommand(`"Third-Party\\OREStool.exe" "${path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.json")}"`) // Rebuild the ORES

				await copyToCache(instruction.cacheFolder, path.join(process.cwd(), "temp2"), "contractsORES")
			}

			fs.copyFileSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES"), path.join(process.cwd(), "staging", "chunk0", "002B07020D21D727.ORES"))
			fs.copyFileSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.meta"), path.join(process.cwd(), "staging", "chunk0", "002B07020D21D727.ORES.meta")) // Copy the ORES to the staging directory

			fs.removeSync(path.join(process.cwd(), "temp2"))
		}

		/* ------------------------------ Copy chunk meta to staging folder ----------------------------- */
		for (const [rpkg, data] of Object.entries(instruction.rpkgTypes)) {
			if (data.type === "base") {
				fs.ensureDirSync(path.join(process.cwd(), "staging", rpkg))

				if (typeof data.chunkMeta === "string") {
					fs.copyFileSync(data.chunkMeta, path.join(process.cwd(), "staging", rpkg, `${rpkg}.meta`))
				} else if (data.chunkMeta instanceof Blob) {
					fs.writeFileSync(path.join(process.cwd(), "staging", rpkg, `${rpkg}.meta`), Buffer.from(await data.chunkMeta.arrayBuffer()))
				}
			}

			allRPKGTypes[rpkg] = data.type
		}

		sentryContentTransaction.finish()

		/* ------------------------------------- Multithreaded patching ------------------------------------ */
		let index = 0

		const workerPool = new Piscina({
			filename: "patchWorker.js",
			maxThreads: Math.max(Math.ceil(os.cpus().length / 4), 2) // For an 8-core CPU with 16 logical processors there are 4 max threads
		})

		// @ts-expect-error Assigning stuff on global is probably bad practice
		global.currentWorkerPool = workerPool

		const sentryPatchTransaction = sentryModTransaction.startChild({
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
					assignedTemporaryDirectory: `patchWorker${index}`,
					invalidatedData,
					cacheFolder: instruction.cacheFolder
				})
			})
		) // Run each patch in the worker queue and wait for all of them to finish

		// @ts-expect-error Assigning stuff on global is probably bad practice
		global.currentWorkerPool = {
			destroy: () => {}
		}

		sentryPatchTransaction.finish()

		/* ---------------------------------------------------------------------------------------------- */
		/*                                              Blobs                                             */
		/* ---------------------------------------------------------------------------------------------- */
		if (instruction.blobs.length) {
			const sentryBlobsTransaction = sentryModTransaction.startChild({
				op: "stage",
				description: "Blobs"
			})
			configureSentryScope(sentryBlobsTransaction)

			fs.emptyDirSync(path.join(process.cwd(), "temp"))

			fs.ensureDirSync(path.join(process.cwd(), "staging", "chunk0"))

			const oresChunk = await getRPKGOfHash("00858D45F5F9E3CA")

			await extractOrCopyToTemp(oresChunk, "00858D45F5F9E3CA", "ORES") // Extract the ORES to temp

			execCommand(`"Third-Party\\OREStool.exe" "${path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES")}"`)
			const oresContent = JSON.parse(fs.readFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.JSON"), "utf8"))

			await callRPKGFunction(`-hash_meta_to_json "${path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.meta")}"`)
			const metaContent = JSON.parse(fs.readFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.meta.JSON"), "utf8"))

			for (const blob of instruction.blobs) {
				let blobHash: string

				if (!blob.blobHash) {
					if (
						(blob.source === "disk" ? path.extname(blob.filePath).slice(1) : blob.filetype).startsWith("jp") ||
						(blob.source === "disk" ? path.extname(blob.filePath).slice(1) : blob.filetype) === "png"
					) {
						blobHash = `00${md5(`[assembly:/_pro/online/default/cloudstorage/resources/${blob.blobPath}].pc_gfx`.toLowerCase()).slice(2, 16).toUpperCase()}`
					} else if ((blob.source === "disk" ? path.extname(blob.filePath).slice(1) : blob.filetype) === "json") {
						blobHash = `00${md5(`[assembly:/_pro/online/default/cloudstorage/resources/${blob.blobPath}].pc_json`.toLowerCase()).slice(2, 16).toUpperCase()}`
					} else {
						blobHash = `00${md5(
							`[assembly:/_pro/online/default/cloudstorage/resources/${blob.blobPath}].pc_${blob.source === "disk" ? path.extname(blob.filePath).slice(1) : blob.filetype}`.toLowerCase()
						)
							.slice(2, 16)
							.toUpperCase()}`
					}
				} else {
					blobHash = blob.blobHash
				}

				oresContent[blobHash] = blob.blobPath // Add the blob to the ORES

				if (!metaContent["hash_reference_data"].find((a: { hash: unknown }) => a.hash === blobHash)) {
					metaContent["hash_reference_data"].push({
						hash: blobHash,
						flag: "9F"
					})
				}

				if (blob.source === "disk") {
					fs.copyFileSync(
						blob.filePath,
						path.join(
							process.cwd(),
							"staging",
							"chunk0",
							`${blobHash}.${
								path.extname(blob.filePath).slice(1) === "json"
									? "JSON"
									: path.extname(blob.filePath).slice(1).startsWith("jp") || path.extname(blob.filePath).slice(1) === "png"
									? "GFXI"
									: path.extname(blob.filePath).slice(1).toUpperCase()
							}`
						)
					)
				} else {
					fs.writeFileSync(
						path.join(
							process.cwd(),
							"staging",
							"chunk0",
							`${blobHash}.${blob.filetype === "json" ? "JSON" : blob.filetype.startsWith("jp") || blob.filetype === "png" ? "GFXI" : blob.filetype.toUpperCase()}`
						),
						Buffer.from(await blob.content.arrayBuffer())
					)
				} // Copy the actual blob to the staging directory
			}

			// Rebuild the meta
			fs.writeFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.meta.JSON"), JSON.stringify(metaContent))
			fs.rmSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.meta"))
			await callRPKGFunction(`-json_to_hash_meta "${path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.meta.JSON")}"`)

			// Rebuild the ORES
			fs.writeFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.JSON"), JSON.stringify(oresContent))
			fs.rmSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES"))
			execCommand(`"Third-Party\\OREStool.exe" "${path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.json")}"`)

			// Copy the ORES to the staging directory
			fs.copyFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES"), path.join(process.cwd(), "staging", "chunk0", "00858D45F5F9E3CA.ORES"))
			fs.copyFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.meta"), path.join(process.cwd(), "staging", "chunk0", "00858D45F5F9E3CA.ORES.meta"))

			fs.emptyDirSync(path.join(process.cwd(), "temp"))

			sentryBlobsTransaction.finish()
		}

		/* ---------------------------------------- Dependencies ---------------------------------------- */
		if (instruction.manifestSources.dependencies) {
			const sentryDependencyTransaction = sentryModTransaction.startChild({
				op: "stage",
				description: "Dependencies"
			})
			configureSentryScope(sentryDependencyTransaction)

			const doneHashes: {
				id: string
				chunk: number
				portChunk1: boolean
			}[] = []
			for (const dependency of instruction.manifestSources.dependencies) {
				if (
					!doneHashes.some((a) => a.id === (typeof dependency === "string" ? dependency : dependency.runtimeID) && a.chunk === (dependency.toChunk || 0)) ||
					(doneHashes.filter((a) => a.id === (typeof dependency === "string" ? dependency : dependency.runtimeID) && a.chunk === (dependency.toChunk || 0)).every((a) => !a.portChunk1) &&
						dependency.portFromChunk1)
				) {
					doneHashes.push({
						id: typeof dependency === "string" ? dependency : dependency.runtimeID,
						chunk: dependency.toChunk || 0,
						portChunk1: dependency.portFromChunk1
					})

					// If cache hit
					if (
						fs.existsSync(
							path.join(
								process.cwd(),
								"cache",
								"global",
								path.join("dependencies", typeof dependency === "string" ? `${dependency}-0` : `${dependency.runtimeID}-${dependency.portFromChunk1 ? 1 : 0}`)
							)
						)
					) {
						await logger.debug(`Copying dependency ${typeof dependency === "string" ? dependency : dependency.runtimeID} from cache`)

						rust_utils.stageDependenciesFrom(
							path.join(
								process.cwd(),
								"cache",
								"global",
								path.join("dependencies", typeof dependency === "string" ? `${dependency}-0` : `${dependency.runtimeID}-${dependency.portFromChunk1 ? 1 : 0}`)
							),
							`chunk${dependency.toChunk || 0}`
						)
					} else {
						// no cache yet

						await logger.debug(`Extracting dependency ${typeof dependency === "string" ? dependency : dependency.runtimeID}`)

						fs.emptyDirSync(path.join(process.cwd(), "temp"))

						await callRPKGFunction(
							`-${dependency.portFromChunk1 ? "extract_non_boot_hash_depends_from" : "extract_non_base_hash_depends_from"} "${path.join(config.runtimePath)}" -filter "${
								typeof dependency === "string" ? dependency : dependency.runtimeID
							}" -output_path temp`
						)

						await copyToCache(
							"global",
							path.join(process.cwd(), "temp"),
							path.join("dependencies", typeof dependency === "string" ? `${dependency}-0` : `${dependency.runtimeID}-${dependency.portFromChunk1 ? 1 : 0}`)
						)

						rust_utils.stageDependenciesFrom("temp", `chunk${dependency.toChunk || 0}`)

						fs.emptyDirSync(path.join(process.cwd(), "temp"))
					}
				}
			}

			sentryDependencyTransaction.finish()
		}

		/* ------------------------------------- Package definition ------------------------------------- */
		if (instruction.manifestSources.packagedefinition) {
			packagedefinition.push(...instruction.manifestSources.packagedefinition)
		}

		/* ------------------------------------------- Thumbs ------------------------------------------- */
		if (instruction.manifestSources.thumbs) {
			thumbs.push(...instruction.manifestSources.thumbs)
		}

		/* ---------------------------------------- Localisation ---------------------------------------- */
		if (instruction.manifestSources.localisation) {
			for (const language of Object.keys(instruction.manifestSources.localisation) as (keyof ManifestOptionData["localisation"])[]) {
				for (const string of Object.entries(instruction.manifestSources.localisation[language])) {
					localisation.push({
						language: language,
						locString: string[0],
						text: string[1] as string
					})
				}
			}
		}

		if (instruction.manifestSources.localisationOverrides) {
			for (const locrHash of Object.keys(instruction.manifestSources.localisationOverrides)) {
				if (!localisationOverrides[locrHash]) {
					localisationOverrides[locrHash] = []
				}

				for (const language of Object.keys(instruction.manifestSources.localisationOverrides[locrHash]) as (keyof ManifestOptionData["localisation"])[]) {
					for (const string of Object.entries(instruction.manifestSources.localisationOverrides[locrHash][language])) {
						localisationOverrides[locrHash].push({
							language: language,
							locString: string[0],
							text: string[1] as string
						})
					}
				}
			}
		}

		if (instruction.manifestSources.localisedLines) {
			const sentryLocalisedLinesTransaction = sentryModTransaction.startChild({
				op: "stage",
				description: "Localised lines"
			})
			configureSentryScope(sentryLocalisedLinesTransaction)

			for (const lineHash of Object.keys(instruction.manifestSources.localisedLines)) {
				fs.emptyDirSync(path.join(process.cwd(), "temp", "chunk0"))
				fs.ensureDirSync(path.join(process.cwd(), "staging", "chunk0"))

				if (
					invalidatedData.some((a) => a.data.affected.includes(lineHash)) ||
					!(await copyFromCache(instruction.cacheFolder, path.join("localisedLines", lineHash), path.join(process.cwd(), "temp")))
				) {
					fs.writeFileSync(
						path.join(process.cwd(), "temp", "chunk0", `${lineHash}.LINE`),
						Buffer.from(
							`${hexflip(
								crc32(instruction.manifestSources.localisedLines[lineHash].toUpperCase())
									.toString(16)
									.padStart(8, "0")
							)}00`,
							"hex"
						)
					) // Create the LINE file

					fs.writeFileSync(
						path.join(process.cwd(), "temp", "chunk0", `${lineHash}.LINE.meta.JSON`),
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

					await callRPKGFunction(`-json_to_hash_meta "${path.join(process.cwd(), "temp", "chunk0", `${lineHash}.LINE.meta.JSON`)}"`) // Rebuild the meta

					await copyToCache(instruction.cacheFolder, path.join(process.cwd(), "temp"), path.join("localisedLines", lineHash))
				}

				fs.copySync(path.join(process.cwd(), "temp"), path.join(process.cwd(), "staging"))
				fs.emptyDirSync(path.join(process.cwd(), "temp"))
			}

			sentryLocalisedLinesTransaction.finish()
		}

		if (instruction.manifestSources.scripts.length) {
			await logger.verbose("afterDeploy scripts")

			const sentryScriptsTransaction = sentryModTransaction.startChild({
				op: "stage",
				description: "afterDeploy scripts"
			})
			configureSentryScope(sentryScriptsTransaction)

			for (const files of instruction.manifestSources.scripts) {
				await logger.verbose(`Executing script: ${files[0]}`)

				ts.compile(
					files.map((a) => path.join(process.cwd(), "Mods", instruction.cacheFolder, a)),
					{
						esModuleInterop: true,
						allowJs: true,
						target: ScriptTarget.ES2019,
						module: ModuleKind.CommonJS,
						resolveJsonModule: true
					},
					path.join(process.cwd(), "Mods", instruction.cacheFolder)
				)

				// eslint-disable-next-line @typescript-eslint/no-var-requires
				const modScript = (await require(path.join(
					process.cwd(),
					"compiled",
					path.relative(path.join(process.cwd(), "Mods", instruction.cacheFolder), path.join(process.cwd(), "Mods", instruction.cacheFolder, files[0].replace(".ts", ".js")))
				))) as ModScript

				fs.ensureDirSync(path.join(process.cwd(), "scriptTempFolder"))

				await modScript.afterDeploy(
					{
						config,
						deployInstruction: instruction,
						modRoot: path.join(process.cwd(), "Mods", instruction.cacheFolder),
						tempFolder: path.join(process.cwd(), "scriptTempFolder")
					},
					{
						rpkg: {
							callRPKGFunction,
							getRPKGOfHash,
							async extractFileFromRPKG(hash: string, rpkg: string) {
								await logger.verbose(`Extracting ${hash} from ${rpkg}`)
								await rpkgInstance.callFunction(`-extract_from_rpkg "${path.join(config.runtimePath, `${rpkg}.rpkg`)}" -filter "${hash}" -output_path ${path.join(process.cwd(), "scriptTempFolder")}`)
							}
						},
						utils: {
							execCommand,
							extractOrCopyToTemp,
							getQuickEntityFromVersion,
							getQuickEntityFromPatchVersion,
							hexflip
						},
						logger: {
							verbose: (a) => logger.verbose(a, instruction.name),
							debug: (a) => logger.debug(a, instruction.name),
							info: (a) => logger.info(a, instruction.name),
							warn: (a) => logger.warn(a, instruction.name),
							error: (a, b) => logger.error(a, b, instruction.name)
						}
					}
				)

				fs.removeSync(path.join(process.cwd(), "scriptTempFolder"))

				fs.removeSync(path.join(process.cwd(), "compiled"))
			}

			sentryScriptsTransaction.finish()
		}

		sentryModTransaction.finish()
	}

	sentryModsTransaction.finish()

	if (config.outputToSeparateDirectory) {
		fs.emptyDirSync(path.join(process.cwd(), "Output"))
	} // Make output folder

	/* ---------------------------------------------------------------------------------------------- */
	/*                                      Contract destinations                                     */
	/* ---------------------------------------------------------------------------------------------- */
	if (contractsToAddToDestinations.length) {
		const sentryContractDestinations = sentryTransaction.startChild({
			op: "stage",
			description: "Contract destinations"
		})
		configureSentryScope(sentryContractDestinations)

		fs.emptyDirSync(path.join(process.cwd(), "temp"))

		const rpkgOfDestinations = await getRPKGOfHash("004F4B738474CEAD")

		await extractOrCopyToTemp(rpkgOfDestinations, "004F4B738474CEAD", "JSON")

		const registry = fs.readJSONSync(path.join(process.cwd(), "temp", rpkgOfDestinations, "JSON", "004F4B738474CEAD.JSON"))

		for (const { id, before, after, context } of contractsToAddToDestinations) {
			await logger.debug(`Adding contract ${id} to Destinations`)

			if (before) {
				registry.Root.Children.splice(
					registry.Root.Children.findIndex((a: { Id: string }) => a.Id === before),
					0,
					{
						Id: id,
						_comment: "Automatically added by SMF.",
						NarrativeContext: context || "Mission",
						Meta: {
							Ui: {
								Row: 3,
								Col: 5
							}
						}
					}
				)
			} else if (after) {
				registry.Root.Children.splice(registry.Root.Children.findIndex((a: { Id: string }) => a.Id === after) + 1, 0, {
					Id: id,
					_comment: "Automatically added by SMF.",
					NarrativeContext: context || "Mission",
					Meta: {
						Ui: {
							Row: 3,
							Col: 5
						}
					}
				})
			} else {
				registry.Root.Children.push({
					Id: id,
					_comment: "Automatically added by SMF.",
					NarrativeContext: context || "Mission",
					Meta: {
						Ui: {
							Row: 3,
							Col: 5
						}
					}
				})
			}
		}

		fs.ensureDirSync(path.join(process.cwd(), "staging", "chunk0"))

		fs.writeJSONSync(path.join(process.cwd(), "staging", "chunk0", "004F4B738474CEAD.JSON"), registry)

		sentryContractDestinations.finish()
	}

	/* ---------------------------------------------------------------------------------------------- */
	/*                                          WWEV patches                                          */
	/* ---------------------------------------------------------------------------------------------- */
	const sentryWWEVTransaction = sentryTransaction.startChild({
		op: "stage",
		description: "sfx.wem files"
	})
	configureSentryScope(sentryWWEVTransaction)

	for (const entry of Object.entries(WWEVpatches)) {
		await logger.debug(`Patching WWEV ${entry[0]}`)

		fs.emptyDirSync(path.join(process.cwd(), "temp"))

		const WWEVhash = entry[0]

		const rpkgOfWWEV = await getRPKGOfHash(WWEVhash)

		if (invalidatedData.some((a) => a.data.affected.includes(WWEVhash)) || !(await copyFromCache("global", path.join("WWEV", WWEVhash), path.join(process.cwd(), "temp")))) {
			// we need to re-deploy WWEV OR WWEV data couldn't be copied from cache

			await callRPKGFunction(`-extract_wwev_to_ogg_from "${path.join(config.runtimePath)}" -filter "${WWEVhash}" -output_path temp`) // Extract the WWEV

			const workingPath = path.join(process.cwd(), "temp", "WWEV", `${rpkgOfWWEV}.rpkg`, fs.readdirSync(path.join(process.cwd(), "temp", "WWEV", `${rpkgOfWWEV}.rpkg`))[0])

			for (const patch of entry[1]) {
				if (typeof patch.content === "string") {
					fs.copyFileSync(patch.content, path.join(workingPath, "wem", `${patch.index}.wem`)) // Copy the wem
				} else if (patch.content instanceof Blob) {
					fs.writeFileSync(path.join(workingPath, "wem", `${patch.index}.wem`), Buffer.from(await patch.content.arrayBuffer())) // Copy the wem
				}
			}

			await callRPKGFunction(`-rebuild_wwev_in "${path.resolve(path.join(workingPath, ".."))}"`) // Rebuild the WWEV

			await copyToCache("global", path.join(process.cwd(), "temp"), path.join("WWEV", WWEVhash))
		}

		const workingPath = path.join(process.cwd(), "temp", "WWEV", `${rpkgOfWWEV}.rpkg`, fs.readdirSync(path.join(process.cwd(), "temp", "WWEV", `${rpkgOfWWEV}.rpkg`))[0])

		fs.ensureDirSync(path.join(process.cwd(), "staging", entry[1][0].chunk))

		fs.copyFileSync(path.join(workingPath, `${WWEVhash}.WWEV`), path.join(process.cwd(), "staging", entry[1][0].chunk, `${WWEVhash}.WWEV`))
		fs.copyFileSync(path.join(workingPath, `${WWEVhash}.WWEV.meta`), path.join(process.cwd(), "staging", entry[1][0].chunk, `${WWEVhash}.WWEV.meta`)) // Copy the WWEV and its meta
	}

	sentryWWEVTransaction.finish()

	/* ---------------------------------------------------------------------------------------------- */
	/*                                        Runtime packages                                        */
	/* ---------------------------------------------------------------------------------------------- */
	// logger.info("Copying runtime packages")

	// let runtimePatchNumber = 201
	// for (const runtimeFile of runtimePackages) {
	// 	fs.copyFileSync(
	// 		path.join(process.cwd(), "Mods", runtimeFile.mod, runtimeFile.path),
	// 		config.outputToSeparateDirectory
	// 			? path.join(process.cwd(), "Output", "chunk" + runtimeFile.chunk + "patch" + runtimePatchNumber + ".rpkg")
	// 			: path.join(config.runtimePath, "chunk" + runtimeFile.chunk + "patch" + runtimePatchNumber + ".rpkg")
	// 	)
	// 	runtimePatchNumber++

	// 	if (runtimePatchNumber >= 300) {
	// 		logger.error("More than 95 total runtime packages!")
	// 	} // Framework only manages patch200-300
	// }

	/* ---------------------------------------------------------------------------------------------- */
	/*                                          Localisation                                          */
	/* ---------------------------------------------------------------------------------------------- */
	await logger.info("Localising text")

	if (localisation.length) {
		const sentryLocalisationTransaction = sentryTransaction.startChild({
			op: "stage",
			description: "Localisation"
		})
		configureSentryScope(sentryLocalisationTransaction)

		const languages = {
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

		const localisationFileRPKG = await getRPKGOfHash("00F5817876E691F1")

		if (invalidatedData.some((a) => a.data.affected.includes("00F5817876E691F1")) || !(await copyFromCache("global", path.join("LOCR", "manifest"), path.join(process.cwd(), "temp")))) {
			// we need to re-deploy the localisation files OR the localisation files couldn't be copied from cache
			fs.ensureDirSync(path.join(process.cwd(), "temp", "LOCR", `${localisationFileRPKG}.rpkg`))

			await callRPKGFunction(`-extract_from_rpkg "${path.join(config.runtimePath, `${localisationFileRPKG}.rpkg`)}" -filter "00F5817876E691F1" -output_path temp`)
			await callRPKGFunction(`-hash_meta_to_json "${path.join(process.cwd(), "temp", `${localisationFileRPKG}`, "LOCR", "00F5817876E691F1.LOCR.meta")}"`)

			execCommand(
				`"Third-Party\\HMLanguageTools" convert H3 LOCR "${path.join(process.cwd(), "temp", `${localisationFileRPKG}`, "LOCR", "00F5817876E691F1.LOCR")}" "${path.join(
					process.cwd(),
					"temp",
					"LOCR",
					`${localisationFileRPKG}.rpkg`,
					"00F5817876E691F1.LOCR.JSON"
				)}"`
			)

			fs.ensureDirSync(path.join(process.cwd(), "staging", "chunk0"))

			const locrFileContent: HMLanguageToolsLOCR = JSON.parse(fs.readFileSync(path.join(process.cwd(), "temp", "LOCR", `${localisationFileRPKG}.rpkg`, "00F5817876E691F1.LOCR.JSON"), "utf8"))
			const locrContent: Record<string, Record<string, string>> = locrFileContent["languages"]

			for (const item of localisation) {
				const toMerge: Record<string, string> = {}
				toMerge[item.locString.toUpperCase()] = item.text

				deepMerge(locrContent[languages[item.language]], toMerge)

				if (item.language === "english") {
					deepMerge(locrContent["xx"], toMerge)
				}
			}

			const locrToWrite: HMLanguageToolsLOCR = {
				hash: "00F5817876E691F1",
				languages: {}
			}

			for (const language of Object.keys(locrContent)) {
				locrToWrite.languages[language] = locrContent[language] ?? {}
			}

			// We empty the entire temp directory as (right now) we extract the raw files and convert the meta
			fs.ensureDirSync(path.join(process.cwd(), "temp", "LOCR", `${localisationFileRPKG}.rpkg`))
			fs.writeFileSync(path.join(process.cwd(), "temp", "LOCR", `${localisationFileRPKG}.rpkg`, "00F5817876E691F1.LOCR.JSON"), JSON.stringify(locrToWrite))

			await copyToCache("global", path.join(process.cwd(), "temp"), path.join("LOCR", "manifest"))
		}

		// Rebuild the LOCR
		execCommand(
			`"Third-Party\\HMLanguageTools" rebuild H3 LOCR "${path.join(process.cwd(), "temp", "LOCR", `${localisationFileRPKG}.rpkg`, "00F5817876E691F1.LOCR.JSON")}" "${path.join(
				process.cwd(),
				"staging",
				localisationFileRPKG.replace(/patch[0-9]*/gi, ""),
				"00F5817876E691F1.LOCR"
			)}" --metapath "${path.join(process.cwd(), "temp", `${localisationFileRPKG}`, "LOCR", "00F5817876E691F1.LOCR.meta.JSON")}"`
		)

		fs.copyFileSync(path.join(process.cwd(), "temp", `${localisationFileRPKG}`, "LOCR", "00F5817876E691F1.LOCR.meta"), path.join(process.cwd(), "staging", "chunk0", "00F5817876E691F1.LOCR.meta"))

		fs.emptyDirSync(path.join(process.cwd(), "temp"))

		sentryLocalisationTransaction.finish()
	}

	if (Object.keys(localisationOverrides).length) {
		const sentryLocalisationOverridesTransaction = sentryTransaction.startChild({
			op: "stage",
			description: "Localisation overrides"
		})
		configureSentryScope(sentryLocalisationOverridesTransaction)

		const languages = {
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

		for (const locrHash of Object.keys(localisationOverrides)) {
			const localisationFileRPKG = await getRPKGOfHash(locrHash)

			fs.ensureDirSync(path.join(process.cwd(), "staging", localisationFileRPKG.replace(/patch[0-9]*/gi, "")))

			if (invalidatedData.some((a) => a.data.affected.includes(locrHash)) || !(await copyFromCache("global", path.join("LOCR", locrHash), path.join(process.cwd(), "temp")))) {
				// we need to re-deploy the localisation files OR the localisation files couldn't be copied from cache
				await extractOrCopyToTemp(localisationFileRPKG, locrHash, "LOCR", localisationFileRPKG.replace(/patch[0-9]*/gi, ""))
				await callRPKGFunction(`-hash_meta_to_json "${path.join(process.cwd(), "temp", localisationFileRPKG, "LOCR", `${locrHash}.LOCR.meta`)}"`)

				execCommand(
					`"Third-Party\\HMLanguageTools" convert H3 LOCR "${path.join(process.cwd(), "temp", localisationFileRPKG, "LOCR", `${locrHash}.LOCR`)}" "${path.join(
						process.cwd(),
						"temp",
						localisationFileRPKG,
						"LOCR",
						`${locrHash}.LOCR.JSON`
					)}"`
				)

				const locrFileContent: HMLanguageToolsLOCR = JSON.parse(fs.readFileSync(path.join(process.cwd(), "temp", localisationFileRPKG, "LOCR", `${locrHash}.LOCR.JSON`), "utf8"))
				const locrContent = locrFileContent["languages"]

				for (const item of localisationOverrides[locrHash]) {
					const toMerge = {} as Record<string, string>

					// HMLanguageTools uses hexadecimal format for localisation strings
					toMerge[parseInt(item.locString).toString(16)] = item.text

					deepMerge(locrContent[languages[item.language]], toMerge)

					if (item.language === "english") {
						deepMerge(locrContent["xx"], toMerge)
					}
				}

				const locrToWrite: HMLanguageToolsLOCR = {
					hash: locrHash,
					languages: {}
				}

				for (const language of Object.keys(locrContent)) {
					locrToWrite.languages[language] = locrContent[language] ?? {}
				}

				fs.writeFileSync(path.join(process.cwd(), "temp", localisationFileRPKG, "LOCR", `${locrHash}.LOCR.JSON`), JSON.stringify(locrToWrite))

				await copyToCache("global", path.join(process.cwd(), "temp"), path.join("LOCR", locrHash))
			}

			// Rebuild the LOCR
			execCommand(
				`"Third-Party\\HMLanguageTools" rebuild H3 LOCR "${path.join(process.cwd(), "temp", localisationFileRPKG, "LOCR", `${locrHash}.LOCR.JSON`)}" "${path.join(
					process.cwd(),
					"staging",
					localisationFileRPKG.replace(/patch[0-9]*/gi, ""),
					`${locrHash}.LOCR`
				)}" --metapath "${path.join(process.cwd(), "temp", localisationFileRPKG, "LOCR", `${locrHash}.LOCR.meta.JSON`)}"`
			)

			fs.copyFileSync(path.join(process.cwd(), "temp", localisationFileRPKG, "LOCR", `${locrHash}.LOCR.meta`), path.join(process.cwd(), "staging", localisationFileRPKG.replace(/patch[0-9]*/gi, ""), `${locrHash}.LOCR.meta`))

			fs.emptyDirSync(path.join(process.cwd(), "temp"))
		}

		sentryLocalisationOverridesTransaction.finish()
	}

	/* ---------------------------------------------------------------------------------------------- */
	/*                                             Thumbs                                             */
	/* ---------------------------------------------------------------------------------------------- */
	if (config.skipIntro || thumbs.length) {
		await logger.info("Patching thumbs")

		const sentryThumbsPatchingTransaction = sentryTransaction.startChild({
			op: "stage",
			description: "Thumbs patching"
		})
		configureSentryScope(sentryThumbsPatchingTransaction)

		fs.emptyDirSync(path.join(process.cwd(), "temp"))

		if (!fs.existsSync(path.join(process.cwd(), "cleanThumbs.dat"))) {
			// If there is no clean thumbs, copy the one from Retail
			fs.copyFileSync(path.join(config.retailPath, "thumbs.dat"), path.join(process.cwd(), "cleanThumbs.dat"))
		}

		execCommand(`"Third-Party\\h6xtea.exe" -d --src "${path.join(process.cwd(), "cleanThumbs.dat")}" --dst "${path.join(process.cwd(), "temp", "thumbs.dat.decrypted")}"`) // Decrypt thumbs

		let thumbsContent = fs.readFileSync(path.join(process.cwd(), "temp", "thumbs.dat.decrypted"), "utf8").split(/\r?\n/).join("\n")

		if (config.skipIntro) {
			// Skip intro
			thumbsContent = thumbsContent.replace("Boot.entity", "MainMenu.entity")
		}

		for (const patch of thumbs) {
			// Manifest patches
			thumbsContent = thumbsContent.replace(/\[Hitman5\]\n/gi, "[Hitman5]\n" + patch + "\n")
		}

		fs.writeFileSync(path.join(process.cwd(), "temp", "thumbs.dat.decrypted"), thumbsContent)
		execCommand(`"Third-Party\\h6xtea.exe" -e --src "${path.join(process.cwd(), "temp", "thumbs.dat.decrypted")}" --dst "${path.join(process.cwd(), "temp", "thumbs.dat.decrypted.encrypted")}"`) // Encrypt thumbs
		fs.copyFileSync(
			path.join(process.cwd(), "temp", "thumbs.dat.decrypted.encrypted"),
			config.outputToSeparateDirectory ? path.join(process.cwd(), "Output", "thumbs.dat") : path.join(config.retailPath, "thumbs.dat")
		) // Output thumbs

		sentryThumbsPatchingTransaction.finish()
	}

	/* ---------------------------------------------------------------------------------------------- */
	/*                                       Package definition                                       */
	/* ---------------------------------------------------------------------------------------------- */
	await logger.info("Patching packagedefinition")

	const sentryPackagedefPatchingTransaction = sentryTransaction.startChild({
		op: "stage",
		description: "packagedefinition patching"
	})
	configureSentryScope(sentryPackagedefPatchingTransaction)

	await logger.verbose("Emptying temp directory")
	fs.emptyDirSync(path.join(process.cwd(), "temp"))

	if (!fs.existsSync(path.join(process.cwd(), "cleanPackageDefinition.txt"))) {
		// If there is no clean PD, copy the one from Runtime
		await logger.verbose("Copying clean packagedefinition")
		fs.copyFileSync(path.join(config.runtimePath, "packagedefinition.txt"), path.join(process.cwd(), "cleanPackageDefinition.txt"))
	}

	execCommand(`"Third-Party\\h6xtea.exe" -d --src "${path.join(config.runtimePath, "packagedefinition.txt")}" --dst "${path.join(process.cwd(), "temp", "packagedefinitionVersionCheck.txt")}"`)
	if (!fs.readFileSync(path.join(process.cwd(), "temp", "packagedefinitionVersionCheck.txt")).includes("patchlevel=310")) {
		// Check if Runtime PD is unmodded and if so overwrite current "clean" version
		await logger.verbose("Overwriting clean packagedefinition")
		fs.copyFileSync(path.join(config.runtimePath, "packagedefinition.txt"), path.join(process.cwd(), "cleanPackageDefinition.txt"))
	}

	// Decrypt PD
	execCommand(`"Third-Party\\h6xtea.exe" -d --src "${path.join(process.cwd(), "cleanPackageDefinition.txt")}" --dst "${path.join(process.cwd(), "temp", "packagedefinition.txt.decrypted")}"`)

	await logger.verbose("Reading packagedefinition")
	let packagedefinitionContent = fs
		.readFileSync(path.join(process.cwd(), "temp", "packagedefinition.txt.decrypted"), "utf8")
		.split(/\r?\n/)
		.join("\r\n")
		.replace(/patchlevel=[0-9]*/g, "patchlevel=310") // Patch levels

	for (const brick of packagedefinition) {
		// Apply all PD changes
		await logger.verbose(`Applying packagedefinition ${brick.type} change`)
		switch (brick.type) {
			case "partition":
				packagedefinitionContent += "\r\n"
				packagedefinitionContent += `@partition name=${brick.name} parent=${brick.parent} type=${brick.partitionType} patchlevel=310\r\n`
				break
			case "entity":
				if (!packagedefinitionContent.includes(brick.path)) {
					const newPD = packagedefinitionContent.replace(
						new RegExp(`@partition name=${brick.partition} parent=(.*?) type=(.*?) patchlevel=310\r\n`),
						(a, parent, type) => `@partition name=${brick.partition} parent=${parent} type=${type} patchlevel=310\r\n${brick.path}\r\n`
					)

					if (packagedefinitionContent === newPD) {
						await logger.error(`Couldn't find packagedefinition partition ${brick.partition} in which to add ${brick.path}!`)
					}

					packagedefinitionContent = newPD
				}
				break
		}
	}

	await logger.verbose("Writing new packagedefinition")

	// Add blank lines to ensure correct encryption (XTEA uses blocks of 8 bytes)
	fs.writeFileSync(path.join(process.cwd(), "temp", "packagedefinition.txt.decrypted"), `${packagedefinitionContent}\r\n\r\n\r\n\r\n`)

	execCommand(
		`"Third-Party\\h6xtea.exe" -e --src "${path.join(process.cwd(), "temp", "packagedefinition.txt.decrypted")}" --dst "${path.join(
			process.cwd(),
			"temp",
			"packagedefinition.txt.decrypted.encrypted"
		)}"`
	) // Encrypt PD

	await logger.verbose("Copying new packagedefinition to output")

	fs.copyFileSync(
		path.join(process.cwd(), "temp", "packagedefinition.txt.decrypted.encrypted"),
		config.outputToSeparateDirectory ? path.join(process.cwd(), "Output", "packagedefinition.txt") : path.join(config.runtimePath, "packagedefinition.txt")
	) // Output PD

	sentryPackagedefPatchingTransaction.finish()

	/* ---------------------------------------------------------------------------------------------- */
	/*                                         Generate RPKGs                                         */
	/* ---------------------------------------------------------------------------------------------- */
	await logger.info("Generating RPKGs")

	const sentryRPKGGenerationTransaction = sentryTransaction.startChild({
		op: "stage",
		description: "RPKG generation"
	})
	configureSentryScope(sentryRPKGGenerationTransaction)

	for (const stagingChunkFolder of fs.readdirSync(path.join(process.cwd(), "staging"))) {
		await callRPKGFunction(`-generate_rpkg_quickly_from "${path.join(process.cwd(), "staging", stagingChunkFolder)}" -output_path "${path.join(process.cwd(), "staging")}"`)

		try {
			fs.copyFileSync(
				path.join(process.cwd(), "staging", `${stagingChunkFolder}.rpkg`),
				config.outputToSeparateDirectory
					? path.join(process.cwd(), "Output", allRPKGTypes[stagingChunkFolder] === "base" ? `${stagingChunkFolder}.rpkg` : `${stagingChunkFolder}patch300.rpkg`)
					: path.join(config.runtimePath, allRPKGTypes[stagingChunkFolder] === "base" ? `${stagingChunkFolder}.rpkg` : `${stagingChunkFolder}patch300.rpkg`)
			)
		} catch {
			await logger.error("Couldn't copy the RPKG files! Make sure the game isn't running when you deploy your mods.")
		}
	}

	sentryRPKGGenerationTransaction.finish()

	fs.removeSync(path.join(process.cwd(), "staging"))
	fs.removeSync(path.join(process.cwd(), "temp"))

	fs.writeFileSync(
		path.join(process.cwd(), "cache", "rpkgHashCache.json"),
		JSON.stringify(
			Object.fromEntries(
				Object.entries(RPKGHashCache)
					.filter((a) => !a[1][0])
					.map((a) => [a[0], a[1][0]])
			)
		)
	)

	return { lastServerSideStates }
}
