// @ts-expect-error Need to assign on global because of QuickEntity
global.THREE = require("./three-onlymath.min")

import * as LosslessJSON from "lossless-json"

import { config, logger } from "./core-singleton"
import { copyFromCache, copyToCache, getQuickEntityFromPatchVersion } from "./utils"

import RPKGInstance from "./rpkg"
import child_process from "child_process"
import fs from "fs-extra"
import path from "path"
import { xxhash3 } from "hash-wasm"

require("clarify")

const execCommand = function (command: string) {
	void logger.verbose(`Executing command ${command}`)
	return new Promise((resolve, reject) => {
		child_process.exec(command).on("close", resolve)
	})
}

export = async ({
	tempHash,
	tempRPKG,
	tbluHash,
	tbluRPKG,
	chunkFolder,
	assignedTemporaryDirectory,
	patches,
	invalidatedData,
	cacheFolder
}: {
	tempHash: string
	tempRPKG: string
	tbluHash: string
	tbluRPKG: string
	chunkFolder: string
	assignedTemporaryDirectory: string
	patches: any[]
	invalidatedData: {
		filePath: string
		data: { hash: string; dependencies: string[]; affected: string[] }
	}[]
	cacheFolder: string
}) => {
	fs.ensureDirSync(path.join(process.cwd(), assignedTemporaryDirectory))

	if (
		!patches.every((patch) => !invalidatedData.some((a) => a.filePath == patch.path)) || // must redeploy, invalid cache
		!(await copyFromCache(cacheFolder, path.join(chunkFolder, await xxhash3(patches[patches.length - 1].path)), path.join(process.cwd(), assignedTemporaryDirectory))) // cache is not available
	) {
		const rpkgInstance = new RPKGInstance()

		await rpkgInstance.waitForInitialised()

		const callRPKGFunction = async function (command: string) {
			await logger.verbose(`Executing RPKG function ${command}`)
			return await rpkgInstance.callFunction(command)
		}

		/* ---------------------------------------- Extract TEMP ---------------------------------------- */
		if (!fs.existsSync(path.join(process.cwd(), "staging", chunkFolder, tempHash + ".TEMP"))) {
			await callRPKGFunction(`-extract_from_rpkg "${path.join(config.runtimePath, tempRPKG + ".rpkg")}" -filter "${tempHash}" -output_path "${assignedTemporaryDirectory}"`)
		} else {
			try {
				fs.ensureDirSync(path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP"))
			} catch {}
			await Promise.all([
				fs.copyFile(path.join(process.cwd(), "staging", chunkFolder, tempHash + ".TEMP"), path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", tempHash + ".TEMP")), // Use the staging one (for mod compat - one mod can extract, patch and build, then the next can patch that one instead)
				fs.copyFile(path.join(process.cwd(), "staging", chunkFolder, tempHash + ".TEMP.meta"), path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", tempHash + ".TEMP.meta"))
			])
		}

		/* ---------------------------------------- Extract TBLU ---------------------------------------- */
		if (!fs.existsSync(path.join(process.cwd(), "staging", chunkFolder, tbluHash + ".TBLU"))) {
			await callRPKGFunction(`-extract_from_rpkg "${path.join(config.runtimePath, tbluRPKG + ".rpkg")}" -filter "${tbluHash}" -output_path "${assignedTemporaryDirectory}"`)
		} else {
			try {
				fs.ensureDirSync(path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU"))
			} catch {}
			await Promise.all([
				fs.copyFile(path.join(process.cwd(), "staging", chunkFolder, tbluHash + ".TBLU"), path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", tbluHash + ".TBLU")), // Use the staging one (for mod compat - one mod can extract, patch and build, then the next can patch that one instead)
				fs.copyFile(path.join(process.cwd(), "staging", chunkFolder, tbluHash + ".TBLU.meta"), path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", tbluHash + ".TBLU.meta"))
			])
		}

		/* ------------------------------------ Convert to RT Source ------------------------------------ */
		await Promise.all([
			execCommand(
				'"' +
					path.join(process.cwd(), "Third-Party", "ResourceTool.exe") +
					'" HM3 convert TEMP "' +
					path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", tempHash + ".TEMP") +
					'" "' +
					path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", tempHash + ".TEMP") +
					'.json" --simple'
			),
			execCommand(
				'"' +
					path.join(process.cwd(), "Third-Party", "ResourceTool.exe") +
					'" HM3 convert TBLU "' +
					path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", tbluHash + ".TBLU") +
					'" "' +
					path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", tbluHash + ".TBLU") +
					'.json" --simple'
			)
		])
		await callRPKGFunction(`-hash_meta_to_json "${path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", tempHash + ".TEMP.meta")}"`)
		await callRPKGFunction(`-hash_meta_to_json "${path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", tbluHash + ".TBLU.meta")}"`) // Generate the RT files from the binary files

		/* ---------------------------------------- Convert to QN --------------------------------------- */
		if (Number(patches[0].patchVersion.value) < 3) {
			await getQuickEntityFromPatchVersion(patches[0].patchVersion.value).convert(
				"HM3",
				"ids",
				path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", tempHash + ".TEMP.json"),
				path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", tempHash + ".TEMP.meta.JSON"),
				path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", tbluHash + ".TBLU.json"),
				path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", tbluHash + ".TBLU.meta.JSON"),
				// @ts-expect-error Two different versions of the same function; TypeScript doesn't have a way of overloading a "type-only" function
				path.join(process.cwd(), assignedTemporaryDirectory, "QuickEntityJSON.json")
			) // Generate the QN json from the RT files
		} else {
			await getQuickEntityFromPatchVersion(patches[0].patchVersion.value).convert(
				"HM3",
				path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", tempHash + ".TEMP.json"),
				path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", tempHash + ".TEMP.meta.JSON"),
				path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", tbluHash + ".TBLU.json"),
				path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", tbluHash + ".TBLU.meta.JSON"),
				path.join(process.cwd(), assignedTemporaryDirectory, "QuickEntityJSON.json")
			) // Generate the QN json from the RT files
		}

		for (const patch of patches) {
			await logger.debug("Applying patch " + patch.path)

			if (!getQuickEntityFromPatchVersion(patch.patchVersion.value)) {
				rpkgInstance.exit()
				fs.removeSync(path.join(process.cwd(), assignedTemporaryDirectory))

				await logger.error("Could not find matching QuickEntity version for patch version " + Number(patch.patchVersion.value) + "!")
			}

			fs.writeFileSync(path.join(process.cwd(), assignedTemporaryDirectory, "patch.json"), LosslessJSON.stringify(patch))

			/* ----------------------------------------- Apply patch ---------------------------------------- */
			await getQuickEntityFromPatchVersion(patch.patchVersion.value).applyPatchJSON(
				path.join(process.cwd(), assignedTemporaryDirectory, "QuickEntityJSON.json"),
				path.join(process.cwd(), assignedTemporaryDirectory, "patch.json"),
				path.join(process.cwd(), assignedTemporaryDirectory, "PatchedQuickEntityJSON.json")
			) // Patch the QN json
			fs.copySync(path.join(process.cwd(), assignedTemporaryDirectory, "PatchedQuickEntityJSON.json"), path.join(process.cwd(), assignedTemporaryDirectory, "QuickEntityJSON.json"))
		}

		/* ------------------------------------ Convert to RT Source ------------------------------------ */
		await getQuickEntityFromPatchVersion(patches[0].patchVersion.value).generate(
			"HM3",
			path.join(process.cwd(), assignedTemporaryDirectory, "QuickEntityJSON.json"),
			path.join(process.cwd(), assignedTemporaryDirectory, "temp.TEMP.json"),
			path.join(process.cwd(), assignedTemporaryDirectory, tempHash + ".TEMP.meta.JSON"),
			path.join(process.cwd(), assignedTemporaryDirectory, "temp.TBLU.json"),
			path.join(process.cwd(), assignedTemporaryDirectory, tbluHash + ".TBLU.meta.JSON")
		) // Generate the RT files from the QN json

		/* -------------------------------------- Convert to binary ------------------------------------- */
		await Promise.all([
			execCommand(
				'"' +
					path.join(process.cwd(), "Third-Party", "ResourceTool.exe") +
					'" HM3 generate TEMP "' +
					path.join(process.cwd(), assignedTemporaryDirectory, "temp.TEMP.json") +
					'" "' +
					path.join(process.cwd(), assignedTemporaryDirectory, tempHash + ".TEMP") +
					'" --simple'
			),
			execCommand(
				'"' +
					path.join(process.cwd(), "Third-Party", "ResourceTool.exe") +
					'" HM3 generate TBLU "' +
					path.join(process.cwd(), assignedTemporaryDirectory, "temp.TBLU.json") +
					'" "' +
					path.join(process.cwd(), assignedTemporaryDirectory, tbluHash + ".TBLU") +
					'" --simple'
			)
		])
		await callRPKGFunction(`-json_to_hash_meta "${path.join(process.cwd(), assignedTemporaryDirectory, tempHash + ".TEMP.meta.JSON")}"`)
		await callRPKGFunction(`-json_to_hash_meta "${path.join(process.cwd(), assignedTemporaryDirectory, tbluHash + ".TBLU.meta.JSON")}"`) // Generate the binary files from the RT json

		await Promise.all([
			fs.rm(path.join(process.cwd(), assignedTemporaryDirectory, "QuickEntityJSON.json")),
			fs.rm(path.join(process.cwd(), assignedTemporaryDirectory, "temp.TEMP.json")),
			fs.rm(path.join(process.cwd(), assignedTemporaryDirectory, tempHash + ".TEMP.meta.JSON")),
			fs.rm(path.join(process.cwd(), assignedTemporaryDirectory, "temp.TBLU.json")),
			fs.rm(path.join(process.cwd(), assignedTemporaryDirectory, tbluHash + ".TBLU.meta.JSON"))
		])

		rpkgInstance.exit()

		await copyToCache(cacheFolder, path.join(process.cwd(), assignedTemporaryDirectory), path.join(chunkFolder, await xxhash3(patches[patches.length - 1].path)))
	} else {
		await logger.debug("Restored patch chain ending in " + patches[patches.length - 1].path + " from cache")
	}

	/* ------------------------------------- Stage binary files ------------------------------------- */
	await Promise.all([
		fs.copyFile(path.join(process.cwd(), assignedTemporaryDirectory, tempHash + ".TEMP"), path.join(process.cwd(), "staging", chunkFolder, tempHash + ".TEMP")),
		fs.copyFile(path.join(process.cwd(), assignedTemporaryDirectory, tempHash + ".TEMP.meta"), path.join(process.cwd(), "staging", chunkFolder, tempHash + ".TEMP.meta")),
		fs.copyFile(path.join(process.cwd(), assignedTemporaryDirectory, tbluHash + ".TBLU"), path.join(process.cwd(), "staging", chunkFolder, tbluHash + ".TBLU")),
		fs.copyFile(path.join(process.cwd(), assignedTemporaryDirectory, tbluHash + ".TBLU.meta"), path.join(process.cwd(), "staging", chunkFolder, tbluHash + ".TBLU.meta")) // Copy the binary files to the staging directory
	])

	fs.removeSync(path.join(process.cwd(), assignedTemporaryDirectory))

	return
}
