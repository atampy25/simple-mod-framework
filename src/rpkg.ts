import child_process from "child_process"
import fs from "fs"
import json5 from "json5"
import path from "path"

require("clarify")

const config = json5.parse(fs.readFileSync(path.join(process.cwd(), "config.json"), "utf8"))

class RPKGInstance {
	rpkgProcess: child_process.ChildProcessWithoutNullStreams

	output: string
	previousOutput: string

	initialised: boolean
	ready: boolean

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

	async waitForInitialised() {
		// yes, bad, pls tell me how to make good
		return new Promise(waitForInitialised.bind(this))
	}

	async callFunction(func: string): Promise<string> {
		this.ready = false

		this.rpkgProcess.stdin.write(func)
		this.rpkgProcess.stdin.write("\n")

		return new Promise(waitForReady.bind(this))
	}

	async getRPKGOfHash(hash: string): Promise<string> {
		const result = [
			...(await this.callFunction("-hash_probe \"" + path.resolve(process.cwd(), config.runtimePath) + "\" -filter \"" + hash + "\"")).matchAll(
				/is in RPKG file: (chunk[0-9]*(?:patch[1-9])?)\.rpkg/g
			)
		]
		return result[result.length - 1][result[result.length - 1].length - 1] // enjoy lmao
	}

	exit() {
		this.rpkgProcess.kill()
	}
}

function waitForInitialised(resolve: (result: string) => unknown) {
	// yes, bad, pls tell me how to make good
	if (this.initialised) {
		resolve(this.previousOutput)
	} else {
		setTimeout(waitForInitialised.bind(this, resolve), 100)
	}
}

function waitForReady(resolve: (result: string) => unknown) {
	// yes, bad, pls tell me how to make good
	if (this.ready) {
		resolve(this.previousOutput.slice(0, -8).replace(/Running command: .*\r\n\r\n/g, ""))
	} else {
		setTimeout(waitForReady.bind(this, resolve), 100)
	}
}

export default RPKGInstance
