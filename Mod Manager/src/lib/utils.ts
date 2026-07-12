import { OptionType, type Config, type Manifest } from "../../../src/types"
import { compileExpression, useDotAccessOperatorAndOptionalChaining } from "filtrex"

import json5 from "json5"
import merge from "lodash.mergewith"
import semver from "semver"
import { writable } from "svelte/store"

export const FrameworkVersion = "2.33.40"
export const trustedHosts = new Set(["github.com", "raw.githubusercontent.com", "dropbox.com", "dl.dropboxusercontent.com", "drive.google.com", "hitman-resources.netlify.app"])

let cachedConfig: Config | null = null
let loadOrderValidated = false
export const configStore = writable<Config | null>(null)

let modsCacheInitialized = false
let modsList: string[] = []
const manifestsMap = new Map<string, Manifest>()
const foldersMap = new Map<string, string>()
const isFrameworkMap = new Map<string, boolean>()

// skipcq: JS-C1003, JS-W1028
import ValidationWorker from "./validation.worker?worker"

let worker: Worker | null = null
let currentWorkerId = 0
const pendingResolvers = new Map<number, (res: [boolean, string]) => void>()

// skipcq: JS-0067
function getWorker(): Worker {
	if (!worker) {
		worker = new ValidationWorker()
		worker.onmessage = (event) => {
			const { id, result } = event.data
			const resolver = pendingResolvers.get(id)
			if (resolver) {
				resolver(result)
				pendingResolvers.delete(id)
			}
		}
		worker.onerror = (error) => {
			console.error("Validation worker error:", error)
			for (const [id, resolver] of pendingResolvers.entries()) {
				resolver([false, "Validation worker crashed"])
				pendingResolvers.delete(id)
			}
			worker?.terminate()
			worker = null
		}
	}
	return worker
}

// skipcq: JS-0067
function validateInWorker(
	modFolder: string,
	manifest: unknown,
	contentFoldersStatus: Record<string, boolean>,
	jsonFilesData: Record<string, string>
): Promise<[boolean, string]> {
	const id = ++currentWorkerId
	return new Promise((resolve) => {
		pendingResolvers.set(id, resolve)
		getWorker().postMessage({
			id,
			modFolder,
			manifest,
			contentFoldersStatus,
			jsonFilesData
		})
	})
}

export function validateConfigOptions(config: Config) {
	if (!modsCacheInitialized) {
		return
	}

	// Initialize modOptions if missing
	config.modOptions = config.modOptions || {}

	// Initialize loadOrder if missing or not an array
	if (!Array.isArray(config.loadOrder)) {
		config.loadOrder = []
	}

	// Remove duplicate items in load order
	config.loadOrder = config.loadOrder.filter((value, index, array) => array.indexOf(value) === index)

	// Collect all missing mods and warn user once
	const missingMods = config.loadOrder.filter((value) => !foldersMap.has(value))

	if (missingMods.length > 0) {
		// skipcq: JS-0052, eslint-disable-next-line no-alert
		window.alert(`The following mods could not be found:\n${missingMods.map(m => `- ${m}`).join("\n")}\n\nThey have been removed from your mods list.\n\nIf you intended to uninstall these mods, please use the "Delete Mod" option in the Mod Manager next time to ensure they are cleaned up properly. If you did not intend to uninstall them and this warning is shown, you can ignore this message.`)
	}

	// Remove non-existent mods from load order
	config.loadOrder = config.loadOrder.filter((value) => foldersMap.has(value))

	// Validate mod options
	config.loadOrder.forEach((mod) => {
		if (modIsFramework(mod)) {
			const manifest = getManifestFromModID(mod)!

			if (manifest.options) {
				if (!config.modOptions[mod]) {
					config.modOptions[mod] = [
						...manifest.options
							.filter((a) => (a.type === "checkbox" || a.type === "select" ? a.enabledByDefault : false))
							.map((a) => (a.type === "select" ? `${a.group}:${a.name}` : a.name))
					]
				} // Select default options when a mod has no options set

				if (!config.modOptions[mod]) {
					config.modOptions[mod] = []
				}

				config.modOptions[mod].push(
					...manifest.options
						.filter((a) => a.type === "select" && a.enabledByDefault)
						.filter((a) => !config.modOptions[mod].some((b) => b.split(":").length > 1 && b.split(":")[0] !== a.name))
						.map((a) => (a.type === "select" ? `${a.group}:${a.name}` : a.name))
				) // Select default options in select type IF there is no selected option

				for (let i = config.modOptions[mod].length - 1; i >= 0; i--) {
					if (
						!(
							manifest.options.some((a) => a.type === "checkbox" && a.name === config.modOptions[mod][i]) ||
							manifest.options.some((a) => a.type === "select" && `${a.group}:${a.name}` === config.modOptions[mod][i])
						)
					) {
						if (manifest.options.some((a) => a.type === "select" && a.name === config.modOptions[mod][i])) {
							// There's a select and it's using the old name format (just the name), change it to the new format (group:name)
							config.modOptions[mod][i] =
								// @ts-expect-error TypeScript doesn't think that a select has a group apparently
								`${
									// @ts-expect-error TypeScript doesn't think that a select has a group apparently
									manifest.options.find((a) => a.type === "select" && a.name === config.modOptions[mod][i])!.group
								}:${manifest.options.find((a) => a.type === "select" && a.name === config.modOptions[mod][i])!.name}`
						} else {
							// Remove it, it doesn't exist
							config.modOptions[mod].splice(i, 1)
						}
					}
				} // Remove non-existent options and update from the old name format in select options

				for (let i = config.modOptions[mod].length - 1; i >= 0; i--) {
					if (
						manifest.options.find(
							(a) => (a.type === "checkbox" && a.name === config.modOptions[mod][i]) || (a.type === "select" && `${a.group}:${a.name}` === config.modOptions[mod][i])
						)?.requirements
					) {
						if (
							!manifest.options
								.find(
									(a) =>
										(a.type === "checkbox" && a.name === config.modOptions[mod][i]) || (a.type === "select" && `${a.group}:${a.name}` === config.modOptions[mod][i])
								)!
								.requirements!.every((a) => config.loadOrder.includes(a))
						) {
							config.modOptions[mod].splice(i, 1)
						}
					}
				} // Disable mod options that require non-present mods
			}
		}
	})
}

export function getConfig() {
	if (cachedConfig && loadOrderValidated) {
		configStore.set(cachedConfig)
		return cachedConfig
	}

	const config: Config = json5.parse(String(window.fs.readFileSync("../config.json", "utf8")))

	config.knownMods = config.knownMods || []
	config.developerMode = config.developerMode || false

	if (modsCacheInitialized) {
		validateConfigOptions(config)
		loadOrderValidated = true
	}

	cachedConfig = config
	configStore.set(config)

	return config
}

export function setConfig(config: Config) {
	if (modsCacheInitialized) {
		validateConfigOptions(config)
	}
	cachedConfig = config
	loadOrderValidated = modsCacheInitialized
	configStore.set(config)
	window.fs.writeFileSync("../config.json", json5.stringify(config))
}

export function mergeConfig(configToMerge: Partial<Config>) {
	const config = getConfig()
	setConfig(
		merge(config, configToMerge, (orig, src) => {
			if (Array.isArray(orig)) {
				return src
			}
		})
	)
}

export function sortMods() {
	const config = getConfig()

	config.loadOrder = config.loadOrder.sort((a, b) => {
		// RPKG mod sort order does not matter; they're always deployed before framework mods anyway
		if (!(modIsFramework(a) && modIsFramework(b))) {
			return 0
		}

		const manifestA = getManifestFromModID(a)
		const manifestB = getManifestFromModID(b)

		const modALoadBefore: (string | [string, string])[] = []

		if (manifestA.loadBefore) {
			modALoadBefore.push(...manifestA.loadBefore)
		}

		if (manifestA.options) {
			modALoadBefore.push(
				...(manifestA.options
					.filter(
						(x) =>
							(config.modOptions[a] || []).includes(x.name) ||
							(config.modOptions[a] || []).includes(`${x.group}:${x.name}`) ||
							(x.type === OptionType.conditional &&
								compileExpression(x.condition, { customProp: useDotAccessOperatorAndOptionalChaining })({
									config
								}))
					)
					.map((a) => a.loadBefore)
					.filter((a) => a)
					.flat(1) as (string | [string, string])[])
			)
		}

		const modBLoadBefore: (string | [string, string])[] = []

		if (manifestB.loadBefore) {
			modBLoadBefore.push(...manifestB.loadBefore)
		}

		if (manifestB.options) {
			modBLoadBefore.push(
				...(manifestB.options
					.filter(
						(x) =>
							(config.modOptions[b] || []).includes(x.name) ||
							(config.modOptions[b] || []).includes(`${x.group}:${x.name}`) ||
							(x.type === OptionType.conditional &&
								compileExpression(x.condition, { customProp: useDotAccessOperatorAndOptionalChaining })({
									config
								}))
					)
					.map((a) => a.loadBefore)
					.filter((a) => a!)
					.flat(1) as (string | [string, string])[])
			)
		}

		const modALoadAfter: (string | [string, string])[] = []

		if (manifestA.loadAfter) {
			modALoadAfter.push(...manifestA.loadAfter)
		}

		if (manifestA.options) {
			modALoadAfter.push(
				...(manifestA.options
					.filter(
						(x) =>
							(config.modOptions[a] || []).includes(x.name) ||
							(config.modOptions[a] || []).includes(`${x.group}:${x.name}`) ||
							(x.type === OptionType.conditional &&
								compileExpression(x.condition, { customProp: useDotAccessOperatorAndOptionalChaining })({
									config
								}))
					)
					.map((a) => a.loadAfter)
					.filter((a) => a)
					.flat(1) as (string | [string, string])[])
			)
		}

		const modBLoadAfter: (string | [string, string])[] = []

		if (manifestB.loadAfter) {
			modBLoadAfter.push(...manifestB.loadAfter)
		}

		if (manifestB.options) {
			modBLoadAfter.push(
				...(manifestB.options
					.filter(
						(x) =>
							(config.modOptions[b] || []).includes(x.name) ||
							(config.modOptions[b] || []).includes(`${x.group}:${x.name}`) ||
							(x.type === OptionType.conditional &&
								compileExpression(x.condition, { customProp: useDotAccessOperatorAndOptionalChaining })({
									config
								}))
					)
					.map((a) => a.loadAfter)
					.filter((a) => a!)
					.flat(1) as (string | [string, string])[])
			)
		}

		for (const loadBefore of modALoadBefore) {
			if (typeof loadBefore === "string") {
				if (loadBefore === b) {
					return -1
				}
			} else if (loadBefore[0] === b) {
				if (semver.satisfies(manifestB.version, loadBefore[1])) {
					return -1
				}
			}
		}

		for (const loadAfter of modALoadAfter) {
			if (typeof loadAfter === "string") {
				if (loadAfter === b) {
					return 1
				}
			} else if (loadAfter[0] === b) {
				if (semver.satisfies(manifestB.version, loadAfter[1])) {
					return 1
				}
			}
		}

		for (const loadBefore of modBLoadBefore) {
			if (typeof loadBefore === "string") {
				if (loadBefore === a) {
					return 1
				}
			} else if (loadBefore[0] === a) {
				if (semver.satisfies(manifestB.version, loadBefore[1])) {
					return 1
				}
			}
		}

		for (const loadAfter of modBLoadAfter) {
			if (typeof loadAfter === "string") {
				if (loadAfter === a) {
					return -1
				}
			} else if (loadAfter[0] === a) {
				if (semver.satisfies(manifestB.version, loadAfter[1])) {
					return -1
				}
			}
		}

		return 0
	})

	setConfig(config)
	return true
}

export function alterModManifest(modID: string, data: Partial<Manifest>) {
	const manifest = getManifestFromModID(modID)
	merge(manifest, data, (orig, src) => {
		if (Array.isArray(orig)) {
			return src
		}
	})
	setModManifest(modID, manifest)
}

export function clearModsCache() {
	modsCacheInitialized = false
	loadOrderValidated = false
	cachedConfig = null
	preloadModsCache("clearModsCache", true)
}

const modsBeingDeleted = new Set<string>()

/**
 * Marks a mod as undergoing deletion to suppress missing-folder alert dialogs.
 * 
 * @param id The ID of the mod being deleted.
 */
export function markModAsDeleting(id: string) {
	modsBeingDeleted.add(id)
}

/**
 * Removes a mod from the active deletion tracking set.
 * 
 * @param id The ID of the mod.
 */
export function unmarkModAsDeleting(id: string) {
	modsBeingDeleted.delete(id)
}


let cacheLoadStartTimestamp: number | null = null
let cacheLoadStartCaller: string | null = null

export function getCacheLoadStartTimestamp() {
	return cacheLoadStartTimestamp
}

export function getCacheLoadStartCaller() {
	return cacheLoadStartCaller
}

let cacheGeneration = 0
let cacheLoadingPromise: Promise<void> | null = null

// skipcq: JS-0067
export function preloadModsCache(caller?: string, force = false): Promise<void> {
	if (modsCacheInitialized && !force) {
		return Promise.resolve()
	}
	if (cacheLoadingPromise && !force) {
		return cacheLoadingPromise
	}

	cacheLoadStartTimestamp = Date.now()
	cacheLoadStartCaller = caller || "unknown"

	const currentGeneration = ++cacheGeneration

	// skipcq: JS-R1005
	cacheLoadingPromise = (async () => {
		try {
			const modsDir = window.path.join("..", "Mods")
			if (!(await window.fs.pathExists(modsDir))) {
				if (currentGeneration !== cacheGeneration) {
					await cacheLoadingPromise
					return
				}
				modsList = []
				manifestsMap.clear()
				foldersMap.clear()
				isFrameworkMap.clear()
				modsCacheInitialized = true
				return
			}

			const subdirs = await window.fs.readdir(modsDir)
			const tempModsList: string[] = []
			const tempManifestsMap = new Map<string, Manifest>()
			const tempFoldersMap = new Map<string, string>()
			const tempIsFrameworkMap = new Map<string, boolean>()
			const validationPromises: Promise<unknown>[] = []

			for (const subdir of subdirs) {
				if (subdir === "Managed by SMF, do not touch") {
					continue
				}

				const fullPath = window.path.resolve(window.path.join(modsDir, subdir))
				const manifestPath = window.path.join(fullPath, "manifest.json")

				if (await window.fs.pathExists(manifestPath)) {
					try {
						const manifestContent = await window.fs.readFile(manifestPath, "utf8")
						const manifest = json5.parse(String(manifestContent)) as Manifest
						const id = manifest.id
						if (id) {
							tempModsList.push(id)
							tempManifestsMap.set(id, manifest)
							tempFoldersMap.set(id, fullPath)
							tempIsFrameworkMap.set(id, true)

							if (id !== subdir) {
								tempManifestsMap.set(subdir, manifest)
								tempFoldersMap.set(subdir, fullPath)
								tempIsFrameworkMap.set(subdir, true)
							}
						} else {
							const idFallback = subdir
							tempModsList.push(idFallback)
							tempFoldersMap.set(idFallback, fullPath)
							tempIsFrameworkMap.set(idFallback, false)
						}
					} catch {
						const idFallback = subdir
						tempModsList.push(idFallback)
						tempFoldersMap.set(idFallback, fullPath)
						tempIsFrameworkMap.set(idFallback, false)
					}
				} else {
					const id = subdir
					tempModsList.push(id)
					tempFoldersMap.set(id, fullPath)
					tempIsFrameworkMap.set(id, false)
				}

				validationPromises.push(
					validateModFolder(fullPath).catch((e) => {
						console.error(`Validation failed for subdir: ${subdir}`, e)
					})
				)
			}

			await Promise.all(validationPromises)

			if (currentGeneration !== cacheGeneration) {
				await cacheLoadingPromise
				return
			}

			// Swap double-buffered cache
			modsList = tempModsList
			manifestsMap.clear()
			tempManifestsMap.forEach((v, k) => manifestsMap.set(k, v))
			foldersMap.clear()
			tempFoldersMap.forEach((v, k) => foldersMap.set(k, v))
			isFrameworkMap.clear()
			tempIsFrameworkMap.forEach((v, k) => isFrameworkMap.set(k, v))
			modsCacheInitialized = true

			if (cachedConfig) {
				validateConfigOptions(cachedConfig)
				loadOrderValidated = true
				configStore.set(cachedConfig)
			}
		} catch (err) {
			if (currentGeneration === cacheGeneration) {
				console.error("Failed to preload mods cache:", err)
			}
		} finally {
			if (currentGeneration === cacheGeneration) {
				cacheLoadingPromise = null
			}
		}
	})()

	return cacheLoadingPromise
}

export function initializeModsCache() {
	if (modsCacheInitialized) {
		return
	}
	console.warn("[WARNING] Mods cache is not initialized. Performing synchronous disk scan fallback in initializeModsCache().")

	modsList = []
	manifestsMap.clear()
	foldersMap.clear()
	isFrameworkMap.clear()

	const modsDir = window.path.join("..", "Mods")
	if (!window.fs.existsSync(modsDir)) {
		modsCacheInitialized = true
		return
	}

	const subdirs = window.fs.readdirSync(modsDir)
	for (const subdir of subdirs) {
		if (subdir === "Managed by SMF, do not touch") {
			continue
		}

		const fullPath = window.path.resolve(window.path.join(modsDir, subdir))
		const manifestPath = window.path.join(fullPath, "manifest.json")

		if (window.fs.existsSync(manifestPath)) {
			try {
				const manifestContent = window.fs.readFileSync(manifestPath, "utf8")
				const manifest = json5.parse(String(manifestContent)) as Manifest
				const id = manifest.id
				if (id) {
					modsList.push(id)
					manifestsMap.set(id, manifest)
					foldersMap.set(id, fullPath)
					isFrameworkMap.set(id, true)

					if (id !== subdir) {
						manifestsMap.set(subdir, manifest)
						foldersMap.set(subdir, fullPath)
						isFrameworkMap.set(subdir, true)
					}
				} else {
					const idFallback = subdir
					modsList.push(idFallback)
					foldersMap.set(idFallback, fullPath)
					isFrameworkMap.set(idFallback, false)
				}
			} catch {
				const idFallback = subdir
				modsList.push(idFallback)
				foldersMap.set(idFallback, fullPath)
				isFrameworkMap.set(idFallback, false)
			}
		} else {
			const id = subdir
			modsList.push(id)
			foldersMap.set(id, fullPath)
			isFrameworkMap.set(id, false)
		}
	}

	modsCacheInitialized = true
}

export function setModManifest(modID: string, manifest: Manifest) {
	const modFolder = getModFolder(modID)
	window.fs.writeFileSync(window.path.join(modFolder, "manifest.json"), JSON.stringify(manifest, undefined, "\t"))
	clearValidationCacheForFolder(modFolder)
	manifestsMap.set(modID, manifest)
}

export function getModFolder(id: string): string {
	initializeModsCache()
	const cachedFolder = foldersMap.get(id)
	if (cachedFolder) {
		return cachedFolder
	}

	console.warn(`Cache miss for mod folder ID: ${id}. Performing synchronous fallback directory search.`)
	const folder = modIsFramework(id)
		? window.fs
				.readdirSync(window.path.join("..", "Mods"))
				.find(
					(a) =>
						window.fs.existsSync(window.path.join("..", "Mods", a, "manifest.json")) &&
						json5.parse(String(window.fs.readFileSync(window.path.join("..", "Mods", a, "manifest.json"), "utf8"))).id === id
				)
		: id

	if (!folder) {
		if (!modsBeingDeleted.has(id)) {
			// skipcq: JS-0052
			window.alert(`The mod ${id} couldn't be located! This will likely cause issues in parts of the framework. If you deleted a mod folder, use the Delete Mod option next time.`)
		}
		throw new Error(`Couldn't find mod ${id}`)
	}

	return window.path.resolve(window.path.join("..", "Mods", folder))
}

export function modIsFramework(id: string): boolean {
	initializeModsCache()
	const cachedValue = isFrameworkMap.get(id)
	if (cachedValue !== undefined) {
		return cachedValue
	}

	const modPath = window.path.join("..", "Mods", id)
	if (window.fs.existsSync(modPath)) {
		return window.fs.existsSync(window.path.join(modPath, "manifest.json"))
	}
	return true
}

/**
 * Retrieves a mod manifest by its ID, with synchronous fallback read.
 * Returns a default manifest structure on failure to prevent UI crashes.
 * 
 * @param id The ID of the mod.
 * @param _dummy Unused parameter kept for API compatibility.
 * @returns The parsed Manifest object or a default manifest layout.
 */
export function getManifestFromModID(id: string, _dummy = 1): Manifest {
	if (manifestsMap.has(id)) {
		return manifestsMap.get(id)!
	}

	console.warn(`[WARNING] Cache miss for manifest ID: ${id}. Performing synchronous fallback file read.`)
	try {
		if (modIsFramework(id)) {
			return json5.parse(String(window.fs.readFileSync(window.path.join(getModFolder(id), "manifest.json"), "utf8")))
		}
	} catch (e) {
		console.warn(`[WARNING] Failed to read fallback manifest for ${id}:`, e)
	}
	return {
		id,
		name: id,
		description: "",
		authors: [],
		version: "0.0.0",
		frameworkVersion: ""
	} as Manifest
}

export function getAllMods(): string[] {
	initializeModsCache()
	return [...modsList]
}

const validationCache = new Map<string, [boolean, string]>()

export function clearValidationCache() {
	validationCache.clear()
	for (let i = localStorage.length - 1; i >= 0; i--) {
		const key = localStorage.key(i)
		if (key?.startsWith("val-cache:")) {
			localStorage.removeItem(key)
		}
	}
}

/**
 * Clears validation cache entries for a specific folder from memory and localStorage.
 * Normalizes the folder path to ensure both raw and resolved paths are cleared.
 * 
 * @param modFolder The path to the mod folder.
 */
export function clearValidationCacheForFolder(modFolder: string) {
	const resolvedFolder = window.path.resolve(modFolder)
	validationCache.delete(modFolder)
	validationCache.delete(resolvedFolder)

	const prefix1 = `val-cache:${window.path.join(modFolder, "manifest.json")}`
	const prefix2 = `val-cache:${window.path.join(resolvedFolder, "manifest.json")}`

	for (let i = localStorage.length - 1; i >= 0; i--) {
		const key = localStorage.key(i)
		if (key && (key.startsWith(prefix1) || key.startsWith(prefix2))) {
			localStorage.removeItem(key)
		}
	}
}

let validationQueue = Promise.resolve()

// skipcq: JS-0067
export async function validateModFolder(modFolder: string): Promise<[boolean, string]> {
	if (validationCache.has(modFolder)) {
		return validationCache.get(modFolder)!
	}

	try {
		const manifestPath = window.path.join(modFolder, "manifest.json")
		const { statsParts, manifest, contentFoldersStatus, jsonFilesData } = await window.ipc.invoke("get-mod-stats", modFolder)
		const cacheKey = `val-cache:${statsParts.join("|")}`

		const cached = localStorage.getItem(cacheKey)
		if (cached) {
			const result = JSON.parse(cached)
			validationCache.set(modFolder, result)
			return result
		}

		const promise = validationQueue.then(async () => {
			if (validationCache.has(modFolder)) {
				return validationCache.get(modFolder)!
			}

			const result = await validateInWorker(modFolder, manifest, contentFoldersStatus, jsonFilesData)
			if (result[1] !== "Validation worker crashed") {
				validationCache.set(modFolder, result)

				const prefix = `val-cache:${manifestPath}`
				for (let i = localStorage.length - 1; i >= 0; i--) {
					const key = localStorage.key(i)
					if (key?.startsWith(prefix)) {
						localStorage.removeItem(key)
					}
				}

				localStorage.setItem(cacheKey, JSON.stringify(result))
			}
			return result
		})

		validationQueue = promise.then(() => {}).catch(() => {})

		return promise
	} catch {
		const result: [boolean, string] = [false, "Validation crashed"]
		validationCache.set(modFolder, result)
		return result
	}
}

export async function removeDirectoryRecursive(dirPath: string) {
	if (!window.fs.existsSync(dirPath)) {
		return
	}

	try {
		if (typeof window.fs.rmSync === "function") {
			window.fs.rmSync(dirPath, { recursive: true, force: true })
		} else {
			window.fs.removeSync(dirPath)
		}
		return
	} catch (initialErr) {
		let removeSuccess = false
		let removeError: unknown = initialErr

		for (let attempt = 1; attempt <= 3; attempt++) {
			try {
				if (window.fs.existsSync(dirPath)) {
					makeWritableRecursive(dirPath)
					if (typeof window.fs.rmSync === "function") {
						window.fs.rmSync(dirPath, { recursive: true, force: true })
					} else {
						window.fs.removeSync(dirPath)
					}
				}
				removeSuccess = true
				break
			} catch (err) {
				removeError = err
				await new Promise((resolve) => setTimeout(resolve, 150))
			}
		}

		if (!removeSuccess) {
			throw removeError || new Error(`Failed to remove directory: ${dirPath}`)
		}
	}
}

function makeWritableRecursive(dirPath: string) {
	try {
		const stat = window.fs.statSync(dirPath)
		if (stat.isDirectory()) {
			window.fs.chmodSync(dirPath, 0o777)
			const files = window.fs.readdirSync(dirPath)
			for (const file of files) {
				makeWritableRecursive(window.path.join(dirPath, file))
			}
		} else {
			window.fs.chmodSync(dirPath, 0o666)
		}
	} catch {}
}
