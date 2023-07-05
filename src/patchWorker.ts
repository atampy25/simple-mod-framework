import { config, logger } from "./core-singleton"
import { copyFromCache, copyToCache, fastParse, getQuickEntityFromPatchVersion, stringify } from "./utils"

import RPKGInstance from "./rpkg"
import child_process from "child_process"
import fs from "fs-extra"
import path from "path"
import { xxhash3 } from "hash-wasm"

require("clarify")

const execCommand = function (command: string) {
	void logger.verbose(`Executing command ${command}`)
	return new Promise((resolve, reject) => {
		const x = child_process.exec(command)
		x.stdout?.pipe(process.stdout)
		x.stderr?.pipe(process.stderr)
		x.on("close", resolve)
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

	patches = patches.map((a) => fastParse(a))

	if (
		!(
			patches.every((patch) => !invalidatedData.some((a) => a.filePath === patch.path)) &&
			(await copyFromCache(cacheFolder, path.join(chunkFolder, await xxhash3(patches[patches.length - 1].path)), path.join(process.cwd(), assignedTemporaryDirectory)))
		)
	) {
		const rpkgInstance = new RPKGInstance()

		await rpkgInstance.waitForInitialised()

		const callRPKGFunction = async function (command: string) {
			await logger.verbose(`Executing RPKG function ${command}`)
			return await rpkgInstance.callFunction(command)
		}

		/* ---------------------------------------- Extract TEMP ---------------------------------------- */
		if (!fs.existsSync(path.join(process.cwd(), "staging", chunkFolder, `${tempHash}.TEMP`))) {
			await callRPKGFunction(`-extract_from_rpkg "${path.join(config.runtimePath, `${tempRPKG}.rpkg`)}" -filter "${tempHash}" -output_path "${assignedTemporaryDirectory}"`)
		} else {
			try {
				fs.ensureDirSync(path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP"))
			} catch {}
			await Promise.all([
				fs.copyFile(path.join(process.cwd(), "staging", chunkFolder, `${tempHash}.TEMP`), path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", `${tempHash}.TEMP`)), // Use the staging one (for mod compat - one mod can extract, patch and build, then the next can patch that one instead)
				fs.copyFile(path.join(process.cwd(), "staging", chunkFolder, `${tempHash}.TEMP.meta`), path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", `${tempHash}.TEMP.meta`))
			])
		}

		/* ---------------------------------------- Extract TBLU ---------------------------------------- */
		if (!fs.existsSync(path.join(process.cwd(), "staging", chunkFolder, `${tbluHash}.TBLU`))) {
			await callRPKGFunction(`-extract_from_rpkg "${path.join(config.runtimePath, `${tbluRPKG}.rpkg`)}" -filter "${tbluHash}" -output_path "${assignedTemporaryDirectory}"`)
		} else {
			try {
				fs.ensureDirSync(path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU"))
			} catch {}
			await Promise.all([
				fs.copyFile(path.join(process.cwd(), "staging", chunkFolder, `${tbluHash}.TBLU`), path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", `${tbluHash}.TBLU`)), // Use the staging one (for mod compat - one mod can extract, patch and build, then the next can patch that one instead)
				fs.copyFile(path.join(process.cwd(), "staging", chunkFolder, `${tbluHash}.TBLU.meta`), path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", `${tbluHash}.TBLU.meta`))
			])
		}

		/* ------------------------------------ Convert to RT Source ------------------------------------ */
		await Promise.all([
			execCommand(
				`"${path.join(process.cwd(), "Third-Party", "ResourceTool.exe")}" HM3 convert TEMP "${path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", `${tempHash}.TEMP`)}" "${path.join(
					process.cwd(),
					assignedTemporaryDirectory,
					tempRPKG,
					"TEMP",
					`${tempHash}.TEMP`
				)}.json" --simple`
			),
			execCommand(
				`"${path.join(process.cwd(), "Third-Party", "ResourceTool.exe")}" HM3 convert TBLU "${path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", `${tbluHash}.TBLU`)}" "${path.join(
					process.cwd(),
					assignedTemporaryDirectory,
					tbluRPKG,
					"TBLU",
					`${tbluHash}.TBLU`
				)}.json" --simple`
			)
		])
		await callRPKGFunction(`-hash_meta_to_json "${path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", `${tempHash}.TEMP.meta`)}"`)
		await callRPKGFunction(`-hash_meta_to_json "${path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", `${tbluHash}.TBLU.meta`)}"`) // Generate the RT files from the binary files

		await logger.debug(`Applying patches: ${patches.map((patch) => patch.path).join(", ")}`)

		const patchPaths = []
		for (const patch of patches) {
			fs.writeFileSync(path.join(process.cwd(), assignedTemporaryDirectory, `patch${patchPaths.length}.json`), stringify(patch))
			patchPaths.push(path.join(process.cwd(), assignedTemporaryDirectory, `patch${patchPaths.length}.json`))
		}

		await getQuickEntityFromPatchVersion(patches[0].patchVersion.toString()).convertPatchGenerate(
			path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", `${tempHash}.TEMP.json`),
			path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", `${tempHash}.TEMP.meta.JSON`),
			path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", `${tbluHash}.TBLU.json`),
			path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", `${tbluHash}.TBLU.meta.JSON`),
			patchPaths,
			path.join(process.cwd(), assignedTemporaryDirectory, "temp.TEMP.json"),
			path.join(process.cwd(), assignedTemporaryDirectory, `${tempHash}.TEMP.meta.JSON`),
			path.join(process.cwd(), assignedTemporaryDirectory, "temp.TBLU.json"),
			path.join(process.cwd(), assignedTemporaryDirectory, `${tbluHash}.TBLU.meta.JSON`)
		)

		/* -------------------------------------- Convert to binary ------------------------------------- */
		await Promise.all([
			execCommand(
				`"${path.join(process.cwd(), "Third-Party", "ResourceTool.exe")}" HM3 generate TEMP "${path.join(process.cwd(), assignedTemporaryDirectory, "temp.TEMP.json")}" "${path.join(
					process.cwd(),
					assignedTemporaryDirectory,
					`${tempHash}.TEMP`
				)}" --simple`
			),
			execCommand(
				`"${path.join(process.cwd(), "Third-Party", "ResourceTool.exe")}" HM3 generate TBLU "${path.join(process.cwd(), assignedTemporaryDirectory, "temp.TBLU.json")}" "${path.join(
					process.cwd(),
					assignedTemporaryDirectory,
					`${tbluHash}.TBLU`
				)}" --simple`
			)
		])
		await callRPKGFunction(`-json_to_hash_meta "${path.join(process.cwd(), assignedTemporaryDirectory, `${tempHash}.TEMP.meta.JSON`)}"`)
		await callRPKGFunction(`-json_to_hash_meta "${path.join(process.cwd(), assignedTemporaryDirectory, `${tbluHash}.TBLU.meta.JSON`)}"`) // Generate the binary files from the RT json

		await Promise.all([
			fs.rm(path.join(process.cwd(), assignedTemporaryDirectory, "temp.TEMP.json")),
			fs.rm(path.join(process.cwd(), assignedTemporaryDirectory, `${tempHash}.TEMP.meta.JSON`)),
			fs.rm(path.join(process.cwd(), assignedTemporaryDirectory, "temp.TBLU.json")),
			fs.rm(path.join(process.cwd(), assignedTemporaryDirectory, `${tbluHash}.TBLU.meta.JSON`))
		])

		rpkgInstance.exit()

		await copyToCache(cacheFolder, path.join(process.cwd(), assignedTemporaryDirectory), path.join(chunkFolder, await xxhash3(patches[patches.length - 1].path)))
	} else {
		await logger.debug(`Restored patch chain ending in ${patches[patches.length - 1].path} from cache`)
	}

	/* ------------------------------------- Stage binary files ------------------------------------- */
	await Promise.all([
		fs.copyFile(path.join(process.cwd(), assignedTemporaryDirectory, `${tempHash}.TEMP`), path.join(process.cwd(), "staging", chunkFolder, `${tempHash}.TEMP`)),
		fs.copyFile(path.join(process.cwd(), assignedTemporaryDirectory, `${tempHash}.TEMP.meta`), path.join(process.cwd(), "staging", chunkFolder, `${tempHash}.TEMP.meta`)),
		fs.copyFile(path.join(process.cwd(), assignedTemporaryDirectory, `${tbluHash}.TBLU`), path.join(process.cwd(), "staging", chunkFolder, `${tbluHash}.TBLU`)),
		fs.copyFile(path.join(process.cwd(), assignedTemporaryDirectory, `${tbluHash}.TBLU.meta`), path.join(process.cwd(), "staging", chunkFolder, `${tbluHash}.TBLU.meta`)) // Copy the binary files to the staging directory
	])

	fs.removeSync(path.join(process.cwd(), assignedTemporaryDirectory))

	return
}
