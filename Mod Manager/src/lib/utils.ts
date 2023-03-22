import { OptionType, type Config, type Manifest } from "../../../src/types"
import { compileExpression, useDotAccessOperatorAndOptionalChaining } from "filtrex"
import { xxhash3 } from "hash-wasm"

import Ajv from "ajv"
import json5 from "json5"
import manifestSchema from "$lib/manifest-schema.json"
import memoize from "lodash.memoize"
import merge from "lodash.mergewith"
import semver from "semver"
import { cloneDeep } from "lodash"

export const FrameworkVersion = "2.19.0"

const validateManifest = new Ajv().compile(manifestSchema)

export function getConfig() {
	const config: Config = json5.parse(String(window.fs.readFileSync("../config.json", "utf8")))

	// Remove duplicate items in load order
	config.loadOrder = config.loadOrder.filter((value, index, array) => array.indexOf(value) === index)

	// Remove non-existent mods from load order
	config.loadOrder = config.loadOrder.filter((value) => {
		try {
			getModFolder(value)
			return true
		} catch {
			return false
		}
	})

	// Validate mod options
	config.loadOrder.forEach((mod) => {
		if (modIsFramework(mod)) {
			const manifest = getManifestFromModID(mod)!

			if (manifest.options) {
				if (!config.modOptions[mod]) {
					merge(
						config,
						{
							modOptions: {
								[mod]: [
									...manifest.options
										.filter((a) => (a.type === "checkbox" || a.type === "select" ? a.enabledByDefault : false))
										.map((a) => (a.type === "select" ? `${a.group}:${a.name}` : a.name))
								]
							}
						},
						(orig, src) => {
							if (Array.isArray(orig)) {
								return src
							}
						}
					)
				} // Select default options when a mod has no options set

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

				for (let i = config.modOptions[manifest.id].length - 1; i >= 0; i--) {
					if (
						manifest.options.find(
							(a) => (a.type === "checkbox" && a.name === config.modOptions[manifest.id][i]) || (a.type === "select" && `${a.group}:${a.name}` === config.modOptions[manifest.id][i])
						)?.requirements
					) {
						if (
							!manifest.options
								.find(
									(a) =>
										(a.type === "checkbox" && a.name === config.modOptions[manifest.id][i]) || (a.type === "select" && `${a.group}:${a.name}` === config.modOptions[manifest.id][i])
								)!
								.requirements!.every((a) => config.loadOrder.includes(a))
						) {
							config.modOptions[manifest.id].splice(i, 1)
						}
					}
				} // Disable mod options that require non-present mods

				merge(
					config,
					{
						modOptions: config.modOptions
					},
					(orig, src) => {
						if (Array.isArray(orig)) {
							return src
						}
					}
				)
			}
		}
	})

	setConfig(config)
	return config
}

export function setConfig(config: Config) {
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
							config.modOptions[a].includes(x.name) ||
							config.modOptions[a].includes(`${x.group}:${x.name}`) ||
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
							config.modOptions[b].includes(x.name) ||
							config.modOptions[b].includes(`${x.group}:${x.name}`) ||
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
							config.modOptions[a].includes(x.name) ||
							config.modOptions[a].includes(`${x.group}:${x.name}`) ||
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
							config.modOptions[b].includes(x.name) ||
							config.modOptions[b].includes(`${x.group}:${x.name}`) ||
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

export function setModManifest(modID: string, manifest: Manifest) {
	window.fs.writeFileSync(window.path.join(getModFolder(modID), "manifest.json"), JSON.stringify(manifest, undefined, "\t"))
}

export const getModFolder = memoize(function (id: string) {
	const folder = modIsFramework(id)
		? window.fs
				.readdirSync(window.path.join("..", "Mods"))
				.find(
					(a) =>
						window.fs.existsSync(window.path.join("..", "Mods", a, "manifest.json")) &&
						json5.parse(String(window.fs.readFileSync(window.path.join("..", "Mods", a, "manifest.json"), "utf8"))).id === id
				) // Find mod by ID
		: window.path.join("..", "Mods", id) // Mod is an RPKG mod, use folder name

	if (!folder) {
		window.alert(`The mod ${id} couldn't be located! This will likely cause issues in parts of the framework. If you deleted a mod folder, use the Delete Mod option next time.`)

		if (getConfig().loadOrder.includes(id)) {
			mergeConfig({
				loadOrder: getConfig().loadOrder.filter(a=>a!=id)
			})
		}

		throw new Error(`Couldn't find mod ${id}`)
	}

	return window.path.resolve(window.path.join("..", "Mods", folder))
})

export const modIsFramework = memoize(function (id: string) {
	return !(
		(
			window.fs.existsSync(window.path.join("..", "Mods", id)) && // mod exists in folder
			!window.fs.existsSync(window.path.join("..", "Mods", id, "manifest.json")) && // mod has no manifest
			window
				.klaw(window.path.join("..", "Mods", id), { nodir: true })
				.map((a) => a.path)
				.some((a) => a.endsWith(".rpkg"))
		) // mod contains RPKG files
	)
})

export const getManifestFromModID = memoize(function (id: string, dummy = 1): Manifest {
	if (modIsFramework(id)) {
		return json5.parse(String(window.fs.readFileSync(window.path.join(getModFolder(id), "manifest.json"), "utf8")))
	} else {
		throw new Error(`Mod ${id} is not a framework mod`)
	}
})

export const getAllMods = memoize(function () {
	return window.fs
		.readdirSync(window.path.join("..", "Mods"))
		.map((a) => window.path.resolve(window.path.join("..", "Mods", a)))
		.map((a) =>
			window.fs.existsSync(window.path.join(a, "manifest.json"))
				? (json5.parse(String(window.fs.readFileSync(window.path.join(a, "manifest.json"), "utf8"))).id as string)
				: a.split(window.path.sep).pop()!
		)
})

const modWarnings: {
	title: string
	subtitle: string
	check: (fileToCheck: string) => Promise<boolean>
	type: "error" | "warning" | "warning-suppressed" | "info"
}[] = [
	{
		title: "Invalid manifest",
		subtitle: `
			The manifest of this mod is invalid.<br><br>
			You should resolve this - this <b>will</b> cause issues.
		`,
		check: async (fileToCheck) => {
			if (window.path.basename(fileToCheck) === "manifest.json") {
				try {
					const manifest = json5.parse(await window.fs.readFile(fileToCheck, "utf8"))
					if (!manifest) return true
					if (!validateManifest(manifest)) return true
				} catch {
					return true
				}
			}

			return false
		},
		type: "error"
	},
	{
		title: "Invalid JSON file",
		subtitle: `
			There is an invalid JSON file of a framework filetype present in the mod.<br><br>
			You should resolve this - this <b>will</b> cause issues.
		`,
		check: async (fileToCheck) => {
			if (
				fileToCheck.endsWith("entity.json") ||
				fileToCheck.endsWith("entity.patch.json") ||
				fileToCheck.endsWith("repository.json") ||
				fileToCheck.endsWith("unlockables.json") ||
				fileToCheck.endsWith("JSON.patch.json") ||
				fileToCheck.endsWith("contract.json")
			) {
				try {
					if (!(await window.fs.readJSON(fileToCheck))) return true
				} catch {
					return true
				}
			}

			return false
		},
		type: "error"
	}
]

let startedGettingModWarnings = false

export async function getAllModWarnings(): Promise<Record<string, { title: string; subtitle: string; trace: string; type: string }[]>> {
	if (!(startedGettingModWarnings || window.fs.existsSync("./warnings.json"))) {
		startedGettingModWarnings = true

		const allWarnings = []

		for (const mod of getAllMods().filter((a) => modIsFramework(a))) {
			const fileWarnings: Record<string, { title: string; subtitle: string; trace: string; type: string }[]> = {}

			for (const file of window.klaw(getModFolder(mod), { nodir: true }).map((a) => a.path)) {
				fileWarnings[file] = []
				for (const warning of modWarnings) {
					if (await warning.check(file)) {
						fileWarnings[file].push({
							title: warning.title,
							subtitle: warning.subtitle,
							trace: file,
							type: warning.type
						})
					}
				}
			}

			allWarnings.push([mod, Object.values(fileWarnings).flat()])
		}

		await window.fs.writeJSON("./warnings.json", Object.fromEntries(await Promise.all(allWarnings)))
	} else if (startedGettingModWarnings) {
		while (!window.fs.existsSync("./warnings.json")) await new Promise((r) => setTimeout(r, 1000))
	}

	return window.fs.readJSONSync("./warnings.json")
}
