const FrameworkVersion = "1.0.0"

THREE = require("./three-onlymath.min")
const QuickEntity = {
    "0": require("./quickentity1136"),
    "2": require("./quickentity20"),
    "2.1": require("./quickentity"),
    
    "999": require("./quickentity")
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
const { crc32 } = require("./crc32")
const readRecursive = require('fs-readdir-recursive')
const os = require("os")
const json5 = require("json5")
const semver = require('semver');
require("clarify")

const Piscina = require('piscina')

const config = json5.parse(String(fs.readFileSync(path.join(process.cwd(), "config.json"))))
config.runtimePath = path.resolve(process.cwd(), config.runtimePath)

const rpkgInstance = new RPKG.RPKGInstance()

function cleanExit() {
    rpkgInstance.exit()
    try {
        global.currentWorkerPool.destroy()
    } catch {}
    process.exit()
};
process.on('SIGINT', cleanExit)
process.on('SIGTERM', cleanExit)

process.on('uncaughtException', (err, origin) => {
    fs.writeSync(
        process.stderr.fd,
        `Caught exception: ${err}\n`
    );
    console.error("Origin: ", origin)
    cleanExit()
})

process.on('unhandledRejection', (err, origin) => {
    fs.writeSync(
        process.stderr.fd,
        `Unhandled promise rejection: ${err}\n`
    );
    console.error("Origin: ", origin)
    cleanExit()
})

async function stageAllMods() {
    console.time("StageAllMods")

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

    var packagedefinition = []
    var localisation = []
    var runtimePackages = []

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
            let manifest = json5.parse(String(fs.readFileSync(path.join(process.cwd(), "Mods", mod, "manifest.json"))))

            console.log("Staging mod: " + manifest.name)

            for (let key of ["name", "description", "authors", "version", "frameworkVersion"]) {
                if (typeof manifest[key] == "undefined") {
                    console.log(`ERROR: Mod ${manifest.name} is missing manifest field "${key}"!`)
                    cleanExit()
                }
            }

            if (semver.lt(manifest.frameworkVersion, FrameworkVersion)) {
                if (semver.diff(manifest.frameworkVersion, FrameworkVersion) == "major") {
                    console.log(`ERROR: Mod ${manifest.name} is designed for an older version of the framework and is likely incompatible!`)
                    cleanExit()
                }
            }

            if (semver.gt(manifest.frameworkVersion, FrameworkVersion)) {
                console.log(`ERROR: Mod ${manifest.name} is designed for a newer version of the framework and is likely incompatible!`)
                cleanExit()
            }

            /* ---------------------------------------------------------------------------------------------- */
            /*                                             Content                                            */
            /* ---------------------------------------------------------------------------------------------- */
            let entityPatches = []
            
            if (manifest.contentFolder && manifest.contentFolder.length && fs.existsSync(path.join(process.cwd(), "Mods", mod, manifest.contentFolder)) && fs.readdirSync(path.join(process.cwd(), "Mods", mod, manifest.contentFolder)).length) {
                for (let chunkFolder of fs.readdirSync(path.join(process.cwd(), "Mods", mod, manifest.contentFolder))) {
                    try {
                        fs.mkdirSync(path.join(process.cwd(), "staging", chunkFolder))
                    } catch {}
    
                    if (readRecursive(path.join(process.cwd(), "Mods", mod, manifest.contentFolder, chunkFolder)).some(a=>a.endsWith("contract.json"))) {
                        try {
                            await promisify(emptyFolder)("temp2", true)
                        } catch {}
                        fs.mkdirSync("temp2") // Make/clear the temp2 directory
    
                        var contractsORESChunk = await rpkgInstance.getRPKGOfHash("002B07020D21D727")
    
                        if (!fs.existsSync(path.join(process.cwd(), "staging", "chunk0", "002B07020D21D727.ORES"))) {
                            await rpkgInstance.callFunction(`-extract_from_rpkg "${path.join(config.runtimePath, contractsORESChunk + ".rpkg")}" -filter "002B07020D21D727" -output_path temp2`) // Extract the contracts ORES
                        } else {
                            fs.ensureDirSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES"))
                            fs.copyFileSync(path.join(process.cwd(), "staging", "chunk0", "002B07020D21D727.ORES"), path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES")) // Use the staging one (for mod compat - one mod can extract, patch and build, then the next can patch that one instead)
                            fs.copyFileSync(path.join(process.cwd(), "staging", "chunk0", "002B07020D21D727.ORES.meta"), path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.meta"))
                        }
                        
                        child_process.execSync(`"Third-Party\\OREStool.exe" "${path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES")}"`)
                        var contractsORESContent = JSON.parse(String(fs.readFileSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.JSON"))))
    
                        await rpkgInstance.callFunction(`-hash_meta_to_json "${path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.meta")}"`)
                        var contractsORESMetaContent = JSON.parse(String(fs.readFileSync(path.join(process.cwd(), "temp2", contractsORESChunk, "ORES", "002B07020D21D727.ORES.meta.JSON"))))
                    } // There are contracts, extract the contracts ORES and copy it to the temp2 directory
    
                    for (let contentFile of readRecursive(path.join(process.cwd(), "Mods", mod, manifest.contentFolder, chunkFolder))) {
                        var contentType = path.basename(contentFile).split(".").slice(1).join(".")
                        var contentFilePath = path.join(process.cwd(), "Mods", mod, manifest.contentFolder, chunkFolder, contentFile)
        
                        switch (contentType) {
                            case "entity.json":
                                var entityContent = LosslessJSON.parse(String(fs.readFileSync(contentFilePath)))

		                        console.log("Converting entity " + contentFilePath)

                                if (!QuickEntity[Object.keys(QuickEntity)[Object.keys(QuickEntity).findIndex(a=> parseFloat(a) > entityContent.quickEntityVersion) - 1]]) {
                                    console.log("Error: could not find matching QuickEntity version for " + entityContent.quickEntityVersion)
                                }

                                await (QuickEntity[Object.keys(QuickEntity)[Object.keys(QuickEntity).findIndex(a=> parseFloat(a) > entityContent.quickEntityVersion) - 1]]).generate("HM3", contentFilePath,
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
    
		                        console.log("Preparing to apply patch " + contentFilePath)

                                entityPatches.push({
                                    contentFilePath,
                                    chunkFolder,
                                    entityContent,
                                    tempRPKG: await rpkgInstance.getRPKGOfHash(entityContent.tempHash),
                                    tbluRPKG: await rpkgInstance.getRPKGOfHash(entityContent.tbluHash)
                                })
                                break;
                            case "unlockables.json":
                                var entityContent = JSON.parse(String(fs.readFileSync(contentFilePath)))
                                var oresChunk = await rpkgInstance.getRPKGOfHash("0057C2C3941115CA")

		                        console.log("Applying unlockable patch " + contentFilePath)
    
                                if (!fs.existsSync(path.join(process.cwd(), "staging", "chunk0", "0057C2C3941115CA.ORES"))) {
                                    await rpkgInstance.callFunction(`-extract_from_rpkg "${path.join(config.runtimePath, oresChunk + ".rpkg")}" -filter "0057C2C3941115CA" -output_path temp`) // Extract the unlockables ORES
                                } else {
                                    fs.ensureDirSync(path.join(process.cwd(), "temp", oresChunk, "ORES"))
                                    fs.copyFileSync(path.join(process.cwd(), "staging", "chunk0", "0057C2C3941115CA.ORES"), path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES")) // Use the staging one (for mod compat - one mod can extract, patch and build, then the next can patch that one instead)
                                    fs.copyFileSync(path.join(process.cwd(), "staging", "chunk0", "0057C2C3941115CA.ORES.meta"), path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES.meta"))
                                }
    
                                child_process.execSync(`"Third-Party\\OREStool.exe" "${path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES")}"`)
                                var oresContent = JSON.parse(String(fs.readFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES.JSON"))))
    
                                var oresToPatch = Object.fromEntries(oresContent.map(a=>[a.Id, a]))
                                deepMerge(oresToPatch, entityContent)
                                var oresToWrite = Object.values(oresToWrite)
    
                                fs.writeFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES.JSON"), JSON.stringify(oresToWrite))
                                fs.rmSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES"))
                                child_process.execSync(`"Third-Party\\OREStool.exe" "${path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES.json")}"`)
    
                                fs.copyFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES"), path.join(process.cwd(), "staging", "chunk0", "0057C2C3941115CA.ORES"))
                                fs.copyFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "0057C2C3941115CA.ORES.meta"), path.join(process.cwd(), "staging", "chunk0", "0057C2C3941115CA.ORES.meta"))
                                break;
                            case "repository.json":
                                var entityContent = JSON.parse(String(fs.readFileSync(contentFilePath)))
    
                                var repoRPKG = await rpkgInstance.getRPKGOfHash("00204D1AFD76AB13")

		                        console.log("Applying repository patch " + contentFilePath)
    
                                if (!fs.existsSync(path.join(process.cwd(), "staging", "chunk0", "00204D1AFD76AB13.REPO"))) {
                                    await rpkgInstance.callFunction(`-extract_from_rpkg "${path.join(config.runtimePath, repoRPKG + ".rpkg")}" -filter "00204D1AFD76AB13" -output_path temp`) // Extract the unlockables ORES
                                } else {
                                    fs.ensureDirSync(path.join(process.cwd(), "temp", repoRPKG, "REPO"))
                                    fs.copyFileSync(path.join(process.cwd(), "staging", "chunk0", "00204D1AFD76AB13.REPO"), path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO")) // Use the staging one (for mod compat - one mod can extract, patch and build, then the next can patch that one instead)
                                    fs.copyFileSync(path.join(process.cwd(), "staging", "chunk0", "00204D1AFD76AB13.REPO.meta"), path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO.meta"))
                                }
    
                                var repoContent = JSON.parse(String(fs.readFileSync(path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO"))))
    
                                var repoToPatch = Object.fromEntries(repoContent.map(a=>[a["ID_"], a]))
                                deepMerge(repoToPatch, entityContent)
                                var repoToWrite = Object.values(repoToPatch)
    
                                var editedItems = new Set(Object.values(entityContent).map(a=>a.ID_))
    
                                await rpkgInstance.callFunction(`-hash_meta_to_json "${path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO.meta")}"`)
                                var metaContent = JSON.parse(String(fs.readFileSync(path.join(process.cwd(), "temp", repoRPKG, "REPO", "00204D1AFD76AB13.REPO.meta.JSON"))))
                                for (var repoItem of repoToWrite) {
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
                                var entityContent = LosslessJSON.parse(String(fs.readFileSync(contentFilePath)))
    
                                var contractHash = "00" + md5(("smfContract" + entityContent.Metadata.Id).toLowerCase()).slice(2, 16).toUpperCase()

		                        console.log("Adding contract " + contentFilePath)
    
                                contractsORESContent[contractHash] = entityContent.Metadata.Id // Add the contract to the ORES
    
                                contractsORESMetaContent["hash_reference_data"].push({
                                    "hash": contractHash,
                                    "flag": "9F"
                                })
    
                                fs.writeFileSync(path.join(process.cwd(), "staging", "chunk0", contractHash + ".JSON"), LosslessJSON.stringify(entityContent)) // Write the actual contract to the staging directory
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
                    if (fs.readdirSync(path.join(process.cwd(), "Mods", mod, manifest.contentFolder, chunkFolder)).some(a=>a.endsWith("contract.json"))) {
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
                    if (fs.existsSync(path.join(process.cwd(), "Mods", mod, manifest.contentFolder, chunkFolder, chunkFolder + ".meta"))) {
                        fs.copyFileSync(path.join(process.cwd(), "Mods", mod, manifest.contentFolder, chunkFolder, chunkFolder + ".meta"), path.join(process.cwd(), "staging", chunkFolder, chunkFolder + ".meta"))
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
                    assignedTemporaryDirectory: "patchWorker" + index
                })
            })); // Run each patch in the worker queue and wait for all of them to finish

            /* ---------------------------------------------------------------------------------------------- */
            /*                                              Blobs                                             */
            /* ---------------------------------------------------------------------------------------------- */
            if (manifest.blobsFolder && manifest.blobsFolder.length && fs.existsSync(path.join(process.cwd(), "Mods", mod, manifest.blobsFolder)) && fs.readdirSync(path.join(process.cwd(), "Mods", mod, manifest.blobsFolder)).length) {
                try {
                    await promisify(emptyFolder)("temp", true)
                } catch {}
                fs.mkdirSync("temp") // Clear the temp directory

                try {
                    fs.mkdirSync(path.join(process.cwd(), "staging", "chunk0"))
                } catch {}

                var oresChunk = await rpkgInstance.getRPKGOfHash("00858D45F5F9E3CA")

                if (!fs.existsSync(path.join(process.cwd(), "staging", "chunk0", "00858D45F5F9E3CA.ORES"))) {
                    await rpkgInstance.callFunction(`-extract_from_rpkg "${path.join(config.runtimePath, oresChunk + ".rpkg")}" -filter "00858D45F5F9E3CA" -output_path temp`) // Extract the blobs ORES
                } else {
                    fs.ensureDirSync(path.join(process.cwd(), "temp", oresChunk, "ORES"))
                    fs.copyFileSync(path.join(process.cwd(), "staging", "chunk0", "00858D45F5F9E3CA.ORES"), path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES")) // Use the staging one (for mod compat - one mod can extract, patch and build, then the next can patch that one instead)
                    fs.copyFileSync(path.join(process.cwd(), "staging", "chunk0", "00858D45F5F9E3CA.ORES.meta"), path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.meta"))
                }

                child_process.execSync(`"Third-Party\\OREStool.exe" "${path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES")}"`)
                var oresContent = JSON.parse(String(fs.readFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.JSON"))))

                await rpkgInstance.callFunction(`-hash_meta_to_json "${path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.meta")}"`)
                var metaContent = JSON.parse(String(fs.readFileSync(path.join(process.cwd(), "temp", oresChunk, "ORES", "00858D45F5F9E3CA.ORES.meta.JSON"))))
                
                for (let blob of glob.sync(path.join(process.cwd(), "Mods", mod, manifest.blobsFolder, "**/*.*"))) {
                    var blobPath = path.resolve(blob).split(path.resolve(process.cwd()))[1].split(path.sep).slice(4).join("/")

                    if (path.extname(blob).startsWith(".jp") || path.extname(blob) == ".png") {
                        var blobHash = "00" + md5((`[assembly:/_pro/online/default/cloudstorage/resources/${blobPath}].pc_gfx`).toLowerCase()).slice(2, 16).toUpperCase()
                    } else if (path.extname(blob) == ".json") {
                        var blobHash = "00" + md5((`[assembly:/_pro/online/default/cloudstorage/resources/${blobPath}].pc_json`).toLowerCase()).slice(2, 16).toUpperCase()
                    } else {
                        var blobHash = "00" + md5((`[assembly:/_pro/online/default/cloudstorage/resources/${blobPath}].pc_${path.extname(blob).slice(1)}`).toLowerCase()).slice(2, 16).toUpperCase()
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

            /* ---------------------------------------------------------------------------------------------- */
            /*                                        Runtime packages                                        */
            /* ---------------------------------------------------------------------------------------------- */
            if (manifest.runtimePackages) {
                    runtimePackages.push(...manifest.runtimePackages.map(a=>{
                    return {
                        chunk: a.chunk,
                        path: a.path,
                        mod: mod
                    }
                }))
            }

            // for (let deletedHash of manifest.undelete) {
            //     var hashRPKG = await rpkgInstance.getRPKGOfHash(deletedHash)
                
            //     fs.mkdirSync(path.join(process.cwd(), "staging", hashRPKG.replace(/patch[1-9]*/g, "")))
            //     await rpkgInstance.callFunction(`-extract_from_rpkg "${path.join(config.runtimePath, hashRPKG + ".rpkg")}" -filter "${deletedHash}" -output_path temp`)
            //     for (let folder of fs.readdirSync(path.join(process.cwd(), "temp", hashRPKG))) {
            //         if (fs.statSync(path.join(process.cwd(), "temp", hashRPKG, folder)).isDirectory()) {
            //             for (let file of fs.readdirSync(path.join(process.cwd(), "temp", hashRPKG, folder))) {
            //                 fs.copyFileSync(path.join(process.cwd(), "temp", hashRPKG, folder, file), path.join(process.cwd(), "staging", hashRPKG.replace(/patch[1-9]*/g, ""), file))
            //             }
            //         }
            //     } // Copy the file itself

            //     try {
            //         await promisify(emptyFolder)("temp", true)
            //     } catch {}
            //     fs.mkdirSync("temp") // Clear the temp directory

            //     await rpkgInstance.callFunction(`-extract_all_hash_depends_from "${path.join(config.runtimePath)}" -filter "${deletedHash}" -output_path temp`)

            //     for (let folder of fs.readdirSync(path.join(process.cwd(), "temp", "ALLDEPENDS", fs.readdirSync(path.join(process.cwd(), "temp", "ALLDEPENDS"))[0]))) {
            //         if (folder.startsWith("chunk0") || folder == "chunk1" || folder.startsWith("chunk1patch")) {
            //             fs.rmSync(path.join(path.join(process.cwd(), "temp", "ALLDEPENDS", fs.readdirSync(path.join(process.cwd(), "temp", "ALLDEPENDS"))[0], folder)), {recursive: true, force: true})
            //         }
            //     }

            //     for (let folder of fs.readdirSync(path.join(process.cwd(), "temp", "ALLDEPENDS", fs.readdirSync(path.join(process.cwd(), "temp", "ALLDEPENDS"))[0]))) {
            //         if (fs.statSync(path.join(process.cwd(), "temp", "ALLDEPENDS", fs.readdirSync(path.join(process.cwd(), "temp", "ALLDEPENDS"))[0], folder)).isDirectory()) {
            //             fs.mkdirSync(path.join(process.cwd(), "staging", folder.replace(/patch[1-9]*/g, "")))
            //             for (let file of fs.readdirSync(path.join(process.cwd(), "temp", "ALLDEPENDS", fs.readdirSync(path.join(process.cwd(), "temp", "ALLDEPENDS"))[0], folder))) {
            //                 fs.copyFileSync(path.join(process.cwd(), "temp", "ALLDEPENDS", fs.readdirSync(path.join(process.cwd(), "temp", "ALLDEPENDS"))[0], folder, file), path.join(process.cwd(), "staging", folder.replace(/patch[1-9]*/g, ""), file))
            //             }
            //         }
            //     } // Copy the file's dependencies

            //     try {
            //         await promisify(emptyFolder)("temp", true)
            //     } catch {}
            //     fs.mkdirSync("temp") // Clear the temp directory
            // } // Undelete

            // This is slow and not really that necessary - mod authors can just include the files in the mod folder themselves as content instead of relying on the framework to do it
    
            if (manifest.packagedefinition) {
                packagedefinition.push(...manifest.packagedefinition)
            }
            
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
        }
    } // Stage all mods

    if (config.outputToSeparateDirectory) {
        try {
            await promisify(emptyFolder)("Output", true)
        } catch {}
        fs.mkdirSync("Output")
    }

    console.log("Copying runtime packages")

    let runtimePatchNumber = 205
    for (let runtimeFile of runtimePackages) {
        // {
        //     "chunk": 0,
        //     "path": "portedhashes.rpkg"
        // }

        fs.copyFileSync(path.join(process.cwd(), "Mods", runtimeFile.mod, runtimeFile.path), config.outputToSeparateDirectory ? path.join(process.cwd(), "Output", "chunk" + runtimeFile.chunk + "patch" + runtimePatchNumber + ".rpkg") : path.join(config.runtimePath, "chunk" + runtimeFile.chunk + "patch" + runtimePatchNumber + ".rpkg"))
        runtimePatchNumber ++

        if (runtimePatchNumber >= 300) {
            console.log("ERROR: More than 94 total runtime packages!")
            cleanExit()
        } // Framework only manages patch200-300
    } // Runtime packages

    console.log("Localising text")

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

        let localisationContent = JSON.parse(String(fs.readFileSync(path.join(process.cwd(), "temp", "LOCR", localisationFileRPKG + ".rpkg", "00F5817876E691F1.LOCR.JSON"))))
        let locrContent = {}

        for (let localisationLanguage of localisationContent) {
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
        fs.copyFileSync(path.join(process.cwd(), "temp", "LOCR", localisationFileRPKG + ".rpkg", "LOCR.rebuilt", "00F5817876E691F1.LOCR"), path.join(process.cwd(), "staging", "chunk0", "00F5817876E691F1.LOCR"))

        try {
            await promisify(emptyFolder)("temp", true)
        } catch {}
        fs.mkdirSync("temp") // Clear the temp directory
    } // Localisation

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

    console.log("Patching packagedefinition")

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

    fs.copyFileSync(path.join(process.cwd(), "temp", "packagedefinition.txt.decrypted.encrypted"), config.outputToSeparateDirectory ? path.join(process.cwd(), "Output", "packagedefinition.txt") : path.join(config.runtimePath, "packagedefinition.txt"))

    if (config.skipIntro) {
        fs.copyFileSync(path.join(process.cwd(), "temp", "thumbs.dat.decrypted.encrypted"), config.outputToSeparateDirectory ? path.join(process.cwd(), "Output", "thumbs.dat") : path.join(config.runtimePath, "..", "Retail", "thumbs.dat"))
    }

    try {
        await promisify(emptyFolder)("temp", true)
    } catch {}
    fs.mkdirSync("temp")

    console.log("Generating RPKGs")

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

    console.timeEnd("StageAllMods")

    console.log("Deployed all mods successfully.")

    cleanExit()
}

stageAllMods()
