const FrameworkVersion = 0.3

THREE = require("./three.min")
const QuickEntity = require("./quickentity")
const RPKG = require("./rpkg")

const fs = require("fs")
const path = require("path")
const emptyFolder = require("empty-folder")
const { promisify } = require("util")
const child_process = require("child_process")
const LosslessJSON = require("lossless-json")

const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), "config.json")))

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

    var rpkgTypes = {}

    for (let mod of config.loadOrder) {
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

                var allFiles = []

                for (let file of fs.readdirSync(path.join(process.cwd(), "temp"))) {
                    if (fs.statSync(path.join(process.cwd(), "temp", file)).isDirectory()) {
                        for (let file2 of fs.readdirSync(path.join(process.cwd(), "temp", file))) {
                            if (fs.statSync(path.join(process.cwd(), "temp", file, file2)).isDirectory()) {
                                for (let file3 of fs.readdirSync(path.join(process.cwd(), "temp", file, file2))) {
                                    if (fs.statSync(path.join(process.cwd(), "temp", file, file2, file3)).isDirectory()) {
                                        for (let file4 of fs.readdirSync(path.join(process.cwd(), "temp", file, file2, file3))) {
                                            allFiles.push(path.join(process.cwd(), "temp", file, file2, file3, file4))
                                        }
                                    } else {
                                        allFiles.push(path.join(process.cwd(), "temp", file, file2, file3))
                                    }
                                }
                            } else {
                                allFiles.push(path.join(process.cwd(), "temp", file, file2))
                            }
                        }
                    } else {
                        allFiles.push(path.join(process.cwd(), "temp", file))
                    }
                }

                allFiles.forEach(a=>fs.copyFileSync(a, path.join(process.cwd(), "staging", chunkFolder, path.basename(a))))

                try {
                    await promisify(emptyFolder)("temp", true)
                } catch {}
                fs.mkdirSync("temp") // Clear the temp directory
            }
        } else {
            let manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), "Mods", mod, "manifest.json")))
            for (let chunkFolder of fs.readdirSync(path.join(process.cwd(), "Mods", mod, manifest.contentFolder))) {
                try {
                    fs.mkdirSync(path.join(process.cwd(), "staging", chunkFolder))
                } catch {}
    
                for (let contentFile of fs.readdirSync(path.join(process.cwd(), "Mods", mod, manifest.contentFolder, chunkFolder))) {
                    var contentType = contentFile.split(".").slice(1).join(".")
                    var contentFilePath = path.join(process.cwd(), "Mods", mod, manifest.contentFolder, chunkFolder, contentFile)
    
                    switch (contentType) {
                        case "entity.json":
                            var entityContent = LosslessJSON.parse(String(fs.readFileSync(contentFilePath)))
                            await QuickEntity.generate("HM3", contentFilePath,
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
                            var entityContent = LosslessJSON.parse(String(fs.readFileSync(contentFilePath)))
                            var tempRPKG = await rpkgInstance.getRPKGOfHash(entityContent.tempHash)
                            var tbluRPKG = await rpkgInstance.getRPKGOfHash(entityContent.tbluHash)
    
                            await rpkgInstance.callFunction(`-extract_from_rpkg "${path.join(config.runtimePath, tempRPKG + ".rpkg")}" -filter "${entityContent.tempHash}" -output_path temp`)
                            await rpkgInstance.callFunction(`-extract_from_rpkg "${path.join(config.runtimePath, tbluRPKG + ".rpkg")}" -filter "${entityContent.tbluHash}" -output_path temp`) // Extract the binary files
    
                            child_process.execSync("\"Third-Party\\ResourceTool.exe\" HM3 convert TEMP \"" + path.join(process.cwd(), "temp", tempRPKG, "TEMP", entityContent.tempHash + ".TEMP") + "\" \"" + path.join(process.cwd(), "temp", tempRPKG, "TEMP", entityContent.tempHash + ".TEMP") + ".json\" --simple")
                            child_process.execSync("\"Third-Party\\ResourceTool.exe\" HM3 convert TBLU \"" + path.join(process.cwd(), "temp", tempRPKG, "TBLU", entityContent.tbluHash + ".TBLU") + "\" \"" + path.join(process.cwd(), "temp", tempRPKG, "TBLU", entityContent.tbluHash + ".TBLU") + ".json\" --simple")
                            await rpkgInstance.callFunction(`-hash_meta_to_json "${path.join(process.cwd(), "temp", tempRPKG, "TEMP", entityContent.tempHash + ".TEMP.meta")}"`)
                            await rpkgInstance.callFunction(`-hash_meta_to_json "${path.join(process.cwd(), "temp", tempRPKG, "TBLU", entityContent.tbluHash + ".TBLU.meta")}"`) // Generate the RT files from the binary files
    
                            await QuickEntity.convert("HM3", "ids",
                                                    path.join(process.cwd(), "temp", tempRPKG, "TEMP", entityContent.tempHash + ".TEMP.json"),
                                                    path.join(process.cwd(), "temp", tempRPKG, "TEMP", entityContent.tempHash + ".TEMP.meta.json"),
                                                    path.join(process.cwd(), "temp", tempRPKG, "TBLU", entityContent.tbluHash + ".TBLU.json"),
                                                    path.join(process.cwd(), "temp", tempRPKG, "TBLU", entityContent.tbluHash + ".TBLU.meta.json"),
                                                    path.join(process.cwd(), "temp", "QuickEntityJSON.json")) // Generate the QN json from the RT files
    
                            await QuickEntity.applyPatchJSON(path.join(process.cwd(), "temp", "QuickEntityJSON.json"), contentFilePath, path.join(process.cwd(), "temp", "PatchedQuickEntityJSON.json")) // Patch the QN json
    
                            await QuickEntity.generate("HM3", path.join(process.cwd(), "temp", "PatchedQuickEntityJSON.json"),
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
                        default:
                            fs.copyFileSync(contentFilePath, path.join(process.cwd(), "staging", chunkFolder, contentFile)) // Copy the file to the staging directory
                            break;
                    }
    
                    try {
                        await promisify(emptyFolder)("temp", true)
                    } catch {}
                    fs.mkdirSync("temp") // Clear the temp directory
                }
    
                if (fs.existsSync(path.join(process.cwd(), "Mods", mod, manifest.contentFolder, chunkFolder, chunkFolder + ".meta"))) {
                    fs.copyFileSync(path.join(process.cwd(), "Mods", mod, manifest.contentFolder, chunkFolder, chunkFolder + ".meta"), path.join(process.cwd(), "staging", chunkFolder, chunkFolder + ".meta"))
                    rpkgTypes[chunkFolder] = "base"
                } else {
                    rpkgTypes[chunkFolder] = "patch"
                } // Copy chunk meta to staging folder if there is one (adds support for custom chunks)
            } // Content
    
            packagedefinition.push(...manifest.packagedefinition)
            undelete.push(...manifest.undelete)
        }
    }

    if (!fs.existsSync(path.join(process.cwd(), "cleanPackageDefinition.txt"))) {
        fs.copyFileSync(path.join(config.runtimePath, "packagedefinition.txt"), path.join(process.cwd(), "cleanPackageDefinition.txt"))
    }

    child_process.execSync(`"Third-Party\\h6xtea.exe" -d --src "${path.join(config.runtimePath, "packagedefinition.txt")}" --dst "${path.join(process.cwd(), "temp", "packagedefinitionVersionCheck.txt")}"`)
    if (!String(fs.readFileSync(path.join(process.cwd(), "temp", "packagedefinitionVersionCheck.txt"))).includes("patchlevel=10001")) {
        fs.copyFileSync(path.join(config.runtimePath, "packagedefinition.txt"), path.join(process.cwd(), "cleanPackageDefinition.txt"))
    } // Check if packagedefinition is now unmodded and if so overwrite current "clean" version

    if (!fs.existsSync(path.join(process.cwd(), "cleanThumbs.dat"))) {
        fs.copyFileSync(path.join(config.runtimePath, "..", "Retail", "thumbs.dat"), path.join(process.cwd(), "cleanThumbs.dat"))
    }

    child_process.execSync(`"Third-Party\\h6xtea.exe" -d --src "${path.join(config.runtimePath, "..", "Retail", "thumbs.dat")}" --dst "${path.join(process.cwd(), "temp", "thumbsVersionCheck.dat")}"`)
    if (!String(fs.readFileSync(path.join(process.cwd(), "temp", "thumbsVersionCheck.dat"))).includes("MainMenu.entity")) {
        fs.copyFileSync(path.join(config.runtimePath, "..", "Retail", "thumbs.dat"), path.join(process.cwd(), "cleanThumbs.dat"))
    } // Check if thumbs.dat is now unmodded and if so overwrite current "clean" version

    child_process.execSync(`"Third-Party\\h6xtea.exe" -d --src "${path.join(process.cwd(), "cleanPackageDefinition.txt")}" --dst "${path.join(process.cwd(), "temp", "packagedefinition.txt.decrypted")}"`)
    let packagedefinitionContent = String(fs.readFileSync(path.join(process.cwd(), "temp", "packagedefinition.txt.decrypted"))).replace(/patchlevel=[0-9]*/g, "patchlevel=10001")

    for (let brick of packagedefinition) {
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

    fs.writeFileSync(path.join(process.cwd(), "temp", "packagedefinition.txt.decrypted"), packagedefinitionContent + "\r\n\r\n\r\n\r\n")
    child_process.execSync(`"Third-Party\\h6xtea.exe" -e --src "${path.join(process.cwd(), "temp", "packagedefinition.txt.decrypted")}" --dst "${path.join(process.cwd(), "temp", "packagedefinition.txt.decrypted.encrypted")}"`)

    if (config.skipIntro) {
        child_process.execSync(`"Third-Party\\h6xtea.exe" -d --src "${path.join(process.cwd(), "cleanThumbs.dat")}" --dst "${path.join(process.cwd(), "temp", "thumbs.dat.decrypted")}"`)
        fs.writeFileSync(path.join(process.cwd(), "temp", "thumbs.dat.decrypted"), String(fs.readFileSync(path.join(process.cwd(), "temp", "thumbs.dat.decrypted"))).replace("Boot.entity", "MainMenu.entity"))
        child_process.execSync(`"Third-Party\\h6xtea.exe" -e --src "${path.join(process.cwd(), "temp", "thumbs.dat.decrypted")}" --dst "${path.join(process.cwd(), "temp", "thumbs.dat.decrypted.encrypted")}"`)
    }

    fs.copyFileSync(path.join(process.cwd(), "temp", "packagedefinition.txt.decrypted.encrypted"), path.join(process.cwd(), "Output", "packagedefinition.txt"))

    if (config.skipIntro) {
        fs.copyFileSync(path.join(process.cwd(), "temp", "thumbs.dat.decrypted.encrypted"), path.join(process.cwd(), "Output", "thumbs.dat"))
    }

    try {
        await promisify(emptyFolder)("temp", true)
    } catch {}
    fs.mkdirSync("temp")

    for (let stagingChunkFolder of fs.readdirSync(path.join(process.cwd(), "staging"))) {
        await rpkgInstance.callFunction(`-generate_rpkg_from "${path.join(process.cwd(), "staging", stagingChunkFolder)}" -output_path "${path.join(process.cwd(), "staging")}"`)
        fs.copyFileSync(path.join(process.cwd(), "staging", stagingChunkFolder + ".rpkg"), path.join(process.cwd(), "Output", (rpkgTypes[stagingChunkFolder] == "base" ? stagingChunkFolder + ".rpkg" : stagingChunkFolder + "patch200.rpkg")))
    }
    
    try {
        await promisify(emptyFolder)("staging", true)
    } catch {}
    try {
        await promisify(emptyFolder)("temp", true)
    } catch {}

    rpkgInstance.rpkgProcess.kill()
    process.exit(0)
}

stageAllMods()