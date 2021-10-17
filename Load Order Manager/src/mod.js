var Swal = require("sweetalert2")
var fs = require('fs-extra')
var path = require('path');
var child_process = require("child_process");
var AdmZip = require('adm-zip')
var sanitizeHtml = require('sanitize-html')
var remote = require('@electron/remote')
var semver = require('semver');
var downloadFile = require("async-get-file");

window.$ = window.jQuery = require('jquery');

frameworkVersion = "0.1.0"

async function updateFramework() {
	var frameworkUpdateData = await (await fetch("https://hitman-resources.netlify.app/framework/framework.json")).json()
	Swal.fire({
		title: 'Updating the framework',
		html: 'Please wait - the framework is being updated to the latest version (' + frameworkUpdateData.version + '):<br><br><i>' + frameworkUpdateData.changelog + "</i>",
		didOpen: async () => {
			Swal.showLoading()

			setTimeout(async () => {
				// https://github.com/hitman-resources/simple-mod-framework/releases/latest/download/Release.zip
				await downloadFile("https://nightly.link/hitman-resources/simple-mod-framework/workflows/main/main/Mod%20Framework.zip?h=6ea9fd5ddf66c9e4adbcbe858e65b9de8ce44998", {
					directory: ".",
					filename: "latest-release.zip"
				});
				
				fs.emptyDirSync("./staging")
				new AdmZip("./latest-release.zip").extractAllTo("./staging")

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
				fs.removeSync("./staging/Load Order Manager/v8_context_snapshot.bi")

				fs.copySync("./staging", ".")
			
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
	var frameworkUpdateData = await (await fetch("https://hitman-resources.netlify.app/framework/framework.json")).json()
	if (semver.lt(frameworkVersion, frameworkUpdateData.version)) {
		document.getElementById("frameworkUpdateAvailableText").innerHTML = ({patch: "Patch available", minor: "Minor update available", major: "Major update available"})[semver.diff(frameworkVersion, frameworkUpdateData.version)] || "Update available"
		document.getElementById("frameworkUpdateProcessText").innerHTML = frameworkUpdateData.processText
		document.getElementById("frameworkVersionCurrent").innerHTML = frameworkVersion
		document.getElementById("frameworkVersionNext").innerHTML = frameworkUpdateData.version
		document.getElementById("frameworkChangelog").innerHTML = frameworkUpdateData.changelog
		document.getElementById("frameworkUpdateAvailable").style.display = "block"
	}
}

async function fetchModUpdates() {
	for (var modFolder of fs.readdirSync("../Mods")) {
		if (fs.existsSync(path.join("..", "Mods", modFolder, "manifest.json"))) {
			var modManifest = JSON.parse(fs.readFileSync(path.join("..", "Mods", modFolder, "manifest.json")))
			if (modManifest.updateCheck) {
				var modUpdateData = await (await fetch(modManifest.updateCheck)).json()
				if (semver.lt(modManifest.version, modUpdateData.version)) {
					$("#modUpdateAvailable")[0].style.display = "block"
					$("#modUpdateCards")[0].innerHTML += `<div class="text-lg text-center p-4 m-4 shadow-2xl bg-gradient-to-br from-gray-800 to-gray-900 cursor-pointer" onclick="updateMod('${modFolder}')">
															<div class="flex flex-initial flex-wrap flex-row justify-center w-full">
																<div>
																	<span class="font-bold">${sanitise(modManifest.name)}</span> v<span>${sanitise(modManifest.version)}</span> -> v<span>${sanitise(modUpdateData.version)}</span><br>
																	<span>${sanitise(modManifest.description)}</span>
																</div>
															</div>
														</div>`
				}
			}
		}
	}
}

async function execute() {
	setTimeout(fetchUpdates, 1000)
	setTimeout(fetchModUpdates, 1000)

	// if (!config.hasUsedGUI) {
	// 	await swal.fire({
	// 		title: "Select your game folder",
	// 		html: "Click Continue to select your HITMAN 3 folder (the folder with Retail, Runtime and Launcher.exe inside it).",
	// 		showConfirmButton: true,
	// 		confirmButtonText: `Continue`
	// 	})

	// 	var gameDirectory = electron.remote.dialog.showOpenDialogSync({
	// 		title: "Select your HITMAN 3 folder",
	// 		buttonLabel: "Select",
	// 		properties: ["openDirectory", "dontAddToRecent"]
	// 	})[0]

	// 	while (!fs.existsSync(path.join(gameDirectory, 'Runtime')) || !fs.existsSync(path.join(gameDirectory, 'Retail')) || !fs.existsSync(path.join(gameDirectory, 'ent')) || !fs.existsSync(path.join(gameDirectory, 'Launcher.exe'))) {
	// 		await swal.fire({
	// 			title: "Invalid folder",
	// 			html: "Please select the HITMAN 3 folder - the folder containing ent, Retail, Runtime and Launcher.exe.",
	// 			showConfirmButton: true,
	// 			icon: "error",
	// 			confirmButtonText: `Continue`
	// 		})
	
	// 		var gameDirectory = electron.remote.dialog.showOpenDialogSync({
	// 			title: "Select your HITMAN 3 folder, containing ent, Retail, Runtime and Launcher.exe.",
	// 			buttonLabel: "Select",
	// 			properties: ["openDirectory", "dontAddToRecent"]
	// 		})[0]
	// 	}

	// 	var config = JSON.parse(fs.readFileSync("../config.json"))

	// 	config.hasUsedGUI = true
	// 	config.runtimePath = path.join(gameDirectory, 'Runtime')

	// 	fs.writeFileSync("../config.json", JSON.stringify(config))

	// 	showMessage("All set!", "You can begin using the Simple Mod Framework.", "success")
	// }

	await refreshMods()
}

async function refreshMods() {
	$("#mods")[0].style.display = "flex"
	$("#noModsMessage")[0].style.display = "none"
	$("#enabledMods")[0].innerHTML = ""
	$("#availableMods")[0].innerHTML = ""

	var config = JSON.parse(fs.readFileSync("../config.json"))
	
	if (fs.readdirSync("../Mods").length > 0) {
		for (modFolder of config.loadOrder) {
			if (fs.existsSync(path.join("..", "Mods", modFolder, "manifest.json"))) {
				var modManifest = JSON.parse(fs.readFileSync(path.join("..", "Mods", modFolder, "manifest.json")))
				$("#enabledMods")[0].innerHTML += `<div class="p-12 bg-gray-900 w-full shadow-2xl rounded-md text-white">
														<div class="mb-2">
															<h3 class="font-semibold text-2xl inline"><img src="frameworkMod.png" class="w-10 inline align-middle"> <span class="align-middle">${sanitise(modManifest.name)} <span class="font-light">by ${modManifest.authors.map(a=>sanitise(a)).join(", ")}</span></span></h3><br>
														</div>
														<div class="mb-1">
															<p>${sanitise(modManifest.description)}</p><br>
														</div>
														<neo-button label="Disable" gradientFrom="rose-400" gradientTo="red-500" onclick="disableMod('${modFolder}')" style="display: inline">
															<i class="fas fa-times" slot="icon"></i>
														</neo-button>
														<neo-button label="Move" gradientFrom="fuchsia-400" gradientTo="violet-400" onclick="moveMod('${modFolder}')" style="display: inline">
															<i class="fas fa-arrows-alt" slot="icon"></i>
														</neo-button>
													</div><br>`
			} else {
				$("#enabledMods")[0].innerHTML += `<div class="p-12 bg-gray-900 w-full shadow-2xl rounded-md text-white">
														<div class="mb-2">
															<h3 class="font-semibold text-2xl inline"><img src="rpkgMod.png" class="w-10 inline align-middle"> <span class="align-middle">${modFolder}</span></h3><br>
														</div>
														<div class="mb-1">
															<p>RPKG-only mod</p><br>
														</div>
														<neo-button label="Disable" gradientFrom="rose-400" gradientTo="red-500" onclick="disableMod('${modFolder}')" style="display: inline">
															<i class="fas fa-times" slot="icon"></i>
														</neo-button>
														<neo-button label="Move" gradientFrom="fuchsia-400" gradientTo="violet-400" onclick="moveMod('${modFolder}')" style="display: inline">
															<i class="fas fa-arrows-alt" slot="icon"></i>
														</neo-button>
													</div><br>`
			}
		}
		
		for (modFolder of fs.readdirSync("../Mods").filter(folder => !config.loadOrder.includes(folder))) {
			if (fs.existsSync(path.join("..", "Mods", modFolder, "manifest.json"))) {
				var modManifest = JSON.parse(fs.readFileSync(path.join("..", "Mods", modFolder, "manifest.json")))
				$("#availableMods")[0].innerHTML += `<div class="p-12 bg-gray-900 w-full shadow-2xl rounded-md text-white">
														<div class="mb-2">
															<h3 class="font-semibold text-2xl inline"><img src="frameworkMod.png" class="w-10 inline align-middle"> <span class="align-middle">${sanitise(modManifest.name)} <span class="font-light">by ${modManifest.authors.map(a=>sanitise(a)).join(", ")}</span></span></h3><br>
														</div>
														<div class="mb-1">
															<p>${sanitise(modManifest.description)}</p><br>
														</div>
														<neo-button label="Enable" gradientFrom="emerald-400" gradientTo="lime-600" onclick="enableMod('${modFolder}')" style="display: inline">
															<i class="fas fa-plus" slot="icon"></i>
														</neo-button>
													</div><br>`
			} else {
				$("#availableMods")[0].innerHTML += `<div class="p-12 bg-gray-900 w-full shadow-2xl rounded-md text-white">
														<div class="mb-2">
															<h3 class="font-semibold text-2xl inline"><img src="rpkgMod.png" class="w-10 inline align-middle"> <span class="align-middle">${modFolder}</span></h3><br>
														</div>
														<div class="mb-1">
															<p>RPKG-only mod</p><br>
														</div>
														<neo-button label="Enable" gradientFrom="emerald-400" gradientTo="lime-600" onclick="enableMod('${modFolder}')" style="display: inline">
															<i class="fas fa-plus" slot="icon"></i>
														</neo-button>
													</div><br>`
			}
		}
	} else {
		$("#noModsMessage")[0].style.display = "block"
		$("#mods")[0].style.display = "none"
	}
}

function showMessage(title, message, icon) {
	Swal.fire({
		showConfirmButton: false,
		allowEnterKey: false,
		title: title,
		html: message,
		icon: icon,
		timer: 6000,
		timerProgressBar: true
	})
}

async function enableMod(mod) {
	var config = JSON.parse(fs.readFileSync("../config.json"))

	config.loadOrder.push(mod)

	fs.writeFileSync("../config.json", JSON.stringify(config))

	await refreshMods()
}

async function disableMod(mod) {
	var config = JSON.parse(fs.readFileSync("../config.json"))

	config.loadOrder = config.loadOrder.filter(a => a != mod)

	fs.writeFileSync("../config.json", JSON.stringify(config))

	await refreshMods()
}

async function moveMod(modID) {
	var config = JSON.parse(fs.readFileSync("../config.json"))

	var index = (await Swal.fire({
		title: "Move Objective",
		text: "Position in the list to move to (first item is 1, second is 2, etc.):",
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
		for (mod of config.loadOrder) {
			if (mod == modID) { break }
			modIndex += 1
		}

		var removed = config.loadOrder.splice(modIndex, 1)[0]
		config.loadOrder.splice(parseInt(index) - 1, 0, removed)
	}
	
	fs.writeFileSync("../config.json", JSON.stringify(config))

	await refreshMods()
}

async function deployMods() {
	Swal.fire({
		title: 'Deploying your mods',
		html: 'Grab a coffee or something - your enabled mods are being applied to the game.',
		didOpen: async () => {
			Swal.showLoading()

			setTimeout(() => {
				child_process.execSync(`"${path.join(process.cwd(), "..", "Deploy.exe")}"`, {
					cwd: '..'
				})
			
				Swal.close()
			
				showMessage("Deployed successfully", "Successfully deployed. You can now play the game with mods!", "success")
			}, 500)
		},
		allowEnterKey: false,
		allowOutsideClick: false,
		allowEscapeKey: false,
		showConfirmButton: false
	})
}

async function importZIP() {
	var modPath = remote.dialog.showOpenDialogSync({
		title: "Import a Framework ZIP file",
		buttonLabel: "Import",
		filters: [{ name: 'Framework ZIP Files', extensions: ['framework.zip'] }],
		properties: ["openFile", "dontAddToRecent"]
	})[0]

	Swal.fire({
		title: 'Installing the mod',
		html: 'Please wait - the ZIP file is being extracted and installed as a framework mod.',
		didOpen: async () => {
			Swal.showLoading()

			setTimeout(() => {
				fs.emptyDirSync("./staging")

				new AdmZip(modPath).extractAllTo("./staging")

				fs.copySync("./staging", "../Mods")

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