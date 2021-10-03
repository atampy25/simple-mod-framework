THREE = require("./three.min")
const QuickEntity = require("./quickentity")
const RPKG = require("./rpkg")
const config = require("./config")

const fs = require("fs")
const path = require("path")
const emptyFolder = require("empty-folder")
const { promisify } = require("util")
const child_process = require("child_process")
const LosslessJSON = require("lossless-json")

const rpkgInstance = new RPKG.RPKGInstance()

async function stageAllMods() {
    await rpkgInstance.waitForInitialised()

    try {
        await promisify(emptyFolder)("staging", true)
    } catch {}

    try {
        await promisify(emptyFolder)("temp", true)
    } catch {}

    try {
        await promisify(emptyFolder)("Output", true)
    } catch {}

    fs.mkdirSync("staging")
    fs.mkdirSync("temp")
    fs.mkdirSync("Output")

    var packagedefinition = []
    var undelete = []

    for (let mod of config.loadOrder) {
        let manifest = JSON.parse(fs.readFileSync(path.join(".", "Mods", mod, "manifest.json")))
        for (let chunkFolder of fs.readdirSync(path.join(".", "Mods", mod, manifest.contentFolder))) {
            try {
                fs.mkdirSync(path.join("staging", chunkFolder))
            } catch {}

            for (let contentFile of fs.readdirSync(path.join(".", "Mods", mod, manifest.contentFolder, chunkFolder))) {
                var contentType = contentFile.split(".").slice(1).join(".")
                var contentFilePath = path.join(".", "Mods", mod, manifest.contentFolder, chunkFolder, contentFile)

                switch (contentType) {
                    case "entity.json":
                        var entityContent = LosslessJSON.parse(String(fs.readFileSync(contentFilePath)))
                        await QuickEntity.generate("HM3", contentFilePath,
                                                    path.join(".", "temp", "temp.TEMP.json"),
                                                    path.join(".", "temp", "temp.TEMP.meta.json"),
                                                    path.join(".", "temp", "temp.TBLU.json"),
                                                    path.join(".", "temp", "temp.TBLU.meta.json")) // Generate the RT files from the QN json
                        
                        child_process.execSync("ResourceTool.exe HM3 generate TEMP \"" + path.join(".", "temp", "temp.TEMP.json") + "\" \"" + path.join(".", "temp", "temp.TEMP") + "\" --simple")
                        child_process.execSync("ResourceTool.exe HM3 generate TBLU \"" + path.join(".", "temp", "temp.TBLU.json") + "\" \"" + path.join(".", "temp", "temp.TBLU") + "\" --simple")
                        await rpkgInstance.callFunction(`-json_to_hash_meta "${path.join(".", "temp", "temp.TEMP.meta.json")}"`)
                        await rpkgInstance.callFunction(`-json_to_hash_meta "${path.join(".", "temp", "temp.TBLU.meta.json")}"`) // Generate the binary files from the RT json

                        fs.copyFileSync(path.join(".", "temp", "temp.TEMP"), path.join("staging", chunkFolder, entityContent.tempHash + ".TEMP"))
                        fs.copyFileSync(path.join(".", "temp", "temp.TEMP.meta"), path.join("staging", chunkFolder, entityContent.tempHash + ".TEMP.meta"))
                        fs.copyFileSync(path.join(".", "temp", "temp.TBLU"), path.join("staging", chunkFolder, entityContent.tempHash + ".TBLU"))
                        fs.copyFileSync(path.join(".", "temp", "temp.TBLU.meta"), path.join("staging", chunkFolder, entityContent.tempHash + ".TBLU.meta")) // Copy the binary files to the staging directory
                        break;
                    case "entity.patch.json":
                        var entityContent = LosslessJSON.parse(String(fs.readFileSync(contentFilePath)))
                        var tempRPKG = await rpkgInstance.getRPKGOfHash(entityContent.tempHash)
                        var tbluRPKG = await rpkgInstance.getRPKGOfHash(entityContent.tbluHash)

                        await rpkgInstance.callFunction(`-extract_from_rpkg "${path.join(config.runtimePath, tempRPKG + ".rpkg")}" -filter "${entityContent.tempHash}" -output_path temp`)
                        await rpkgInstance.callFunction(`-extract_from_rpkg "${path.join(config.runtimePath, tbluRPKG + ".rpkg")}" -filter "${entityContent.tbluHash}" -output_path temp`) // Extract the binary files

                        child_process.execSync("ResourceTool.exe HM3 convert TEMP \"" + path.join("temp", tempRPKG, "TEMP", entityContent.tempHash + ".TEMP") + "\" \"" + path.join("temp", tempRPKG, "TEMP", entityContent.tempHash + ".TEMP") + ".json\" --simple")
                        child_process.execSync("ResourceTool.exe HM3 convert TBLU \"" + path.join("temp", tempRPKG, "TBLU", entityContent.tbluHash + ".TBLU") + "\" \"" + path.join("temp", tempRPKG, "TBLU", entityContent.tbluHash + ".TBLU") + ".json\" --simple")
                        await rpkgInstance.callFunction(`-hash_meta_to_json "${path.join("temp", tempRPKG, "TEMP", entityContent.tempHash + ".TEMP.meta")}"`)
                        await rpkgInstance.callFunction(`-hash_meta_to_json "${path.join("temp", tempRPKG, "TBLU", entityContent.tbluHash + ".TBLU.meta")}"`) // Generate the RT files from the binary files

                        await QuickEntity.convert("HM3", "ids",
                                                path.join("temp", tempRPKG, "TEMP", entityContent.tempHash + ".TEMP.json"),
                                                path.join("temp", tempRPKG, "TEMP", entityContent.tempHash + ".TEMP.meta.json"),
                                                path.join("temp", tempRPKG, "TBLU", entityContent.tbluHash + ".TBLU.json"),
                                                path.join("temp", tempRPKG, "TBLU", entityContent.tbluHash + ".TBLU.meta.json"),
                                                path.join("temp", "QuickEntityJSON.json")) // Generate the QN json from the RT files

                        await QuickEntity.applyPatchJSON(path.join("temp", "QuickEntityJSON.json"), contentFilePath, path.join("temp", "PatchedQuickEntityJSON.json")) // Patch the QN json

                        await QuickEntity.generate("HM3", path.join("temp", "PatchedQuickEntityJSON.json"),
                                                    path.join(".", "temp", "temp.TEMP.json"),
                                                    path.join(".", "temp", "temp.TEMP.meta.json"),
                                                    path.join(".", "temp", "temp.TBLU.json"),
                                                    path.join(".", "temp", "temp.TBLU.meta.json")) // Generate the RT files from the QN json
                        
                        child_process.execSync("ResourceTool.exe HM3 generate TEMP \"" + path.join(".", "temp", "temp.TEMP.json") + "\" \"" + path.join(".", "temp", "temp.TEMP") + "\" --simple")
                        child_process.execSync("ResourceTool.exe HM3 generate TBLU \"" + path.join(".", "temp", "temp.TBLU.json") + "\" \"" + path.join(".", "temp", "temp.TBLU") + "\" --simple")
                        await rpkgInstance.callFunction(`-json_to_hash_meta "${path.join(".", "temp", "temp.TEMP.meta.json")}"`)
                        await rpkgInstance.callFunction(`-json_to_hash_meta "${path.join(".", "temp", "temp.TBLU.meta.json")}"`) // Generate the binary files from the RT json

                        fs.copyFileSync(path.join(".", "temp", "temp.TEMP"), path.join("staging", chunkFolder, entityContent.tempHash + ".TEMP"))
                        fs.copyFileSync(path.join(".", "temp", "temp.TEMP.meta"), path.join("staging", chunkFolder, entityContent.tempHash + ".TEMP.meta"))
                        fs.copyFileSync(path.join(".", "temp", "temp.TBLU"), path.join("staging", chunkFolder, entityContent.tbluHash + ".TBLU"))
                        fs.copyFileSync(path.join(".", "temp", "temp.TBLU.meta"), path.join("staging", chunkFolder, entityContent.tbluHash + ".TBLU.meta")) // Copy the binary files to the staging directory
                        break;
                    default:
                        fs.copyFileSync(contentFilePath, path.join("staging", chunkFolder, contentFile)) // Copy the file to the staging directory
                        break;
                }

                try {
                    await promisify(emptyFolder)("temp", true)
                } catch {}
                fs.mkdirSync("temp") // Clear the temp directory
            }
        } // Content

        packagedefinition.push(...manifest.packagedefinition)
        undelete.push(...manifest.undelete)
    }

    await rpkgInstance.callFunction(`-decrypt_packagedefinition_thumbs "${path.join(config.runtimePath, "packagedefinition.txt")}" -output_path "${path.join(".", "temp")}"`)
    fs.writeFileSync(path.join(".", "temp", "packagedefinition.txt.decrypted"), String(fs.readFileSync(path.join(".", "temp", "packagedefinition.txt.decrypted"))).replace(/patchlevel=[0-9]*/g, "patchlevel=10001"))
    await rpkgInstance.callFunction(`-encrypt_packagedefinition_thumbs "${path.join(".", "temp", "packagedefinition.txt.decrypted")}" -output_path "${path.join(".", "temp")}"`)

    await rpkgInstance.callFunction(`-decrypt_packagedefinition_thumbs "${path.join(config.runtimePath, "..", "Retail", "thumbs.dat")}" -output_path "${path.join(".", "temp")}"`)
    fs.writeFileSync(path.join(".", "temp", "thumbs.dat.decrypted"), String(fs.readFileSync(path.join(".", "temp", "thumbs.dat.decrypted"))).replace("Boot.entity", "MainMenu.entity"))
    await rpkgInstance.callFunction(`-encrypt_packagedefinition_thumbs "${path.join(".", "temp", "thumbs.dat.decrypted")}" -output_path "${path.join(".", "temp")}"`)

    fs.copyFileSync(path.join(".", "temp", "packagedefinition.txt.decrypted.encrypted"), path.join(".", "Output", "packagedefinition.txt"))
    fs.copyFileSync(path.join(".", "temp", "thumbs.dat.decrypted.encrypted"), path.join(".", "Output", "thumbs.dat"))

    try {
        await promisify(emptyFolder)("temp", true)
    } catch {}
    fs.mkdirSync("temp")

    for (let stagingChunkFolder of fs.readdirSync(path.join(".", "staging"))) {
        await rpkgInstance.callFunction(`-generate_rpkg_from "${path.join(".", "staging", stagingChunkFolder)}" -output_path "${path.join(".", "staging")}"`)
        fs.copyFileSync(path.join(".", "staging", stagingChunkFolder + ".rpkg"), path.join(".", "Output", stagingChunkFolder + "patch200.rpkg"))
    }
}

stageAllMods()