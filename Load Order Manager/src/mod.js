var Swal = require("sweetalert2/dist/sweetalert2")
var fs = require('fs-extra')
var path = require('path')
var child_process = require("child_process")
var AdmZip = require('adm-zip')
var sanitizeHtml = require('sanitize-html')
var remote = require('@electron/remote')
var semver = require('semver')
var downloadFile = require("async-get-file")
var json5 = require("json5")
var klaw = require("klaw-sync")
const { randomUUID } = require("crypto")
const { marked } = require('marked')

window.$ = window.jQuery = require('jquery')

frameworkVersion = "1.4.1"

async function updateFramework() {
	var latestGithubRelease = await (await fetch("https://api.github.com/repos/hitman-resources/simple-mod-framework/releases/latest", {
		headers: {
			"Accept": "application/vnd.github.v3+json"
		}
	})).json()
	
	await Swal.fire({
		title: 'Updating the framework',
		html: 'Please wait - the framework is being updated to the latest version (' + latestGithubRelease.tag_name + ').',
		width: '40rem',
		didOpen: async () => {
			Swal.showLoading()

			setTimeout(async () => {
				await downloadFile((await fetch("https://github.com/hitman-resources/simple-mod-framework/releases/latest/download/Release.zip")).url, {
					directory: ".",
					filename: "latest-release.zip",
					timeout: 999999999
				});
				
				fs.removeSync("./staging")
				fs.ensureDirSync("./staging")

				let success = false
				while (!success) {
					try {
						new AdmZip("./latest-release.zip").extractAllTo("./staging")
						success = true
					} catch {
						success = false
						await new Promise(r => setTimeout(r, 2000))
					}
				}

				fs.removeSync("./staging/Mods")
				fs.removeSync("./staging/cleanPackageDefinition.txt")
				fs.removeSync("./staging/cleanThumbs.dat")
				fs.removeSync("./staging/config.json")
				fs.removeSync("./staging/Load Order Manager/chrome_100_percent.pak")
				fs.removeSync("./staging/Load Order Manager/chrome_200_percent.pak")
				fs.removeSync("./staging/Load Order Manager/d3dcompiler_47.dll")
				fs.removeSync("./staging/Load Order Manager/ffmpeg.dll")
				fs.removeSync("./staging/Load Order Manager/icudtl.dat")
				fs.removeSync("./staging/Load Order Manager/libEGL.dll")
				fs.removeSync("./staging/Load Order Manager/libGLESv2.dll")
				fs.removeSync("./staging/Load Order Manager/Load Order Manager.exe")
				fs.removeSync("./staging/Load Order Manager/locales")
				fs.removeSync("./staging/Load Order Manager/resources.pak")
				fs.removeSync("./staging/Load Order Manager/v8_context_snapshot.bin")

				fs.copySync("./staging", "..")

				fs.removeSync("./staging")
				fs.removeSync("./latest-release.zip")
			
				Swal.close()
				window.location.reload()
			}, 500)
		},
		allowEnterKey: false,
		allowOutsideClick: false,
		allowEscapeKey: false,
		showConfirmButton: false
	})
}

async function fetchUpdates() {
	var latestGithubRelease = await (await fetch("https://api.github.com/repos/hitman-resources/simple-mod-framework/releases/latest", {
		headers: {
			"Accept": "application/vnd.github.v3+json"
		}
	})).json()

	if (semver.lt(frameworkVersion, latestGithubRelease.tag_name)) {
		document.getElementById("frameworkUpdateAvailableText").innerHTML = ({patch: "Patch available", minor: "Minor update available", major: "Major update available"})[semver.diff(frameworkVersion, latestGithubRelease.tag_name)] || "Update available"
		document.getElementById("frameworkUpdateProcessText").innerHTML = latestGithubRelease.body.includes("CANNOT BE APPLIED AUTOMATICALLY") ? "The update must be applied manually. Re-download the framework from the Nexus Mods page." : "The update can be applied automatically."
		document.getElementById("frameworkVersionCurrent").innerHTML = frameworkVersion
		document.getElementById("frameworkVersionNext").innerHTML = latestGithubRelease.tag_name

		if (latestGithubRelease.body.includes("CANNOT BE APPLIED AUTOMATICALLY")) document.getElementById("frameworkUpdateButton").style.display = "none"

		document.getElementById("frameworkChangelog").innerHTML = marked(latestGithubRelease.body, {
			gfm: true
		})

		document.getElementById("frameworkUpdateAvailable").style.display = "block"
	}
}

async function fetchModUpdates() {
	for (var modFolder of fs.readdirSync("../Mods")) {
		if (fs.existsSync(path.join("..", "Mods", modFolder, "manifest.json"))) {
			var modManifest = json5.parse(fs.readFileSync(path.join("..", "Mods", modFolder, "manifest.json")))
			if (modManifest.updateCheck) {
				var modUpdateData = await (await fetch(modManifest.updateCheck)).json()
				if (semver.lt(modManifest.version, modUpdateData.version)) {
					$("#modUpdateAvailable")[0].style.display = "block"
					$("#modUpdateCards")[0].innerHTML += `<div class="text-lg text-center p-4 m-4 shadow-2xl bg-gradient-to-br from-gray-800 to-gray-900 cursor-pointer" onclick="updateMod('${sanitiseStrongly(modFolder.replaceAll(`'`, "").replaceAll(`\\`, ""))}')">
															<div class="flex flex-initial flex-wrap flex-row justify-center w-full">
																<div>
																	<span class="font-bold">${sanitise(modManifest.name)}</span> v<span>${sanitise(modManifest.version)}</span> -> v<span>${sanitise(modUpdateData.version)}</span><br>
																	<span>${sanitise(modUpdateData.changelog)}</span>
																</div>
															</div>
														</div>`
				}
			}
		}
	}
}

async function updateMod(modFolder) {
	if (fs.existsSync(path.join("..", "Mods", modFolder, "manifest.json"))) {
		var modManifest = json5.parse(fs.readFileSync(path.join("..", "Mods", modFolder, "manifest.json")))
		if (modManifest.updateCheck) {
			var updateData = await (await fetch(modManifest.updateCheck)).json()

			Swal.fire({
				title: 'Updating ' + sanitise(modManifest.name),
				html: 'Please wait - the mod is being updated to the latest version (' + sanitise(updateData.version) + '):<br><br><i>' + sanitise(updateData.changelog) + "</i>",
				width: '40rem',
				didOpen: async () => {
					Swal.showLoading()
		
					setTimeout(async () => {
						await downloadFile((await fetch(updateData.url.startsWith("https://") ? updateData.url : new Error())).url, {
							directory: ".",
							filename: "mod.zip",
							timeout: 999999999
						});

						fs.removeSync("./staging")
						fs.ensureDirSync("./staging")
			
						let success = false
						while (!success) {
							try {
								new AdmZip("./mod.zip").extractAllTo("./staging")
								success = true
							} catch {
								success = false
								await new Promise(r => setTimeout(r, 2000))
							}
						}

						for (var managedFile of updateData.managedFilesAndFolders) {
							if (managedFile.includes("..") || managedFile.includes(":")) {
								break
							}
							fs.removeSync(path.join("..", "Mods", managedFile))
						}
			
						fs.copySync("./staging", "../Mods")
						fs.removeSync("./staging")
					
						Swal.close()
						window.location.reload()
					}, 500)
				},
				allowEnterKey: false,
				allowOutsideClick: false,
				allowEscapeKey: false,
				showConfirmButton: false
			})
		}
	}
}

async function execute() {
	setTimeout(fetchUpdates, 1000)
	setTimeout(fetchModUpdates, 1000)
	
	try {
		json5.parse(fs.readFileSync("../config.json"))
	} catch {
		showMessage("Improper installation", "Please re-read the installation instructions to ensure everything was installed correctly.", "error")
		return
	}

	if (typeof json5.parse(fs.readFileSync("../config.json")).retailPath === "undefined") {
		let config = json5.parse(String(fs.readFileSync("../config.json")))
		config.retailPath = "..\\Retail"
		fs.writeFileSync("../config.json", json5.stringify(config))
	}
	
	try {
		if (!fs.existsSync(path.resolve("..", json5.parse(fs.readFileSync("../config.json")).runtimePath))) {
			showMessage("Invalid Runtime path", "The framework can't find a folder it's looking for. Please re-read the installation instructions to ensure everything was installed correctly.", "error")
			return
		}

		if (!fs.existsSync(path.join(json5.parse(fs.readFileSync("../config.json")).retailPath, "Runtime", "chunk0.rpkg")) && !fs.existsSync(path.join(path.resolve("..", json5.parse(fs.readFileSync("../config.json")).retailPath), "HITMAN3.exe"))) {
			showMessage("Invalid Retail path", "The framework can't find HITMAN3.exe in the right place. Please re-read the installation instructions to ensure everything was installed correctly.", "error")
			return
		}

		if (fs.existsSync(path.join(json5.parse(fs.readFileSync("../config.json")).retailPath, "Runtime", "chunk0.rpkg")) && !fs.existsSync(path.join(path.resolve("..", json5.parse(fs.readFileSync("../config.json")).retailPath), "..", "MicrosoftGame.Config"))) {
			showMessage("Invalid Retail path", "The framework can't find the game config in the right place. Please re-read the installation instructions to ensure everything was installed correctly.", "error")
			return
		}
	} catch {
		showMessage("Invalid Runtime path/files", "The framework can't find a folder it's looking for, or it can't see the files it needs. Please re-read the installation instructions to ensure everything was installed correctly.", "error")
		return
	}

	if (typeof json5.parse(fs.readFileSync("../config.json")).reportErrors === "undefined") {
		await errorReportingPrompt()
	}

	await refreshMods()
}

async function errorReportingPrompt() {
	let dialog = await Swal.fire({
		width: '40rem',
		title: "Error/performance reporting",
		html: "Would you like to send anonymous performance and error reporting data to the internet to improve the framework?",
		showConfirmButton: true,
		confirmButtonText: "Sure",
		showDenyButton: true,
		denyButtonText: "Nah"
	})

	if (dialog.isConfirmed) {
		let config = json5.parse(String(fs.readFileSync("../config.json")))

		config.reportErrors = true
		config.errorReportingID = randomUUID()

		fs.writeFileSync("../config.json", json5.stringify(config))
	} else if (dialog.isDenied) {
		let config = json5.parse(String(fs.readFileSync("../config.json")))

		config.reportErrors = false
		config.errorReportingID = undefined

		fs.writeFileSync("../config.json", json5.stringify(config))
	}
	
	await refreshMods()
}

async function refreshMods() {
	$("#mods")[0].style.display = "flex"
	$("#noModsMessage")[0].style.display = "none"
	$("#enabledMods")[0].innerHTML = ""
	$("#availableMods")[0].innerHTML = ""

	var config = json5.parse(String(fs.readFileSync("../config.json")))
	
	for (var i = config.loadOrder.length - 1; i >= 0; i--) {
		try {
			let modFolder = !(fs.existsSync(path.join("..", "Mods", config.loadOrder[i])) && !fs.existsSync(path.join("..", "Mods", config.loadOrder[i], "manifest.json")) && klaw(path.join("..", "Mods", config.loadOrder[i])).filter(a=>a.stats.size > 0).map(a=>a.path).some(a=>a.endsWith(".rpkg"))) // Mod is not an RPKG mod
								? fs.readdirSync(path.join("..", "Mods")).find(a=>fs.existsSync(path.join("..", "Mods", a, "manifest.json")) && json5.parse(String(fs.readFileSync(path.join("..", "Mods", a, "manifest.json")))).id == config.loadOrder[i]) // Find mod by ID
								: config.loadOrder[i] // Mod is an RPKG mod, use folder name
			if (!modFolder) { config.loadOrder.splice(i, 1) }
		} catch {
			config.loadOrder.splice(i, 1)
		}
	} // Remove mods that don't exist from the load order

	fs.writeFileSync("../config.json", json5.stringify(config))

	$("#errorReportingText")[0].innerText = json5.parse(fs.readFileSync("../config.json")).reportErrors ? ("Error reporting is enabled (click here to change that). Your ID is " + json5.parse(fs.readFileSync("../config.json")).errorReportingID) : "Error reporting is disabled (click here to change that)."

	if (fs.readdirSync("../Mods").length > 0) {
		for (let mod of config.loadOrder) {
			try {
				let modFolder = !(fs.existsSync(path.join("..", "Mods", mod)) && !fs.existsSync(path.join("..", "Mods", mod, "manifest.json")) && klaw(path.join("..", "Mods", mod)).filter(a=>a.stats.size > 0).map(a=>a.path).some(a=>a.endsWith(".rpkg"))) // Mod is not an RPKG mod
								? fs.readdirSync(path.join("..", "Mods")).find(a=>fs.existsSync(path.join("..", "Mods", a, "manifest.json")) && json5.parse(String(fs.readFileSync(path.join("..", "Mods", a, "manifest.json")))).id == mod) // Find mod by ID
								: mod // Mod is an RPKG mod, use folder name
				if (fs.existsSync(path.join("..", "Mods", modFolder, "manifest.json"))) {
					var modManifest = json5.parse(fs.readFileSync(path.join("..", "Mods", modFolder, "manifest.json")))
	
					for (let key of ["id", "name", "description", "authors", "version", "frameworkVersion"]) {
						if (typeof modManifest[key] == "undefined") {
							continue
						}
					}
					
					modManifest.options && checkModOptions(modFolder) // Ensure mod options are valid for all enabled mods with options
					
					$("#enabledMods")[0].innerHTML += `<div class="p-8 bg-gray-900 w-full flow-root shadow-xl rounded-md text-white">
															<div class="float-right">
																${modManifest.options && modManifest.options.some(a=>a.type == "checkbox" || a.type == "select") ? `<neo-button small label="" gradientFrom="thisisjustsoitworkslmao" gradientTo="bg-gray-800" onclick="modSettings('${sanitiseStrongly(modFolder.replaceAll(`'`, "").replaceAll(`\\`, ""))}')" style="display: inline">
																	<i class="fas fa-cog" slot="icon"></i>
																</neo-button>` : ``}
																<neo-button small label="Disable" gradientFrom="from-rose-400" gradientTo="to-red-500" onclick="disableMod('${sanitiseStrongly(modFolder.replaceAll(`'`, "").replaceAll(`\\`, ""))}')" style="display: inline">
																	<i class="fas fa-times" slot="icon"></i>
																</neo-button>
																<neo-button small label="Move" gradientFrom="from-fuchsia-400" gradientTo="to-violet-400" onclick="moveMod('${sanitiseStrongly(modFolder.replaceAll(`'`, "").replaceAll(`\\`, ""))}')" style="display: inline">
																	<i class="fas fa-arrows-alt" slot="icon"></i>
																</neo-button>
															</div>
															<div class="float-left" style="max-width: ${window.visualViewport.height > 1080 ? "70%" : "60%"}">
																<div class="mb-2">
																	<h3 class="font-semibold text-xl inline"><img src="frameworkMod.png" class="w-8 inline align-middle">  <span class="align-middle">${sanitise(modManifest.name)} <span class="font-light">by ${modManifest.authors.map(a=>sanitise(a)).join(", ")}</span></span></h3><br>
																</div>
																<p>${sanitise(modManifest.description)}</p>
															</div>
														</div><br>`
				} else {
					$("#enabledMods")[0].innerHTML += `<div class="p-8 bg-gray-900 w-full flow-root shadow-xl rounded-md text-white">
															<div class="float-right">
																<neo-button small label="Disable" gradientFrom="from-rose-400" gradientTo="to-red-500" onclick="disableMod('${sanitiseStrongly(modFolder.replaceAll(`'`, "").replaceAll(`\\`, ""))}')" style="display: inline">
																	<i class="fas fa-times" slot="icon"></i>
																</neo-button>
																<neo-button small label="Move" gradientFrom="from-fuchsia-400" gradientTo="to-violet-400" onclick="moveMod('${sanitiseStrongly(modFolder.replaceAll(`'`, "").replaceAll(`\\`, ""))}')" style="display: inline">
																	<i class="fas fa-arrows-alt" slot="icon"></i>
																</neo-button>
															</div>
															<div class="float-left" style="max-width: ${window.visualViewport.height > 1080 ? "70%" : "60%"}">
																<div class="mb-2">
																	<h3 class="font-semibold text-xl inline"><img src="rpkgMod.png" class="w-8 inline align-middle">  <span class="align-middle">${sanitiseStrongly(modFolder.replaceAll(`"`, "").replaceAll(`\\`, ""))}</span></h3><br>
																</div>
																<p>RPKG-only mod</p>
															</div>
														</div><br>`
				}
			} catch {}
		}
		
		for (modFolder of fs.readdirSync("../Mods").filter(folder => !config.loadOrder.includes(folder) && (!fs.existsSync(path.join("..", "Mods", folder, "manifest.json")) || !config.loadOrder.includes(json5.parse(String(fs.readFileSync(path.join("..", "Mods", folder, "manifest.json")))).id)))) {
			try {
				if (!fs.lstatSync(path.join("..", "Mods", modFolder)).isDirectory()) {
					if (path.extname(modFolder) == ".zip") {
						$("#availableMods")[0].innerHTML += `<div class="p-8 bg-gray-900 w-full flow-root shadow-xl rounded-md text-white">
																<div class="float-right">
																	<neo-button small label="Install" gradientFrom="from-teal-400" gradientTo="to-blue-500" onclick="importZIP('${path.join("..", "Mods", sanitiseStrongly(modFolder.replaceAll(`'`, "").replaceAll(`\\`, ""))).replaceAll(`\\`, `\\\\`)}', true)" style="display: inline">
																		<i class="fas fa-file-import" slot="icon"></i>
																	</neo-button>
																</div>
																<div class="float-left" style="max-width: 80%">
																	<div class="mb-2">
																		<h3 class="font-semibold text-xl inline"><img src="zipMod.png" class="w-8 inline align-middle">  <span class="align-middle">${sanitiseStrongly(modFolder.replaceAll(`"`, "").replaceAll(`\\`, ""))}</span></h3><br>
																	</div>
																	<p>Zipped mod</p>
																</div>
															</div><br>`
					} else {
						$("#availableMods")[0].innerHTML += `<div class="p-8 bg-gray-900 w-full flow-root shadow-xl rounded-md text-white">
																<div class="float-right">
																	<neo-button small label="Invalid" gradientFrom="from-rose-400" gradientTo="to-red-500" style="display: inline">
																		<i class="fas fa-times" slot="icon"></i>
																	</neo-button>
																</div>
																<div class="float-left" style="max-width: 80%">
																	<div class="mb-2">
																		<h3 class="font-semibold text-xl inline"><img src="invalidMod.png" class="w-8 inline align-middle">  <span class="align-middle">${sanitiseStrongly(modFolder.replaceAll(`"`, "").replaceAll(`\\`, ""))}</span></h3><br>
																	</div>
																	<p>Not a mod</p>
																</div>
															</div><br>`
					}
				} else if (fs.existsSync(path.join("..", "Mods", modFolder, "manifest.json"))) {
					var modManifest = json5.parse(fs.readFileSync(path.join("..", "Mods", modFolder, "manifest.json")))

					for (let key of ["id", "name", "description", "authors", "version", "frameworkVersion"]) {
						if (typeof modManifest[key] == "undefined") {
							continue
						}
					}
					
					$("#availableMods")[0].innerHTML += `<div class="p-8 bg-gray-900 w-full flow-root shadow-xl rounded-md text-white">
															<div class="float-right">
																<neo-button small label="Enable" gradientFrom="from-emerald-400" gradientTo="to-lime-600" onclick="enableMod('${sanitiseStrongly(modFolder.replaceAll(`'`, "").replaceAll(`\\`, ""))}')" style="display: inline">
																	<i class="fas fa-plus" slot="icon"></i>
																</neo-button>
															</div>
															<div class="float-left" style="max-width: 80%">
																<div class="mb-2">
																	<h3 class="font-semibold text-xl inline"><img src="frameworkMod.png" class="w-8 inline align-middle">  <span class="align-middle">${sanitise(modManifest.name)} <span class="font-light">by ${modManifest.authors.map(a=>sanitise(a)).join(", ")}</span></span></h3><br>
																</div>
																<p>${sanitise(modManifest.description)}</p>
															</div>
														</div><br>`
				} else if (klaw(path.join("..", "Mods", modFolder)).some(a=>a.stats.size > 0 && a.path.endsWith(".rpkg"))) {
					$("#availableMods")[0].innerHTML += `<div class="p-8 bg-gray-900 w-full flow-root shadow-xl rounded-md text-white">
															<div class="float-right">
																<neo-button small label="Enable" gradientFrom="from-emerald-400" gradientTo="to-lime-600" onclick="enableMod('${sanitiseStrongly(modFolder.replaceAll(`'`, "").replaceAll(`\\`, ""))}')" style="display: inline">
																	<i class="fas fa-plus" slot="icon"></i>
																</neo-button>
															</div>
															<div class="float-left" style="max-width: 80%">
																<div class="mb-2">
																	<h3 class="font-semibold text-xl inline"><img src="rpkgMod.png" class="w-8 inline align-middle">  <span class="align-middle">${sanitiseStrongly(modFolder.replaceAll(`"`, "").replaceAll(`\\`, ""))}</span></h3><br>
																</div>
																<p>RPKG-only mod</p>
															</div>
														</div><br>`
				}
			} catch {}
		}
	} else {
		$("#noModsMessage")[0].style.display = "block"
		$("#mods")[0].style.display = "none"
	}
}

function showMessage(title, message, icon) {
	Swal.fire({
		width: '40rem',
		showConfirmButton: false,
		allowEnterKey: true,
		title: title,
		html: message,
		icon: icon
	})
}

async function enableMod(mod) {
	var config = json5.parse(fs.readFileSync("../config.json"))

	config.loadOrder.push(fs.existsSync(path.join("..", "Mods", mod, "manifest.json")) ? json5.parse(String(fs.readFileSync(path.join("..", "Mods", mod, "manifest.json")))).id : mod)

	fs.writeFileSync("../config.json", json5.stringify(config))
	document.getElementById("deployReminder").style.display = "block"
	document.getElementById("enabledModsText").innerText = "To Be Applied"

	await refreshMods()

	if (fs.existsSync(path.join("..", "Mods", mod, "manifest.json")) && json5.parse(String(fs.readFileSync(path.join("..", "Mods", mod, "manifest.json")))).options && json5.parse(String(fs.readFileSync(path.join("..", "Mods", mod, "manifest.json")))).options.some(a=>a.type == "checkbox" || a.type == "select")) {
		modSettings(mod)
	}
}

async function disableMod(mod) {
	var config = json5.parse(fs.readFileSync("../config.json"))

	config.loadOrder = config.loadOrder.filter(a => a != (fs.existsSync(path.join("..", "Mods", mod, "manifest.json")) ? json5.parse(String(fs.readFileSync(path.join("..", "Mods", mod, "manifest.json")))).id : mod))

	fs.writeFileSync("../config.json", json5.stringify(config))
	document.getElementById("deployReminder").style.display = "block"
	document.getElementById("enabledModsText").innerText = "To Be Applied"

	await refreshMods()
}

async function moveMod(modID) {
	var config = json5.parse(fs.readFileSync("../config.json"))

	var index = (await Swal.fire({
		title: "Move Objective",
		text: "Position in the list to move to (first item is 1, second is 2, etc.):",
		width: '40rem',
		input: "text",
		inputAttributes: {
		  autocapitalize: 'off'
		},
		showCancelButton: true,
		confirmButtonText: 'OK',
		allowOutsideClick: false
	})).value

	if (index !== null && index != "" && String(parseInt(index) - 1) != "NaN" && parseInt(index) - 1 >= 0) {
		var modIndex = 0
		for (let mod of config.loadOrder) {
			if ((!(fs.existsSync(path.join("..", "Mods", mod)) && !fs.existsSync(path.join("..", "Mods", mod, "manifest.json")) && klaw(path.join("..", "Mods", mod)).filter(a=>a.stats.size > 0).map(a=>a.path).some(a=>a.endsWith(".rpkg"))) // Mod is not an RPKG mod
				? fs.readdirSync(path.join("..", "Mods")).find(a=>fs.existsSync(path.join("..", "Mods", a, "manifest.json")) && json5.parse(String(fs.readFileSync(path.join("..", "Mods", a, "manifest.json")))).id == mod) // Find mod by ID
				: mod) == modID) { break }
			modIndex += 1
		}

		var removed = config.loadOrder.splice(modIndex, 1)[0]
		config.loadOrder.splice(parseInt(index) - 1, 0, removed)
	}
	
	fs.writeFileSync("../config.json", json5.stringify(config))
	document.getElementById("deployReminder").style.display = "block"
	document.getElementById("enabledModsText").innerText = "To Be Applied"

	await refreshMods()
}

function checkModOptions(modFolder) {
	let manifest = json5.parse(String(fs.readFileSync(path.join("..", "Mods", modFolder, "manifest.json"))))

	let config = json5.parse(fs.readFileSync("../config.json"))

	if (!config.modOptions[manifest.id]) {
		config.modOptions[manifest.id] = [...manifest.options.filter(a=>a.enabledByDefault).map(a=>a.type == "select" ? a.group + ":" + a.name : a.name)]
	} // Default mod options

	for (var i = config.modOptions[manifest.id].length - 1; i >= 0; i--) {
		if (!manifest.options.some(a=>a.type == "checkbox" && a.name == config.modOptions[manifest.id][i]) && !manifest.options.some(a=>a.type == "select" && ((a.group + ":" + a.name) == (config.modOptions[manifest.id][i])))) {
			if (manifest.options.some(a=>a.type == "select" && a.name == config.modOptions[manifest.id][i])) {
				// There's a select and it's using the old name format (just the name), change it to the new format (group:name)
				config.modOptions[manifest.id][i] = manifest.options.find(a=>a.type == "select" && a.name == config.modOptions[manifest.id][i]).group + ":" + manifest.options.find(a=>a.type == "select" && a.name == config.modOptions[manifest.id][i]).name
			} else {
				// Remove it, it doesn't exist
				config.modOptions[manifest.id].splice(i, 1)
			}
		}
	} // Remove non-existent mod options and upgrade old select references

	for (var i = config.modOptions[manifest.id].length - 1; i >= 0; i--) {
		if (manifest.options.find(a=>(a.type == "checkbox" && a.name == config.modOptions[manifest.id][i]) || (a.type == "select" && ((a.group + ":" + a.name) == (config.modOptions[manifest.id][i]))))?.requirements) {
			if (!manifest.options.find(a=>(a.type == "checkbox" && a.name == config.modOptions[manifest.id][i]) || (a.type == "select" && ((a.group + ":" + a.name) == (config.modOptions[manifest.id][i])))).requirements.every(a=>config.loadOrder.includes(a))) {
				config.modOptions[manifest.id].splice(i, 1)
			}
		}
	} // Remove mod options that require non-present mods

	fs.writeFileSync("../config.json", json5.stringify(config))
}

async function modSettings(modFolder) {
	let manifest = json5.parse(String(fs.readFileSync(path.join("..", "Mods", modFolder, "manifest.json"))))

	checkModOptions(modFolder) // Make sure mod options are valid

	let config = json5.parse(fs.readFileSync("../config.json"))

	let settingsHTMLs = [``, ``]

	let useColumns = manifest.options.length > 15
	let column = 0

	let groups = {}
	for (let option of manifest.options) {
		if (option.type == "checkbox") {
			settingsHTMLs[column] += `<div class="mb-2"><label class="inline-flex items-center">
									<input${(option.requirements && !option.requirements.every(a=>config.loadOrder.includes(a))) ? ' disabled' : ''} type="checkbox"${json5.parse(fs.readFileSync("../config.json")).modOptions[manifest.id].includes(sanitiseStrongly(option.name.replaceAll(`"`, "").replaceAll(`\\`, ""))) ? ' checked' : ''} class="form-checkbox cursor-pointer h-5 w-5 text-gray-700 bg-white" data-optionName="${sanitiseStrongly(option.name.replaceAll(`"`, "").replaceAll(`\\`, ""))}"><span class="ml-2${(option.requirements && !option.requirements.every(a=>config.loadOrder.includes(a))) ? ' text-gray-400' : ''}" data-optionName="${sanitiseStrongly(option.name.replaceAll(`"`, "").replaceAll(`\\`, ""))}">${sanitiseStrongly(option.name.replaceAll(`"`, "").replaceAll(`\\`, ""))}</span>
							</label></div>`
		} else if (option.type == "select") {
			if (!groups[option.group]) { groups[option.group] = [] }

			groups[option.group].push([option.name, option.tooltip, option.requirements, option.image])
		}

		column = useColumns ? (column ? 0 : 1) : 0
	}

	column = 0
	for (let group of Object.keys(groups)) {
		settingsHTMLs[column] += `<div class="mb-2">
							<span class="font-semibold">${sanitiseStrongly(group.replaceAll(`"`, "").replaceAll(`\\`, ""))}</span>`
		for (let option of groups[group]) {
			settingsHTMLs[column] += `<br><label class="inline-flex items-center">
								<input${(option[2] && !option[2].every(a=>config.loadOrder.includes(a))) ? ' disabled' : ''} type="radio"${json5.parse(fs.readFileSync("../config.json")).modOptions[manifest.id].includes(sanitiseStrongly(group.replaceAll(`"`, "").replaceAll(`\\`, "")) + ":" + sanitiseStrongly(option[0].replaceAll(`"`, "").replaceAll(`\\`, ""))) ? ' checked' : ''} class="form-radio" name="${sanitiseStrongly(group.replaceAll(`"`, "").replaceAll(`\\`, ""))}" data-optionName="${sanitiseStrongly(group.replaceAll(`"`, "").replaceAll(`\\`, "")) + ":" + sanitiseStrongly(option[0].replaceAll(`"`, "").replaceAll(`\\`, ""))}">
								<span class="ml-2${(option[2] && !option[2].every(a=>config.loadOrder.includes(a))) ? ' text-gray-400' : ''}" data-optionName="${sanitiseStrongly(group.replaceAll(`"`, "").replaceAll(`\\`, "")) + ":" + sanitiseStrongly(option[0].replaceAll(`"`, "").replaceAll(`\\`, ""))}">${sanitiseStrongly(option[0].replaceAll(`"`, "").replaceAll(`\\`, ""))}</span>
							</label>`
		}
		
		settingsHTMLs[column] += `</div>`

		column = useColumns ? (column ? 0 : 1) : 0
	}

	await Swal.fire({
		title: manifest.name,
		html: `${sanitise(manifest.description)}<br><br><div class="text-left mt-4 text-2xl font-semibold">Settings</div><div class="text-left overflow-auto h-96">${useColumns ? `
		<div class="grid grid-cols-2 gap-4 w-full">
			<div>
				${settingsHTMLs[0]}
			</div>
			<div>
				${settingsHTMLs[1]}
			</div>
		</div>` : settingsHTMLs[0]}</div><br>`,
		customClass: {
			htmlContainer: 'text-center'
		},
		width: '50rem',
		showCancelButton: false,
		focusConfirm: false,
		confirmButtonText: 'Save',
		didOpen: () => {
			for (let option of manifest.options.filter(a=>a.type == "checkbox")) {
				if (option.image || option.tooltip || (option.requirements && !option.requirements.every(a=>config.loadOrder.includes(a)))) {
					if (option.image && !option.image.includes("\"") && !option.image.includes("..") && !option.image.includes(":")) {
						document.querySelector(".swal2-container").children[1]?.remove()
						document.querySelector(".swal2-container").insertAdjacentHTML("beforeend", `
							<div tabindex="-1" role="dialog" aria-live="assertive" aria-modal="true" style="width: 50rem; display: grid; margin: auto; position: relative; box-sizing: border-box; flex-direction: column; justify-content: center; max-width: 100%; padding: 1.25em; border: none; border-radius: 5px; background: #19191a; font-family: inherit; font-size: 1rem; -webkit-tap-highlight-color: transparent; -webkit-animation: swal2-show 0.3s; animation: swal2-show 0.3s;">
								<button type="button" class="swal2-close" aria-label="Close this dialog" style="display: none;">×</button>
								<img class="swal2-image" style="display: block;" src="${path.resolve(path.join("..", "Mods", modFolder, option.image))}">
								<h2 class="swal2-title" style="display: block;">${sanitiseStrongly(option.name.replaceAll(`"`, "").replaceAll(`\\`, ""))}</h2>
								<div class="swal2-html-container text-center" style="display: block;">${sanitise(option.tooltip) + ((option.requirements && !option.requirements.every(a=>config.loadOrder.includes(a))) ? `<br>Requires: ${option.requirements.map(a=>sanitiseStrongly(a)).join(", ")}` : ``)}<br>
								</div>
							</div>
						`)

						document.querySelector(`span[data-optionName="${sanitiseStrongly(option.name.replaceAll(`"`, "").replaceAll(`\\`, ""))}"]`).addEventListener("mouseover", () => {
							document.querySelector(".swal2-container").children[1]?.remove()
							document.querySelector(".swal2-container").insertAdjacentHTML("beforeend", `
								<div tabindex="-1" role="dialog" aria-live="assertive" aria-modal="true" style="width: 50rem; display: grid; margin: auto; position: relative; box-sizing: border-box; flex-direction: column; justify-content: center; max-width: 100%; padding: 1.25em; border: none; border-radius: 5px; background: #19191a; font-family: inherit; font-size: 1rem; -webkit-tap-highlight-color: transparent; -webkit-animation: swal2-show 0.3s; animation: swal2-show 0.3s;">
									<button type="button" class="swal2-close" aria-label="Close this dialog" style="display: none;">×</button>
									<img class="swal2-image" style="display: block;" src="${path.resolve(path.join("..", "Mods", modFolder, option.image))}">
									<h2 class="swal2-title" style="display: block;">${sanitiseStrongly(option.name.replaceAll(`"`, "").replaceAll(`\\`, ""))}</h2>
									<div class="swal2-html-container text-center" style="display: block;">${sanitise(option.tooltip) + ((option.requirements && !option.requirements.every(a=>config.loadOrder.includes(a))) ? `<br>Requires: ${option.requirements.map(a=>sanitiseStrongly(a)).join(", ")}` : ``)}<br>
									</div>
								</div>
							`)
						})
					} else {
						tippy(`span[data-optionName="${sanitiseStrongly(option.name.replaceAll(`"`, "").replaceAll(`\\`, ""))}"]`, {
							content: sanitise(option.tooltip) + ((option.requirements && !option.requirements.every(a=>config.loadOrder.includes(a))) ? `<br>Requires: ${option.requirements.map(a=>sanitiseStrongly(a)).join(", ")}` : ``),
							placement: "right"
						});
					}
				}
			}
			
			for (let group of Object.keys(groups)) {
				for (let option of groups[group]) {
					if (option[3] || option[1] || (option[2] && !option[2].every(a=>config.loadOrder.includes(a)))) {
						if (option[3] && !option[3].includes("\"") && !option[3].includes("..") && !option[3].includes(":")) {
							document.querySelector(".swal2-container").children[1]?.remove()
							document.querySelector(".swal2-container").insertAdjacentHTML("beforeend", `
								<div tabindex="-1" role="dialog" aria-live="assertive" aria-modal="true" style="width: 50rem; display: grid; margin: auto; position: relative; box-sizing: border-box; flex-direction: column; justify-content: center; max-width: 100%; padding: 1.25em; border: none; border-radius: 5px; background: #19191a; font-family: inherit; font-size: 1rem; -webkit-tap-highlight-color: transparent; -webkit-animation: swal2-show 0.3s; animation: swal2-show 0.3s;">
									<button type="button" class="swal2-close" aria-label="Close this dialog" style="display: none;">×</button>
									<img class="swal2-image" style="display: block;" src="${path.resolve(path.join("..", "Mods", modFolder, option[3]))}">
									<h2 class="swal2-title" style="display: block;">${sanitiseStrongly(option[0].replaceAll(`"`, "").replaceAll(`\\`, ""))}</h2>
									<div class="swal2-html-container text-center" style="display: block;">${sanitise(option[1]) + ((option[2] && !option[2].every(a=>config.loadOrder.includes(a))) ? `<br>Requires: ${option[2].map(a=>sanitiseStrongly(a)).join(", ")}` : ``)}<br>
									</div>
								</div>
							`)

							document.querySelector(`span[data-optionName="${sanitiseStrongly(group.replaceAll(`"`, "").replaceAll(`\\`, "")) + ":" + sanitiseStrongly(option[0].replaceAll(`"`, "").replaceAll(`\\`, ""))}"]`).addEventListener("mouseover", () => {
								document.querySelector(".swal2-container").children[1]?.remove()
								document.querySelector(".swal2-container").insertAdjacentHTML("beforeend", `
									<div tabindex="-1" role="dialog" aria-live="assertive" aria-modal="true" style="width: 50rem; display: grid; margin: auto; position: relative; box-sizing: border-box; flex-direction: column; justify-content: center; max-width: 100%; padding: 1.25em; border: none; border-radius: 5px; background: #19191a; font-family: inherit; font-size: 1rem; -webkit-tap-highlight-color: transparent; -webkit-animation: swal2-show 0.3s; animation: swal2-show 0.3s;">
										<button type="button" class="swal2-close" aria-label="Close this dialog" style="display: none;">×</button>
										<img class="swal2-image" style="display: block;" src="${path.resolve(path.join("..", "Mods", modFolder, option[3]))}">
										<h2 class="swal2-title" style="display: block;">${sanitiseStrongly(option[0].replaceAll(`"`, "").replaceAll(`\\`, ""))}</h2>
										<div class="swal2-html-container text-center" style="display: block;">${sanitise(option[1]) + ((option[2] && !option[2].every(a=>config.loadOrder.includes(a))) ? `<br>Requires: ${option[2].map(a=>sanitiseStrongly(a)).join(", ")}` : ``)}<br>
										</div>
									</div>
								`)
							})
						} else {
							tippy(`span[data-optionName="${sanitiseStrongly(group.replaceAll(`"`, "").replaceAll(`\\`, "")) + ":" + sanitiseStrongly(option[0].replaceAll(`"`, "").replaceAll(`\\`, ""))}"]`, {
								content: sanitise(option[1]) + ((option[2] && !option[2].every(a=>config.loadOrder.includes(a))) ? `<br>Requires: ${option[2].map(a=>sanitiseStrongly(a)).join(", ")}` : ``),
								placement: "right"
							});
						}
					}
				}
			}
		},
		willClose: async (popup) => {
			let enabledOptions = []
			for (let input of popup.querySelectorAll("input")) {
				if (input.checked) {
					enabledOptions.push(input.getAttribute("data-optionName"))
				}
			}

			let config = json5.parse(fs.readFileSync("../config.json"))

			config.modOptions[manifest.id] = enabledOptions.sort(function(a, b){
				return manifest.options.map(a=>a.name).indexOf(a.id) - manifest.options.map(a=>a.name).indexOf(b.id)
			});
		
			fs.writeFileSync("../config.json", json5.stringify(config))
		}
	})
}

async function deployMods() {
	Swal.fire({
		title: 'Deploying your mods',
		html: 'Grab a coffee or something - your enabled mods are being applied to the game.<br><br><i></i>',
		width: '40rem',
		didOpen: async () => {
			Swal.showLoading()

			setTimeout(() => {
				var config = json5.parse(fs.readFileSync("../config.json"))

				console.log(`Sorting mods`)

				let doAnotherCycle = true
				let cycle = 0
				while (doAnotherCycle && cycle < 100) {
					cycle ++
					doAnotherCycle = false

					console.log(`Cycle ${cycle}:`)

					config.loadOrder = ["dummy-1", ...config.loadOrder.filter(a => a != "dummy-1" && a != "dummy-2"), "dummy-2"]
					let modsToSort = JSON.parse(JSON.stringify(config.loadOrder)).filter(a => a != "dummy-1" && a != "dummy-2")

					modSorting:
					while (modsToSort.length) {
						for (let mod of modsToSort) {
							let modFolder = !(fs.existsSync(path.join("..", "Mods", mod)) && !fs.existsSync(path.join("..", "Mods", mod, "manifest.json")) && klaw(path.join("..", "Mods", mod)).filter(a=>a.stats.size > 0).map(a=>a.path).some(a=>a.endsWith(".rpkg"))) // Mod is not an RPKG mod
											? fs.readdirSync(path.join("..", "Mods")).find(a=>fs.existsSync(path.join("..", "Mods", a, "manifest.json")) && json5.parse(String(fs.readFileSync(path.join("..", "Mods", a, "manifest.json")))).id == mod) // Find mod by ID
											: mod // Mod is an RPKG mod, use folder name
							
							if (fs.existsSync(path.join("..", "Mods", modFolder, "manifest.json"))) {
								let modManifest = json5.parse(fs.readFileSync(path.join("..", "Mods", modFolder, "manifest.json")))
								
								modManifest.options || (modManifest.options = [])

								modManifest.loadBefore || (modManifest.loadBefore = [])
								modManifest.loadBefore.push(modManifest.options.filter(a => (config.modOptions[modManifest.id].includes(a.name) || config.modOptions[modManifest.id].includes(a.group + ":" + a.name)) || (a.type == "requirement" && a.mods.every(b=>config.loadOrder.includes(b)))).map(a=>a.loadBefore).filter(a=>a).flat(1))
								
								modManifest.loadAfter || (modManifest.loadAfter = [])
								modManifest.loadAfter.push(modManifest.options.filter(a => (config.modOptions[modManifest.id].includes(a.name) || config.modOptions[modManifest.id].includes(a.group + ":" + a.name)) || (a.type == "requirement" && a.mods.every(b=>config.loadOrder.includes(b)))).map(a=>a.loadAfter).filter(a=>a).flat(1))

								for (let modToLoadBefore of modManifest.loadBefore) { // Move the mod to just before where the other mod is
									if (config.loadOrder.includes(modToLoadBefore) && config.loadOrder.indexOf(modToLoadBefore) < config.loadOrder.indexOf(mod)) {
										if (config.loadOrder.indexOf(modToLoadBefore) - 1 == 0) {
											config.loadOrder = config.loadOrder.filter(a=>a!=mod)
											config.loadOrder.unshift(mod)
										} else {
											config.loadOrder.splice(config.loadOrder.indexOf(modToLoadBefore) - 1, 0, config.loadOrder.splice(config.loadOrder.indexOf(mod), 1)[0]);
										}
										console.log(`Moved ${mod} to before ${modToLoadBefore}`, config.loadOrder)
										modsToSort = modsToSort.filter(a=>a!=mod)
										doAnotherCycle = true
										continue modSorting
									}
								}

								for (let modToLoadAfter of modManifest.loadAfter) { // Move the mod to just after where the other mod is
									if (config.loadOrder.includes(modToLoadAfter) && config.loadOrder.indexOf(modToLoadAfter) > config.loadOrder.indexOf(mod)) {
										config.loadOrder.splice(config.loadOrder.indexOf(modToLoadAfter) + 1, 0, config.loadOrder.splice(config.loadOrder.indexOf(mod), 1)[0]);
										console.log(`Moved ${mod} to after ${modToLoadAfter}`, config.loadOrder)
										modsToSort = modsToSort.filter(a=>a!=mod)
										doAnotherCycle = true
										continue modSorting
									}
								}
							}

							modsToSort = modsToSort.filter(a=>a!=mod)
							continue modSorting
						}
					}
				}

				config.loadOrder = config.loadOrder.filter(a => a != "dummy-1" && a != "dummy-2")

				if (cycle < 100) {
					fs.writeFileSync("../config.json", json5.stringify(config))
				} else {
					showMessage("Dependency cycle", "The framework couldn't sort your mods! Ask the developer of whichever mod you most recently installed to investigate this. Also, report this to Atampy26 on Hitman Forum or Discord.", "error")
				}

				let deployProcess = child_process.spawn(path.join(process.cwd(), "..", "Deploy.exe"), ["consoleLog"], { // any arguments will disable nicer logging
					cwd: '..'
				})

				let fullOutput = ""
			
				deployProcess.stdout.on("data", (data) => {
					fullOutput += String(data)

					Swal.getHtmlContainer().querySelector('i').textContent = fullOutput.split("\n").slice(fullOutput.endsWith("\n") ? -2 : -1)[0]
				})
				
				deployProcess.on("close", (data) => {
					if (fullOutput.includes("Deployed all mods successfully.")) {
						Swal.close()

						document.getElementById("deployReminder").style.display = "none"
						document.getElementById("enabledModsText").innerText = "Enabled Mods"
					
						showMessage("Deployed successfully", "Successfully deployed. You can now play the game with mods!", "success")
					} else {
						Swal.close()
					
						showMessage("Error in deployment", "<i>" + sanitise(fullOutput.split("\n").slice(fullOutput.endsWith("\n") ? -2 : -1)[0]) + "</i>", "error")
					}

					refreshMods()
				})
			}, 500)
		},
		allowEnterKey: false,
		allowOutsideClick: false,
		allowEscapeKey: false,
		showConfirmButton: false
	})
}

async function importZIP(automatePath, automateMoveZip) {
	var modPath = automatePath || remote.dialog.showOpenDialogSync({
		title: "Import a Framework ZIP file",
		buttonLabel: "Import",
		filters: [{ name: 'Framework ZIP Files', extensions: ['zip'] }],
		properties: ["openFile", "dontAddToRecent"]
	})[0]

	Swal.fire({
		title: 'Installing the mod',
		html: 'Please wait - the ZIP file is being extracted and installed as a framework mod.',
		width: '40rem',
		didOpen: async () => {
			Swal.showLoading()

			setTimeout(() => {
				if (automateMoveZip) {
					fs.removeSync("./mod.zip")
					fs.moveSync(modPath, "./mod.zip")
					modPath = "./mod.zip"
				}

				fs.removeSync("./staging")
				fs.ensureDirSync("./staging")

				new AdmZip(modPath).extractAllTo("./staging")

				if (klaw("./staging", { depthLimit: 0 }).some(a=>a.stats.size)) {
					showMessage("Invalid framework ZIP", "The framework ZIP file contains files in the root directory. Contact the mod author.", "error")
					return
				}

				fs.copySync("./staging", "../Mods")

				fs.removeSync("./staging")

				Swal.close()

				refreshMods()
			}, 500)
		},
		allowEnterKey: false,
		allowOutsideClick: false,
		allowEscapeKey: false,
		showConfirmButton: false
	})
}

async function importRPKG() {
	var modPath = remote.dialog.showOpenDialogSync({
		title: "Import an RPKG file",
		buttonLabel: "Import",
		filters: [{ name: 'RPKG Files', extensions: ['rpkg'] }],
		properties: ["openFile", "dontAddToRecent"]
	})[0]

	var name = (await Swal.fire({
		title: "Mod Name",
		text: "Enter a short name for the mod (no special characters other than spaces):",
		width: '40rem',
		input: "text",
		inputAttributes: {
		  autocapitalize: 'off'
		},
		showCancelButton: true,
		confirmButtonText: 'OK',
		allowOutsideClick: false
	})).value

	if (!name) {return}

	try {
		var result = [...modPath.matchAll(/(chunk[0-9]*(?:patch[0-9]*)?)\.rpkg/g)]
		result = [...result[result.length - 1][result[result.length - 1].length - 1].matchAll(/(chunk[0-9]*)/g)]
		var chunk = result[result.length - 1][result[result.length - 1].length - 1]

		if (!chunk) {
			throw new Error()
		}
	} catch {
		var chunk = (await Swal.fire({
			title: "Mod Chunk",
			text: "Enter the mod's chunk (if it advises you to name it chunk0patch2, for example, then it's chunk0):",
			width: '40rem',
			input: "text",
			inputAttributes: {
			  autocapitalize: 'off'
			},
			showCancelButton: true,
			confirmButtonText: 'OK',
			allowOutsideClick: false
		})).value

		if (!chunk) {return}
	}

	Swal.fire({
		title: 'Installing the mod',
		html: 'Please wait - the RPKG file is being installed as a framework mod.',
		width: '40rem',
		didOpen: async () => {
			Swal.showLoading()

			setTimeout(() => {
				fs.ensureDirSync(path.join("..", "Mods", name, chunk))
				fs.copyFileSync(modPath, path.join("..", "Mods", name, chunk, path.basename(modPath)))

				Swal.close()

				refreshMods()
			}, 100)
		},
		allowEnterKey: false,
		allowOutsideClick: false,
		allowEscapeKey: false,
		showConfirmButton: false
	})
}

execute()

function sanitise(html) {
	return sanitizeHtml(html, {
		allowedTags: [ 'b', 'i', 'em', 'strong', 'br']
	});
}

function sanitiseWeakly(html) {
	return sanitizeHtml(html);
}

function sanitiseStrongly(html) {
	return sanitizeHtml(html.replaceAll(`"`, "").replaceAll(`\\`, ""), {
		allowedTags: []
	});
}