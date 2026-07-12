const windowStateManager = require("electron-window-state")
const contextMenu = require("electron-context-menu")
const { app, BrowserWindow, ipcMain, dialog } = require("electron")
const serve = require("electron-serve")
// skipcq: JS-0359
const { spawn, execSync } = require("child_process")
// skipcq: JS-0359
const fs = require("fs")
// skipcq: JS-0359
const path = require("path")
// skipcq: JS-0359
const json5 = require("json5")

try {
	require("electron-reloader")(module, {
		ignore: [
			/staging/,
			/tempArchive/
		]
	})
} catch (e) {
	console.error(e)
}

const serveURL = serve({ directory: "." })
const port = process.env.PORT || 3000
const dev = !app.isPackaged
/** @type BrowserWindow */
let mainWindow
const sendToWindow = (channel, ...args) => {
	if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
		mainWindow.webContents.send(channel, ...args)
	}
}
let isDeploying = false
let deployOutput = ""
let deployProcess = null
let deployStartTime = null

function createWindow() {
	if (!dev && !fs.existsSync(path.join("..", "Deploy.exe"))) {
		process.chdir(path.dirname(app.getPath("exe")))
		app.relaunch({ execPath: app.getPath("exe"), args: process.argv.slice(1) })
		app.exit()
	}

	if (!fs.existsSync(path.join("..", "Mods"))) {
		fs.mkdirSync(path.join("..", "Mods"))
	}

	let windowState = windowStateManager({
		defaultWidth: 800,
		defaultHeight: 600
	})

	mainWindow = new BrowserWindow({
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: true,
			spellcheck: false,
			webSecurity: false,
			preload: require("path").join(__dirname, "preload.cjs")
		},
		x: windowState.x,
		y: windowState.y,
		width: windowState.width,
		height: windowState.height
	})

	windowState.manage(mainWindow)

	mainWindow.once("ready-to-show", () => {
		mainWindow.show()
		mainWindow.focus()
		mainWindow.webContents.reloadIgnoringCache()
	})

	if (process.argv[process.argv.length - 1] && process.argv[process.argv.length - 1].startsWith("simple-mod-framework://")) {
		mainWindow.webContents.once("did-finish-load", () => {
			sendToWindow("urlScheme", process.argv.pop().replace("simple-mod-framework://", ""))
		})
	}

	mainWindow.on("close", (event) => {
		if (isDeploying) {
			event.preventDefault()
			dialog.showMessageBoxSync(mainWindow, {
				type: "warning",
				title: "Deployment in progress",
				message: "A mod deployment is currently running. You cannot close the application until the deployment completes.",
				buttons: ["OK"]
			})
		} else {
			windowState.saveState(mainWindow)
		}
	})

	return mainWindow
}

function loadVite(targetPort) {
	mainWindow.loadURL(`http://localhost:${targetPort}`).catch((e) => {
		console.log("Error loading URL, retrying", e)
		setTimeout(() => {
			loadVite(targetPort)
		}, 200)
	})
}

function createMainWindow() {
	mainWindow = createWindow()
	mainWindow.once("close", () => {
		mainWindow = null
	})

	if (dev) loadVite(port)
	else serveURL(mainWindow)
}

if (process.defaultApp) {
	if (process.argv.length >= 2) {
		app.setAsDefaultProtocolClient("simple-mod-framework", process.execPath, [path.resolve(process.argv[1])])
	}
} else {
	app.setAsDefaultProtocolClient("simple-mod-framework")
}

const lock = app.requestSingleInstanceLock()

if (!lock) {
	app.quit()
} else {
	app.on("second-instance", (event, commandLine, workingDirectory) => {
		if (mainWindow) {
			if (mainWindow.isMinimized()) mainWindow.restore()
			mainWindow.focus()
		}

		if (commandLine[commandLine.length - 1] && commandLine[commandLine.length - 1].startsWith("simple-mod-framework://")) {
			sendToWindow("urlScheme", commandLine.pop().replace("simple-mod-framework://", ""))
		}
	})

	contextMenu({
		showLookUpSelection: false,
		showSearchWithGoogle: false,
		showCopyImage: false
	})

	app.once("ready", createMainWindow)
	app.on("activate", () => {
		if (!mainWindow) {
			createMainWindow()
		}
	})
	app.on("window-all-closed", () => {
		if (process.platform !== "darwin") app.quit()
	})
}

const fsPromises = fs.promises

// skipcq: JS-0067, JS-R1005
async function getJsonFilesAsync(dir, visited = new Set()) {
	const results = []
	try {
		const realDir = await fsPromises.realpath(dir)
		if (visited.has(realDir)) return results
		visited.add(realDir)

		const list = await fsPromises.readdir(realDir, { withFileTypes: true })
		for (const file of list) {
			const res = path.resolve(realDir, file.name)
			if (file.isDirectory()) {
				results.push(...(await getJsonFilesAsync(res, visited)))
			} else if (
				file.name.endsWith("entity.json") ||
				file.name.endsWith("entity.patch.json") ||
				file.name.endsWith("repository.json") ||
				file.name.endsWith("unlockables.json") ||
				file.name.endsWith("JSON.patch.json") ||
				file.name.endsWith("contract.json")
			) {
				results.push(res)
			}
		}
	} catch {}
	return results
}

// skipcq: JS-R1005
ipcMain.handle("get-mod-stats", async (event, modFolder) => {
	try {
		const manifestPath = path.join(modFolder, "manifest.json")
		try {
			await fsPromises.access(manifestPath)
		} catch {
			return {
				statsParts: [`${manifestPath}:missing`],
				manifest: null,
				contentFoldersStatus: {},
				jsonFilesData: {}
			}
		}

		const filesToStat = [manifestPath]
		let manifest = null
		const contentFoldersStatus = {}

		try {
			const manifestContent = await fsPromises.readFile(manifestPath, "utf8")
			manifest = json5.parse(manifestContent)

			const contentDirs = [
				...(manifest.contentFolders || []),
				...(manifest.options || []).flatMap((opt) => opt.contentFolders || [])
			]
			for (const dir of contentDirs) {
				if (!dir) continue
				const fullPath = path.resolve(modFolder, dir)
				const relative = path.relative(modFolder, fullPath)
				if (relative.startsWith("..") || path.isAbsolute(relative)) {
					continue
				}
				try {
					await fsPromises.access(fullPath)
					contentFoldersStatus[dir] = true
					filesToStat.push(fullPath)
				} catch {
					contentFoldersStatus[dir] = false
				}
			}

			const blobsDirs = [
				...(manifest.blobsFolders || []),
				...(manifest.options || []).flatMap((opt) => opt.blobsFolders || [])
			]
			for (const dir of blobsDirs) {
				if (!dir) continue
				const fullPath = path.resolve(modFolder, dir)
				const relative = path.relative(modFolder, fullPath)
				if (relative.startsWith("..") || path.isAbsolute(relative)) {
					continue
				}
				try {
					await fsPromises.access(fullPath)
					filesToStat.push(fullPath)
				} catch {}
			}
		} catch {}

		const jsonFilesData = {}
		try {
			const klawFiles = await getJsonFilesAsync(modFolder)
			filesToStat.push(...klawFiles)

			for (const file of klawFiles) {
				try {
					const content = await fsPromises.readFile(file, "utf8")
					jsonFilesData[file] = content
				} catch {}
			}
		} catch {}

		const statsParts = await Promise.all(
			filesToStat.map(async (file) => {
				try {
					const stat = await fsPromises.stat(file)
					return `${file}:${stat.mtimeMs}:${stat.size}`
				} catch {
					return `${file}:missing`
				}
			})
		)

		return {
			statsParts,
			manifest,
			contentFoldersStatus,
			jsonFilesData
		}
	} catch {
		return {
			statsParts: [],
			manifest: null,
			contentFoldersStatus: {},
			jsonFilesData: {}
		}
	}
})

ipcMain.on("deploy", () => {
	if (isDeploying) {
		sendToWindow("frameworkDeployModalOpen", deployStartTime)
		sendToWindow("frameworkDeployOutput", deployOutput)
		return
	}
	isDeploying = true
	deployOutput = ""
	deployStartTime = Date.now()

	let cleanupCalled = false
	const cleanupDeploy = (err) => {
		if (cleanupCalled) return
		cleanupCalled = true

		if (deployProcess) {
			try {
				deployProcess.kill()
			} catch {
				// Ignore kill errors
			}
			deployProcess = null
		}

		isDeploying = false
		deployStartTime = null

		if (err) {
			if (deployOutput) {
				deployOutput += `\nFailed: ${err?.message || String(err)}`
			} else {
				const isSpawnError = err?.code === "ENOENT" || err?.syscall === "spawn"
				const errMsg = err?.message || String(err)
				deployOutput = isSpawnError ? `Failed to start Deploy.exe: ${errMsg}` : `Deployment failed: ${errMsg}`
			}
			sendToWindow("frameworkDeployOutput", deployOutput)
		}
		sendToWindow("frameworkDeployFinished")
	}

	try {
		const simPath = path.join(__dirname, "..", "simulate-deploy.cjs")
		if (dev && fs.existsSync(simPath)) {
			deployProcess = spawn("node", [simPath], {
				cwd: path.join(__dirname, "..")
			})
		} else {
			deployProcess = spawn("Deploy.exe --doNotPause --colors", [], {
				shell: true,
				cwd: ".."
			})
		}

		deployProcess.on("error", (err) => {
			cleanupDeploy(err)
		})

		sendToWindow("frameworkDeployModalOpen", deployStartTime)

		deployProcess.stdout.on("data", (data) => {
			deployOutput += String(data)
			sendToWindow("frameworkDeployOutput", deployOutput)
		})

		deployProcess.stderr.on("data", (data) => {
			deployOutput += String(data)
			sendToWindow("frameworkDeployOutput", deployOutput)
		})

		deployProcess.on("close", (code, signal) => {
			if (code !== 0) {
				cleanupDeploy(new Error(`Deploy.exe exited with code ${code} and signal ${signal}`))
			} else {
				cleanupDeploy(null)
			}
		})
	} catch (err) {
		cleanupDeploy(err)
	}
})

ipcMain.on("checkDeployStatus", () => {
	if (isDeploying) {
		sendToWindow("frameworkDeployModalOpen", deployStartTime)
		sendToWindow("frameworkDeployOutput", deployOutput)
	}
})

ipcMain.on("killDeployProcess", () => {
	if (deployProcess?.pid) {
		try {
			const pid = deployProcess.pid
			execSync(`taskkill /f /t /pid ${pid}`)
		} catch (e) {
			console.error("Error killing deploy process tree:", e)
		}
		deployProcess = null
	}
})

ipcMain.on("modFileOpenDialog", () => {
	sendToWindow(
		"modFileOpenDialogResult",
		dialog.showOpenDialogSync(mainWindow, {
			title: "Add a mod file",
			buttonLabel: "Select",
			filters: [{ name: "Mod Files", extensions: ["zip", "7z", "rar", "rpkg"] }],
			properties: ["openFile", "multiSelections", "dontAddToRecent"]
		})
	)
})

ipcMain.on("runtimePackageOpenDialog", () => {
	sendToWindow(
		"runtimePackageOpenDialogResult",
		dialog.showOpenDialogSync(mainWindow, {
			title: "Select an RPKG file",
			buttonLabel: "Select",
			filters: [{ name: "RPKG Files", extensions: ["rpkg"] }],
			properties: ["openFile", "dontAddToRecent"]
		})
	)
})

ipcMain.on("imageOpenDialog", () => {
	sendToWindow(
		"imageOpenDialogResult",
		dialog.showOpenDialogSync(mainWindow, {
			title: "Select an image",
			buttonLabel: "Select",
			filters: [{ name: "Image Files", extensions: ["png", "jpg", "apng", "gif", "webp", "svg", "jpeg", "jfif"] }],
			properties: ["openFile", "dontAddToRecent"]
		})
	)
})

ipcMain.on("relaunchApp", () => {
	app.relaunch()
	app.exit()
})
