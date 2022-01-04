var Swal = require("sweetalert2/dist/sweetalert2")
var fs = require('fs-extra')
var path = require('path');
var child_process = require("child_process");
var AdmZip = require('adm-zip')
var sanitizeHtml = require('sanitize-html')
var remote = require('@electron/remote')
var semver = require('semver');
var downloadFile = require("async-get-file");
var json5 = require("json5");
var klaw = require("klaw-sync");

window.$ = window.jQuery = require('jquery');

frameworkVersion = "1.0.1"

async function updateFramework() {
	var frameworkUpdateData = await (await fetch("https://hitman-resources.netlify.app/framework/framework.json")).json()
	
	await Swal.fire({
		title: 'Updating the framework',
		html: 'Please wait - the framework is being updated to the latest version (' + frameworkUpdateData.version + '):<br><br><i>' + frameworkUpdateData.changelog + "</i>",
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
			var modManifest = json5.parse(fs.readFileSync(path.join("..", "Mods", modFolder, "manifest.json")))
			if (modManifest.updateCheck) {
				var modUpdateData = await (await fetch(modManifest.updateCheck)).json()
				if (semver.lt(modManifest.version, modUpdateData.version)) {
					$("#modUpdateAvailable")[0].style.display = "block"
					$("#modUpdateCards")[0].innerHTML += `<div class="text-lg text-center p-4 m-4 shadow-2xl bg-gradient-to-br from-gray-800 to-gray-900 cursor-pointer" onclick="updateMod('${sanitiseStrongly(modFolder.replace(`"`, "").replace(`\\`, ""))}')">
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
				didOpen: async () => {
					Swal.showLoading()
		
					setTimeout(async () => {
						await downloadFile((await fetch(updateData.url.startsWith("https://") ? updateData.url : new Error())).url, {
							directory: ".",
							filename: "mod.zip",
							timeout: 999999999
						});
			
						for (var managedFile of updateData.managedFilesAndFolders) {
							if (managedFile.includes("..")) {
								break
							}
							fs.removeSync(path.join("..", "Mods", managedFile))
						}

						fs.removeSync("./staging")
						fs.ensureDirSync("./staging")
			
						new AdmZip("./mod.zip").extractAllTo("./staging")
			
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

	// 	var config = json5.parse(fs.readFileSync("../config.json"))

	// 	config.hasUsedGUI = true
	// 	config.runtimePath = path.join(gameDirectory, 'Runtime')

	// 	fs.writeFileSync("../config.json", json5.stringify(config))

	// 	showMessage("All set!", "You can begin using the Simple Mod Framework.", "success")
	// }

	await refreshMods()
}

async function refreshMods() {
	$("#mods")[0].style.display = "flex"
	$("#noModsMessage")[0].style.display = "none"
	$("#enabledMods")[0].innerHTML = ""
	$("#availableMods")[0].innerHTML = ""

	var config = json5.parse(fs.readFileSync("../config.json"))
	
	if (fs.readdirSync("../Mods").length > 0) {
		for (let mod of config.loadOrder) {
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
															${modManifest.options && modManifest.options.some(a=>a.type == "checkbox" || a.type == "select") ? `<neo-button small label="" gradientFrom="thisisjustsoitworkslmao" gradientTo="bg-gray-800" onclick="modSettings('${sanitiseStrongly(modFolder.replace(`"`, "").replace(`\\`, ""))}')" style="display: inline">
																<i class="fas fa-cog" slot="icon"></i>
															</neo-button>` : ``}
															<neo-button small label="Disable" gradientFrom="from-rose-400" gradientTo="to-red-500" onclick="disableMod('${sanitiseStrongly(modFolder.replace(`"`, "").replace(`\\`, ""))}')" style="display: inline">
																<i class="fas fa-times" slot="icon"></i>
															</neo-button>
															<neo-button small label="Move" gradientFrom="from-fuchsia-400" gradientTo="to-violet-400" onclick="moveMod('${sanitiseStrongly(modFolder.replace(`"`, "").replace(`\\`, ""))}')" style="display: inline">
																<i class="fas fa-arrows-alt" slot="icon"></i>
															</neo-button>
														</div>
														<div class="float-left" style="max-width: 70%">
															<div class="mb-2">
																<h3 class="font-semibold text-xl inline"><img src="frameworkMod.png" class="w-8 inline align-middle">  <span class="align-middle">${sanitise(modManifest.name)} <span class="font-light">by ${modManifest.authors.map(a=>sanitise(a)).join(", ")}</span></span></h3><br>
															</div>
															<p>${sanitise(modManifest.description)}</p>
														</div>
													</div><br>`
			} else {
				$("#enabledMods")[0].innerHTML += `<div class="p-8 bg-gray-900 w-full flow-root shadow-xl rounded-md text-white">
														<div class="float-right">
															<neo-button small label="Disable" gradientFrom="from-rose-400" gradientTo="to-red-500" onclick="disableMod('${sanitiseStrongly(modFolder.replace(`"`, "").replace(`\\`, ""))}')" style="display: inline">
																<i class="fas fa-times" slot="icon"></i>
															</neo-button>
															<neo-button small label="Move" gradientFrom="from-fuchsia-400" gradientTo="to-violet-400" onclick="moveMod('${sanitiseStrongly(modFolder.replace(`"`, "").replace(`\\`, ""))}')" style="display: inline">
																<i class="fas fa-arrows-alt" slot="icon"></i>
															</neo-button>
														</div>
														<div class="float-left" style="max-width: 70%">
															<div class="mb-2">
																<h3 class="font-semibold text-xl inline"><img src="rpkgMod.png" class="w-8 inline align-middle">  <span class="align-middle">${sanitiseStrongly(modFolder.replace(`"`, "").replace(`\\`, ""))}</span></h3><br>
															</div>
															<p>RPKG-only mod</p>
														</div>
													</div><br>`
			}
		}
		
		for (modFolder of fs.readdirSync("../Mods").filter(folder => !config.loadOrder.includes(folder) && (!fs.existsSync(path.join("..", "Mods", folder, "manifest.json")) || !config.loadOrder.includes(json5.parse(String(fs.readFileSync(path.join("..", "Mods", folder, "manifest.json")))).id)))) {
			if (fs.existsSync(path.join("..", "Mods", modFolder, "manifest.json"))) {
				var modManifest = json5.parse(fs.readFileSync(path.join("..", "Mods", modFolder, "manifest.json")))

				for (let key of ["id", "name", "description", "authors", "version", "frameworkVersion"]) {
					if (typeof modManifest[key] == "undefined") {
						continue
					}
				}
				
				$("#availableMods")[0].innerHTML += `<div class="p-8 bg-gray-900 w-full flow-root shadow-xl rounded-md text-white">
														<div class="float-right">
															<neo-button small label="Enable" gradientFrom="from-emerald-400" gradientTo="to-lime-600" onclick="enableMod('${sanitiseStrongly(modFolder.replace(`"`, "").replace(`\\`, ""))}')" style="display: inline">
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
			} else {
				$("#availableMods")[0].innerHTML += `<div class="p-8 bg-gray-900 w-full flow-root shadow-xl rounded-md text-white">
														<div class="float-right">
															<neo-button small label="Enable" gradientFrom="from-emerald-400" gradientTo="to-lime-600" onclick="enableMod('${sanitiseStrongly(modFolder.replace(`"`, "").replace(`\\`, ""))}')" style="display: inline">
																<i class="fas fa-plus" slot="icon"></i>
															</neo-button>
														</div>
														<div class="float-left" style="max-width: 80%">
															<div class="mb-2">
																<h3 class="font-semibold text-xl inline"><img src="rpkgMod.png" class="w-8 inline align-middle">  <span class="align-middle">${sanitiseStrongly(modFolder.replace(`"`, "").replace(`\\`, ""))}</span></h3><br>
															</div>
															<p>RPKG-only mod</p>
														</div>
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

	await refreshMods()

	if (fs.existsSync(path.join("..", "Mods", mod, "manifest.json")) && json5.parse(String(fs.readFileSync(path.join("..", "Mods", mod, "manifest.json")))).options && json5.parse(String(fs.readFileSync(path.join("..", "Mods", mod, "manifest.json")))).options.some(a=>a.type == "checkbox" || a.type == "select")) {
		modSettings(mod)
	}
}

async function disableMod(mod) {
	var config = json5.parse(fs.readFileSync("../config.json"))

	config.loadOrder = config.loadOrder.filter(a => a != (fs.existsSync(path.join("..", "Mods", mod, "manifest.json")) ? json5.parse(String(fs.readFileSync(path.join("..", "Mods", mod, "manifest.json")))).id : mod))

	fs.writeFileSync("../config.json", json5.stringify(config))

	await refreshMods()
}

async function moveMod(modID) {
	var config = json5.parse(fs.readFileSync("../config.json"))

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

	await refreshMods()
}

function checkModOptions(modFolder) {
	let manifest = json5.parse(String(fs.readFileSync(path.join("..", "Mods", modFolder, "manifest.json"))))

	let config = json5.parse(fs.readFileSync("../config.json"))

	if (!config.modOptions[manifest.id]) {
		config.modOptions[manifest.id] = [...manifest.options.filter(a=>a.enabledByDefault).map(a=>a.name)]
	} // Default mod options

	for (var i = config.modOptions[manifest.id].length - 1; i >= 0; i--) {
		if (!manifest.options.find(a=>a.name == config.modOptions[manifest.id][i])) {
			config.modOptions[manifest.id].splice(i, 1)
		}
	} // Remove mod options that don't exist

	for (var i = config.modOptions[manifest.id].length - 1; i >= 0; i--) {
		if (manifest.options.find(a=>a.name == config.modOptions[manifest.id][i]).requirements) {
			if (!manifest.options.find(a=>a.name == config.modOptions[manifest.id][i]).requirements.every(a=>config.loadOrder.includes(a))) {
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

	let settingsHTML = ``

	let groups = {}
	for (let option of manifest.options) {
		if (option.type == "checkbox") {
			settingsHTML += `<div class="mb-2"><label class="inline-flex items-center">
									<input${(option.requirements && !option.requirements.every(a=>config.loadOrder.includes(a))) ? ' disabled' : ''} type="checkbox"${json5.parse(fs.readFileSync("../config.json")).modOptions[manifest.id].includes(sanitiseStrongly(option.name.replace(`"`, "").replace(`\\`, ""))) ? ' checked' : ''} class="form-checkbox cursor-pointer h-5 w-5 text-gray-700 bg-white" data-optionName="${sanitiseStrongly(option.name.replace(`"`, "").replace(`\\`, ""))}"><span class="ml-2${(option.requirements && !option.requirements.every(a=>config.loadOrder.includes(a))) ? ' text-gray-400' : ''}" data-optionName="${sanitiseStrongly(option.name.replace(`"`, "").replace(`\\`, ""))}">${sanitiseStrongly(option.name.replace(`"`, "").replace(`\\`, ""))}</span>
							</label></div>`
		} else if (option.type == "select") {
			if (!groups[option.group]) { groups[option.group] = [] }

			groups[option.group].push([option.name, option.tooltip, option.requirements])
		}
	}

	for (let group of Object.keys(groups)) {
		settingsHTML += `<div class="mb-2">
							<span class="font-semibold">${sanitiseStrongly(group.replace(`"`, "").replace(`\\`, ""))}</span>`
		for (let option of groups[group]) {
			settingsHTML += `<br><label class="inline-flex items-center">
								<input${(option[2] && !option[2].every(a=>config.loadOrder.includes(a))) ? ' disabled' : ''} type="radio"${json5.parse(fs.readFileSync("../config.json")).modOptions[manifest.id].includes(sanitiseStrongly(option[0].replace(`"`, "").replace(`\\`, ""))) ? ' checked' : ''} class="form-radio" name="${sanitiseStrongly(group.replace(`"`, "").replace(`\\`, ""))}" data-optionName="${sanitiseStrongly(option[0].replace(`"`, "").replace(`\\`, ""))}">
								<span class="ml-2${(option[2] && !option[2].every(a=>config.loadOrder.includes(a))) ? ' text-gray-400' : ''}" data-optionName="${sanitiseStrongly(option[0].replace(`"`, "").replace(`\\`, ""))}">${sanitiseStrongly(option[0].replace(`"`, "").replace(`\\`, ""))}</span>
							</label>`
		}
		
		settingsHTML += `</div>`
	}

	await Swal.fire({
		title: manifest.name,
		html: `${sanitise(manifest.description)}<br><div class="text-left mt-4 text-2xl font-semibold">Settings</div><div class="text-left overflow-auto h-64">${settingsHTML}</div>`,
		customClass: {
			htmlContainer: 'text-center'
		},
		width: '36rem',
		showCancelButton: false,
		focusConfirm: false,
		confirmButtonText: 'Save',
		didOpen: () => {
			for (let option of manifest.options) {
				if (option.tooltip || (option.requirements && !option.requirements.every(a=>config.loadOrder.includes(a))))
				tippy(`span[data-optionName="${sanitiseStrongly(option.name.replace(`"`, "").replace(`\\`, ""))}"]`, {
					content: sanitise(option.tooltip) + ((option.requirements && !option.requirements.every(a=>config.loadOrder.includes(a))) ? `<br>Requires: ${option.requirements.map(a=>sanitiseStrongly(a)).join(", ")}` : ``),
					placement: "right"
				});
			}
			
			for (let group of Object.keys(groups)) {
				for (let option of groups[group]) {
					if (option[1] || (option[2] && !option[2].every(a=>config.loadOrder.includes(a))))
					tippy(`span[data-optionName="${sanitiseStrongly(option[0].replace(`"`, "").replace(`\\`, ""))}"]`, {
						content: sanitise(option[1]) + ((option[2] && !option[2].every(a=>config.loadOrder.includes(a))) ? `<br>Requires: ${option[2].map(a=>sanitiseStrongly(a)).join(", ")}` : ``),
						placement: "right"
					});
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

					let modsToSort = JSON.parse(JSON.stringify(config.loadOrder))

					modSorting:
					while (modsToSort.length) {
						for (let mod of modsToSort) {
							let modFolder = !(fs.existsSync(path.join("..", "Mods", mod)) && !fs.existsSync(path.join("..", "Mods", mod, "manifest.json")) && klaw(path.join("..", "Mods", mod)).filter(a=>a.stats.size > 0).map(a=>a.path).some(a=>a.endsWith(".rpkg"))) // Mod is not an RPKG mod
											? fs.readdirSync(path.join("..", "Mods")).find(a=>fs.existsSync(path.join("..", "Mods", a, "manifest.json")) && json5.parse(String(fs.readFileSync(path.join("..", "Mods", a, "manifest.json")))).id == mod) // Find mod by ID
											: mod // Mod is an RPKG mod, use folder name
							
							if (fs.existsSync(path.join("..", "Mods", modFolder, "manifest.json"))) {
								let modManifest = json5.parse(fs.readFileSync(path.join("..", "Mods", modFolder, "manifest.json")))

								if (modManifest.loadBefore)
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

								if (modManifest.loadAfter)
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

async function importZIP() {
	var modPath = remote.dialog.showOpenDialogSync({
		title: "Import a Framework ZIP file",
		buttonLabel: "Import",
		filters: [{ name: 'Framework ZIP Files', extensions: ['zip'] }],
		properties: ["openFile", "dontAddToRecent"]
	})[0]

	Swal.fire({
		title: 'Installing the mod',
		html: 'Please wait - the ZIP file is being extracted and installed as a framework mod.',
		didOpen: async () => {
			Swal.showLoading()

			setTimeout(() => {
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

function sanitiseStrongly(html) {
	return sanitizeHtml(html, {
		allowedTags: []
	});
}