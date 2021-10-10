const fs = require("fs")
const path = require("path")
const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), "config.json")))
const child_process = require("child_process")
require("clarify")

class RPKGInstance {
    constructor() {
        this.rpkgProcess = child_process.spawn(path.join(process.cwd(), "Third-Party", "rpkg-cli"), ["-i"])
        this.output = ""
        this.previousOutput = ""
        this.initialised = false
        this.ready = false
    
        this.rpkgProcess.stdout.on("data", (data) => {
            this.output += String(data)

            if (this.output.endsWith("RPKG> ")) {
                if (!this.initialised) {
                    this.initialised = true
                    this.ready = false
                    this.output = ""
                    this.previousOutput = ""
                    return
                }

                this.previousOutput = this.output
                this.output = ""
                this.ready = true
            }
        })
    }
    
    async waitForInitialised() { // yes, bad, pls tell me how to make good
        return new Promise(waitForInitialised.bind(this))
    }
    
    async callFunction(func) {
        this.ready = false

        await this.rpkgProcess.stdin.write(func)
        await this.rpkgProcess.stdin.write("\n")

        return new Promise(waitForReady.bind(this))
    }

    async getRPKGOfHash(hash) {
        let result = [...(await this.callFunction("-hash_probe \"" + config.runtimePath + "\" -filter \"" + hash + "\"")).matchAll(/is in RPKG file: (chunk[0-9]*(?:patch[1-9])?)\.rpkg/g)]
        return result[result.length - 1][result[result.length - 1].length - 1] // enjoy lmao
    }

    exit() {
        this.rpkgProcess.kill()
    }
}

function waitForInitialised(resolve) { // yes, bad, pls tell me how to make good
    if (this.initialised) {
        resolve(this.previousOutput)
    } else {
        setTimeout(waitForInitialised.bind(this, resolve), 100);
    }
}

function waitForReady(resolve) { // yes, bad, pls tell me how to make good
    if (this.ready) {
        resolve(this.previousOutput.slice(0, -8).replace(/Running command: .*\r\n\r\n/g, ""))
    } else {
        setTimeout(waitForReady.bind(this, resolve), 100);
    }
}

module.exports = {
    RPKGInstance
}