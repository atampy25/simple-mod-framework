THREE = require("./three-onlymath.min")
const QuickEntity = {
    "0": require("./quickentity1136"),
    "3": require("./quickentity20"),
    "4": require("./quickentity"),
	
    "999": require("./quickentity")
}
const RPKG = require("./rpkg")
const fs = require("fs-extra")
const path = require("path")
const child_process = require("child_process")
const json5 = require("json5")
require("clarify")

const config = json5.parse(String(fs.readFileSync(path.join(process.cwd(), "config.json"))))

module.exports = async ({
	contentFilePath,
	chunkFolder,
	assignedTemporaryDirectory,
	entityContent,
	tempRPKG,
	tbluRPKG
}) => {
	try {
		console.log("Applying patch " + contentFilePath)

		fs.ensureDirSync(path.join(process.cwd(), assignedTemporaryDirectory))

		let rpkgInstance = new RPKG.RPKGInstance()

		await rpkgInstance.waitForInitialised()

		if (!QuickEntity[Object.keys(QuickEntity)[Object.keys(QuickEntity).findIndex(a=> parseFloat(a) > entityContent.patchVersion) - 1]]) {
			console.log("Error: could not find matching QuickEntity version for patch version " + entityContent.patchVersion)
		}

		/* ---------------------------------------- Extract TEMP ---------------------------------------- */
		if (!fs.existsSync(path.join(process.cwd(), "staging", chunkFolder, entityContent.tempHash + ".TEMP"))) {
			await rpkgInstance.callFunction(`-extract_from_rpkg "${path.join(config.runtimePath, tempRPKG + ".rpkg")}" -filter "${entityContent.tempHash}" -output_path "${assignedTemporaryDirectory}"`)
		} else {
			try {
				fs.mkdirSync(path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP"), {
					recursive: true
				})
			} catch {}
			fs.copyFileSync(path.join(process.cwd(), "staging", chunkFolder, entityContent.tempHash + ".TEMP"), path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", entityContent.tempHash + ".TEMP")) // Use the staging one (for mod compat - one mod can extract, patch and build, then the next can patch that one instead)
			fs.copyFileSync(path.join(process.cwd(), "staging", chunkFolder, entityContent.tempHash + ".TEMP.meta"), path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", entityContent.tempHash + ".TEMP.meta"))
		}

		/* ---------------------------------------- Extract TBLU ---------------------------------------- */
		if (!fs.existsSync(path.join(process.cwd(), "staging", chunkFolder, entityContent.tbluHash + ".TBLU"))) {
			await rpkgInstance.callFunction(`-extract_from_rpkg "${path.join(config.runtimePath, tbluRPKG + ".rpkg")}" -filter "${entityContent.tbluHash}" -output_path "${assignedTemporaryDirectory}"`)
		} else {
			try {
				fs.mkdirSync(path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TBLU"), {
					recursive: true
				})
			} catch {}
			fs.copyFileSync(path.join(process.cwd(), "staging", chunkFolder, entityContent.tbluHash + ".TBLU"), path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", entityContent.tbluHash + ".TBLU")) // Use the staging one (for mod compat - one mod can extract, patch and build, then the next can patch that one instead)
			fs.copyFileSync(path.join(process.cwd(), "staging", chunkFolder, entityContent.tbluHash + ".TBLU.meta"), path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", entityContent.tbluHash + ".TBLU.meta"))
		}

		/* ------------------------------------ Convert to RT Source ------------------------------------ */
		child_process.execSync("\"" + path.join(process.cwd(), "Third-Party", "ResourceTool.exe") + "\" HM3 convert TEMP \"" + path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", entityContent.tempHash + ".TEMP") + "\" \"" + path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", entityContent.tempHash + ".TEMP") + ".json\" --simple")
		child_process.execSync("\"" + path.join(process.cwd(), "Third-Party", "ResourceTool.exe") + "\" HM3 convert TBLU \"" + path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", entityContent.tbluHash + ".TBLU") + "\" \"" + path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", entityContent.tbluHash + ".TBLU") + ".json\" --simple")
		await rpkgInstance.callFunction(`-hash_meta_to_json "${path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", entityContent.tempHash + ".TEMP.meta")}"`)
		await rpkgInstance.callFunction(`-hash_meta_to_json "${path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", entityContent.tbluHash + ".TBLU.meta")}"`) // Generate the RT files from the binary files


		/* ---------------------------------------- Convert to QN --------------------------------------- */
		if (entityContent.patchVersion < 3) {
			await (QuickEntity[Object.keys(QuickEntity)[Object.keys(QuickEntity).findIndex(a=> parseFloat(a) > entityContent.patchVersion) - 1]]).convert("HM3", "ids",
				path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", entityContent.tempHash + ".TEMP.json"),
				path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", entityContent.tempHash + ".TEMP.meta.json"),
				path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", entityContent.tbluHash + ".TBLU.json"),
				path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", entityContent.tbluHash + ".TBLU.meta.json"),
				path.join(process.cwd(), assignedTemporaryDirectory, "QuickEntityJSON.json")) // Generate the QN json from the RT files
		} else {
			await (QuickEntity[Object.keys(QuickEntity)[Object.keys(QuickEntity).findIndex(a=> parseFloat(a) > entityContent.patchVersion) - 1]]).convert("HM3",
				path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", entityContent.tempHash + ".TEMP.json"),
				path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", entityContent.tempHash + ".TEMP.meta.json"),
				path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", entityContent.tbluHash + ".TBLU.json"),
				path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", entityContent.tbluHash + ".TBLU.meta.json"),
				path.join(process.cwd(), assignedTemporaryDirectory, "QuickEntityJSON.json")) // Generate the QN json from the RT files
		}

		/* ----------------------------------------- Apply patch ---------------------------------------- */
		await (QuickEntity[Object.keys(QuickEntity)[Object.keys(QuickEntity).findIndex(a=> parseFloat(a) > entityContent.patchVersion) - 1]]).applyPatchJSON(path.join(process.cwd(), assignedTemporaryDirectory, "QuickEntityJSON.json"), contentFilePath, path.join(process.cwd(), assignedTemporaryDirectory, "PatchedQuickEntityJSON.json")) // Patch the QN json

		/* ------------------------------------ Convert to RT Source ------------------------------------ */
		await (QuickEntity[Object.keys(QuickEntity)[Object.keys(QuickEntity).findIndex(a=> parseFloat(a) > entityContent.patchVersion) - 1]]).generate("HM3", path.join(process.cwd(), assignedTemporaryDirectory, "PatchedQuickEntityJSON.json"),
			path.join(process.cwd(), assignedTemporaryDirectory, "temp.TEMP.json"),
			path.join(process.cwd(), assignedTemporaryDirectory, "temp.TEMP.meta.json"),
			path.join(process.cwd(), assignedTemporaryDirectory, "temp.TBLU.json"),
			path.join(process.cwd(), assignedTemporaryDirectory, "temp.TBLU.meta.json")) // Generate the RT files from the QN json

		/* -------------------------------------- Convert to binary ------------------------------------- */
		child_process.execSync("\"" + path.join(process.cwd(), "Third-Party", "ResourceTool.exe") + "\" HM3 generate TEMP \"" + path.join(process.cwd(), assignedTemporaryDirectory, "temp.TEMP.json") + "\" \"" + path.join(process.cwd(), assignedTemporaryDirectory, "temp.TEMP") + "\" --simple")
		child_process.execSync("\"" + path.join(process.cwd(), "Third-Party", "ResourceTool.exe") + "\" HM3 generate TBLU \"" + path.join(process.cwd(), assignedTemporaryDirectory, "temp.TBLU.json") + "\" \"" + path.join(process.cwd(), assignedTemporaryDirectory, "temp.TBLU") + "\" --simple")
		await rpkgInstance.callFunction(`-json_to_hash_meta "${path.join(process.cwd(), assignedTemporaryDirectory, "temp.TEMP.meta.json")}"`)
		await rpkgInstance.callFunction(`-json_to_hash_meta "${path.join(process.cwd(), assignedTemporaryDirectory, "temp.TBLU.meta.json")}"`) // Generate the binary files from the RT json

		/* ------------------------------------- Stage binary files ------------------------------------- */
		fs.copyFileSync(path.join(process.cwd(), assignedTemporaryDirectory, "temp.TEMP"), path.join(process.cwd(), "staging", chunkFolder, entityContent.tempHash + ".TEMP"))
		fs.copyFileSync(path.join(process.cwd(), assignedTemporaryDirectory, "temp.TEMP.meta"), path.join(process.cwd(), "staging", chunkFolder, entityContent.tempHash + ".TEMP.meta"))
		fs.copyFileSync(path.join(process.cwd(), assignedTemporaryDirectory, "temp.TBLU"), path.join(process.cwd(), "staging", chunkFolder, entityContent.tbluHash + ".TBLU"))
		fs.copyFileSync(path.join(process.cwd(), assignedTemporaryDirectory, "temp.TBLU.meta"), path.join(process.cwd(), "staging", chunkFolder, entityContent.tbluHash + ".TBLU.meta")) // Copy the binary files to the staging directory

		fs.removeSync(path.join(process.cwd(), assignedTemporaryDirectory))

		rpkgInstance.exit()
	} catch (e) {
		if (!String(e).includes("SIGTERM")) console.log("Error in patch worker: " + e)
	}

	return
};