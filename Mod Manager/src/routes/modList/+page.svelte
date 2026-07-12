<script lang="ts">
	import { scale, fade } from "svelte/transition"
	import { flip } from "svelte/animate"
	import { onMount, tick, onDestroy } from "svelte"

	import json5 from "json5"
	import { Button, CodeSnippet, InlineNotification, Modal, ProgressBar, Search, Loading } from "carbon-components-svelte"
	import AnsiToHTML from "ansi-to-html"
	import throttle from "lodash/throttle"

	const convertAnsi = new AnsiToHTML({
		newline: true,
		escapeXML: true,
		colors: {
			// Qualia by u/starlig-ht, slightly modified for background colour
			"0": "#101010",
			"1": "#EFA6A2",
			"2": "#80C990",
			"3": "#C8C874",
			"4": "#A3B8EF",
			"5": "#E6A3DC",
			"6": "#50CACD",
			"7": "#808080",
			"8": "#878787",
			"9": "#E0AF85",
			"10": "#5ACCAF",
			"11": "#C8C874",
			"12": "#CCACED",
			"13": "#F2A1C2",
			"14": "#74C3E4",
			"15": "#C0C0C0"
		},
		fg: "#f4f4f4",
		bg: "#262626"
	})

	import {
		getAllMods,
		getConfig,
		mergeConfig,
		getManifestFromModID,
		modIsFramework,
		getModFolder,
		sortMods,
		validateModFolder,
		clearModsCache,
		clearValidationCache,
		clearValidationCacheForFolder,
		preloadModsCache,
		removeDirectoryRecursive,
		trustedHosts,
		markModAsDeleting,
		unmarkModAsDeleting
	} from "$lib/utils"
	import Mod from "$lib/Mod.svelte"
	import TextInputModal from "$lib/TextInputModal.svelte"
	import { goto, beforeNavigate } from "$app/navigation"

	import AddIcon from "carbon-icons-svelte/lib/Add.svelte"
	import AddAltIcon from "carbon-icons-svelte/lib/AddAlt.svelte"
	import SubtractAltIcon from "carbon-icons-svelte/lib/SubtractAlt.svelte"
	import RocketIcon from "carbon-icons-svelte/lib/Rocket.svelte"
	import SettingsIcon from "carbon-icons-svelte/lib/Settings.svelte"
	import TrashCanIcon from "carbon-icons-svelte/lib/TrashCan.svelte"
	import CloseIcon from "carbon-icons-svelte/lib/Close.svelte"
	import CloudUploadIcon from "carbon-icons-svelte/lib/CloudUpload.svelte"
	import FilterIcon from "carbon-icons-svelte/lib/Filter.svelte"

	const Add = AddIcon as any
	const AddAlt = AddAltIcon as any
	const SubtractAlt = SubtractAltIcon as any
	const Rocket = RocketIcon as any
	const Settings = SettingsIcon as any
	const TrashCan = TrashCanIcon as any
	const Close = CloseIcon as any
	const CloudUpload = CloudUploadIcon as any
	const Filter = FilterIcon as any
	import { OptionType } from "../../../../src/types"
	import { page } from "$app/stores"
	import SortableList from "$lib/SortableList.svelte"
	import CacheLoading from "$lib/CacheLoading.svelte"

	let enabledMods: { value: string }[] = []
	let disabledMods: { value: string }[] = []
	let cacheLoaded = false
	let cacheLoadError = ""
	let deleteModModalOpen = false
	let deleteModInProgress: string
	let forceModListsUpdate = Math.random()

	async function preloadCache() {
		cacheLoaded = false
		cacheLoadError = ""
		try {
			await preloadModsCache("modList")
			cacheLoaded = true
			window.ipc.send("checkDeployStatus")
		} catch (e: any) {
			console.error("Failed to preload mods cache on mount:", e)
			cacheLoadError = e?.message || "Failed to load mods cache."
		}
	}

	onMount(() => {
		preloadCache()
	})

	$: if (cacheLoaded) {
		if (!getConfig().developerMode) {
			// If no mods are known
			if (getConfig().knownMods.length == 0) {
				// Assume all mods are installed correctly
				mergeConfig({ knownMods: getAllMods() })
			}

			for (const mod of getAllMods()) {
				if (!getConfig().knownMods.includes(mod)) {
					extractedMods.push(getManifestFromModID(mod).name)
					displayExtractedModsDialog = true

					mergeConfig({ knownMods: [...getConfig().knownMods, mod] })
				}
			}
		}

		enabledMods = getConfig().loadOrder.map((a) => {
			return { value: a, dummy: forceModListsUpdate }
		})

		disabledMods = getAllMods()
			.filter((a) => !getConfig().loadOrder.includes(a))
			.sort((a, b) =>
				(modIsFramework(a) ? getManifestFromModID(a).name : a).localeCompare(modIsFramework(b) ? getManifestFromModID(b).name : b, undefined, { numeric: true, sensitivity: "base" })
			)
			.map((a) => {
				return { value: a, dummy: forceModListsUpdate }
			})
	}

	let changed = false

	function markChanged() {
		changed = true
		deployFinished = false
	}

	let showDropHint = false
	let dependencyCycleModalOpen = false
	let frameworkDeployModalOpen = false
	let deployOutput = ""
	let deployOutputHTML = ""
	let deployDiagnostics: string[] = []

	let lastParsedLength = 0
	let parsedHtmlLines: string[] = []
	let lastAppendedLine = ""

	function resetRenderedOutput() {
		lastParsedLength = 0
		parsedHtmlLines = []
		lastAppendedLine = ""
		deployOutputHTML = ""
		deployWarnings = []
		analyzedMods = new Set()
		deployedMods = new Set()
		currentModName = ""
		currentPhase = "preparing"
		totalLinesCount = 0
	}

	let consoleObserver: ResizeObserver | null = null
	let saveHeightTimeout: any = null

	function setupConsoleResizeObserver(node: HTMLElement) {
		const savedHeight = localStorage.getItem("console-height")
		if (savedHeight) {
			node.style.height = savedHeight
		}

		consoleObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const height = entry.target.style.height
				if (height) {
					clearTimeout(saveHeightTimeout)
					saveHeightTimeout = setTimeout(() => {
						localStorage.setItem("console-height", height)
					}, 200)
				}
			}
		})
		consoleObserver.observe(node)
		return {
			destroy() {
				if (consoleObserver) {
					consoleObserver.disconnect()
				}
				clearTimeout(saveHeightTimeout)
			}
		}
	}
	let deployFinished = false

	let progressPercent = 0
	let statusLabel = "Starting deployment..."
	let elapsedTimeStr = "0s"
	let elapsedSeconds = 0
	let deployTimerInterval: any = null
	let deployWarnings: string[] = []
	let hasError = false
	let errorMessage = ""
	let totalMods = 0
	let stagedCount = 0

	let analyzedMods = new Set()
	let deployedMods = new Set()
	let currentModName = ""
	let currentPhase = "preparing"
	let startPerformanceTime = 0
	let totalLinesCount = 0

	let timerWorker: Worker | null = null
	let parserWorker: Worker | null = null
	let rpkgStartTime = 0

	function parseLogs(newLines: string[], existingWarnings: string[], initialPhase: string, initialModName: string) {
		const errorPatterns = [/.*ERROR.*?\t/, /Error:\s*(.*)/, /uncaughtException/, /unhandledRejection/]
		let currentPhase = initialPhase
		let currentModName = initialModName
		let hasError = false
		let errorMessage = ""
		const newlyDiscoveredWarnings: string[] = []
		const newlyAnalyzedMods: string[] = []
		const newlyDeployedMods: string[] = []

		for (const line of newLines) {
			const cleanLine = line.trim()
			const stripped = cleanLine.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "")

			for (const pattern of errorPatterns) {
				if (line.match(pattern)) {
					hasError = true
					errorMessage = line.replace(/.*(ERROR.*?\t|Error:\s*)/, "").trim()
					break
				}
			}

			if (line.match(/.*WARN.*?\t/)) {
				const warning = line.replace(/.*WARN.*?\t/, "").trim()
				if (!existingWarnings.includes(warning) && !newlyDiscoveredWarnings.includes(warning)) {
					newlyDiscoveredWarnings.push(warning)
				}
			}

			const discoveringMatch = stripped.match(/Discovering mod:\s*(.*)/)
			const analyzingMatch = stripped.match(/Analysing framework mod:\s*(.*)/)
			const stagingMatch = stripped.match(/Staging RPKG mod:\s*(.*)/)
			const deployingMatch = stripped.match(/Deploying\s*(.*)/)
			const writingMatch = stripped.match(/(Writing packagedefinition|Writing chunk|Generating ORES|Rebuilding)/)

			if (discoveringMatch) {
				currentPhase = "preparing"
				currentModName = discoveringMatch[1].trim()
			} else if (analyzingMatch) {
				currentPhase = "analyzing"
				const modName = analyzingMatch[1].trim()
				newlyAnalyzedMods.push(modName)
				currentModName = modName
			} else if (stagingMatch) {
				currentPhase = "deploying"
				const modName = stagingMatch[1].trim()
				newlyDeployedMods.push(modName)
				currentModName = modName
			} else if (deployingMatch) {
				currentPhase = "deploying"
				const modName = deployingMatch[1].trim()
				newlyDeployedMods.push(modName)
				currentModName = modName
			} else if (stripped.includes("Localising text")) {
				currentPhase = "localising"
			} else if (stripped.includes("Patching thumbs")) {
				currentPhase = "patching-thumbs"
			} else if (stripped.includes("Patching packagedefinition")) {
				currentPhase = "patching-pd"
			} else if (stripped.includes("Generating RPKGs")) {
				currentPhase = "generating-rpkgs"
			} else if (writingMatch) {
				currentPhase = "finalizing"
			}
		}

		return {
			hasError,
			errorMessage,
			newlyDiscoveredWarnings,
			newlyAnalyzedMods,
			newlyDeployedMods,
			currentPhase,
			currentModName
		}
	}

	function startDeployTimer(deployStartTime: number | null) {
		if (timerWorker) {
			timerWorker.terminate()
		}
		if (parserWorker) {
			parserWorker.terminate()
		}
		rpkgStartTime = 0
		clearInterval(deployTimerInterval)
		clearTimeout(autoScrollTimeout)
		const offset = deployStartTime ? Date.now() - deployStartTime : 0
		startPerformanceTime = performance.now() - offset

		const workerCode = `
			let timer = null;
			self.onmessage = (e) => {
				if (e.data === "start") {
					clearInterval(timer);
					timer = setInterval(() => {
						self.postMessage("tick");
					}, 1000);
				} else if (e.data === "stop") {
					clearInterval(timer);
				}
			};
		`
		let timerWorkerUrl = ""
		try {
			const blob = new Blob([workerCode], { type: "application/javascript" })
			timerWorkerUrl = URL.createObjectURL(blob)
			timerWorker = new Worker(timerWorkerUrl)
		} catch (err) {
			console.error("Failed to construct timerWorker:", err)
			timerWorker = null
		} finally {
			if (timerWorkerUrl) URL.revokeObjectURL(timerWorkerUrl)
		}

		const parserWorkerCode = `
			let currentPhase = "preparing";
			let currentModName = "";
			const parseLogs = ${parseLogs.toString()};

			self.onmessage = (e) => {
				const { newLines, existingWarnings } = e.data;
				const result = parseLogs(newLines, existingWarnings, currentPhase, currentModName);
				currentPhase = result.currentPhase;
				currentModName = result.currentModName;
				self.postMessage(result);
			};
		`
		let parserWorkerUrl = ""
		try {
			const parserBlob = new Blob([parserWorkerCode], { type: "application/javascript" })
			parserWorkerUrl = URL.createObjectURL(parserBlob)
			parserWorker = new Worker(parserWorkerUrl)
		} catch (err) {
			console.error("Failed to construct parserWorker:", err)
			parserWorker = null
		} finally {
			if (parserWorkerUrl) URL.revokeObjectURL(parserWorkerUrl)
		}

		const updateTimer = () => {
			const elapsedMs = performance.now() - startPerformanceTime
			elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
			const m = Math.floor(elapsedSeconds / 60)
			const s = elapsedSeconds % 60
			elapsedTimeStr = m > 0 ? `${m}m ${s}s` : `${s}s`
		}

		updateTimer()

		if (timerWorker) {
			timerWorker.onmessage = (e) => {
				if (e.data === "tick") {
					updateTimer()
					updateProgressAndLabels()
				}
			}
			timerWorker.onerror = (error) => {
				console.error("timerWorker runtime error:", error)
				if (timerWorker) {
					timerWorker.terminate()
					timerWorker = null
				}
				clearInterval(deployTimerInterval)
				deployTimerInterval = setInterval(() => {
					updateTimer()
					updateProgressAndLabels()
				}, 1000)
			}
			timerWorker.postMessage("start")
		} else {
			clearInterval(deployTimerInterval)
			deployTimerInterval = setInterval(() => {
				updateTimer()
				updateProgressAndLabels()
			}, 1000)
		}

		if (parserWorker) {
			parserWorker.onmessage = (e) => {
				const {
					hasError: workerHasError,
					errorMessage: workerErrorMessage,
					newlyDiscoveredWarnings,
					newlyAnalyzedMods,
					newlyDeployedMods,
					currentPhase: workerCurrentPhase,
					currentModName: workerCurrentModName
				} = e.data

				if (workerHasError) {
					hasError = true
					errorMessage = workerErrorMessage
				}

				if (newlyDiscoveredWarnings.length > 0) {
					deployWarnings = [...deployWarnings, ...newlyDiscoveredWarnings]
				}

				if (newlyAnalyzedMods.length > 0) {
					for (const mod of newlyAnalyzedMods) {
						analyzedMods.add(mod)
					}
					analyzedMods = analyzedMods
				}

				if (newlyDeployedMods.length > 0) {
					for (const mod of newlyDeployedMods) {
						deployedMods.add(mod)
					}
					deployedMods = deployedMods
				}

				if (workerCurrentPhase === "generating-rpkgs" && currentPhase !== "generating-rpkgs") {
					rpkgStartTime = performance.now()
				}

				currentPhase = workerCurrentPhase
				currentModName = workerCurrentModName

				updateProgressAndLabels()
			}
			parserWorker.onerror = (error) => {
				console.error("parserWorker runtime error:", error)
				if (parserWorker) {
					parserWorker.terminate()
					parserWorker = null
				}
				convertOutputToHTML()
			}
		}
	}

	function stopDeployTimer() {
		clearInterval(deployTimerInterval)
		clearTimeout(autoScrollTimeout)
		if (timerWorker) {
			timerWorker.terminate()
			timerWorker = null
		}
		if (parserWorker) {
			parserWorker.terminate()
			parserWorker = null
		}
	}

	function updateProgressAndLabels() {
		totalMods = enabledMods.length
		stagedCount = deployedMods.size

		if (hasError) {
			// Stay in error state
		} else if (deployFinished) {
			progressPercent = 100
			statusLabel = "Deployment completed successfully!"
		} else if (totalMods > 0) {
			if (currentPhase === "preparing") {
				progressPercent = Math.min(10, Math.round((totalLinesCount / 50) * 10))
				statusLabel = `Preparing deployment... (${currentModName})`
			} else if (currentPhase === "analyzing") {
				const fraction = totalMods > 0 ? analyzedMods.size / totalMods : 0
				progressPercent = Math.round(11 + fraction * 19)
				statusLabel = `Analyzing mod: ${currentModName} (${analyzedMods.size}/${totalMods})`
			} else if (currentPhase === "deploying") {
				const fraction = totalMods > 0 ? deployedMods.size / totalMods : 0
				progressPercent = Math.round(31 + fraction * 49)
				statusLabel = `Deploying mod: ${currentModName} (${deployedMods.size}/${totalMods})`
			} else if (currentPhase === "localising") {
				progressPercent = 82
				statusLabel = "Localising text..."
			} else if (currentPhase === "patching-thumbs") {
				progressPercent = 85
				statusLabel = "Patching thumbs..."
			} else if (currentPhase === "patching-pd") {
				progressPercent = 88
				statusLabel = "Patching packagedefinition..."
			} else if (currentPhase === "generating-rpkgs") {
				statusLabel = "Generating RPKGs..."
				if (rpkgStartTime > 0) {
					const elapsedMs = performance.now() - rpkgStartTime
					let durationSec = 90
					if (totalMods <= 1) {
						durationSec = 90
					} else if (totalMods <= 5) {
						durationSec = 90 + ((totalMods - 1) / 4) * 210
					} else if (totalMods <= 10) {
						durationSec = 300 + ((totalMods - 5) / 5) * 300
					} else if (totalMods <= 20) {
						durationSec = 600 + ((totalMods - 10) / 10) * 300
					} else {
						durationSec = 900 + (totalMods - 20) * 60
					}
					const ratio = Math.min(1, elapsedMs / (durationSec * 1000))
					progressPercent = Math.round(90 + ratio * 8)
				} else {
					progressPercent = 90
				}
			} else if (currentPhase === "finalizing") {
				progressPercent = 95
				statusLabel = "Finalizing deployment..."
			}
		} else {
			progressPercent = 0
			statusLabel = "Preparing deployment..."
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (frameworkDeployModalOpen && !deployFinished && event.key === "Escape") {
			event.preventDefault()
			event.stopPropagation()
		}
	}

	window.ipc.receive("frameworkDeployModalOpen", (deployStartTime) => {
		frameworkDeployModalOpen = true
		deployOutput = ""
		resetRenderedOutput()
		deployFinished = false
		hasError = false
		errorMessage = ""
		progressPercent = 0
		statusLabel = "Starting deployment..."
		totalMods = enabledMods.length
		stagedCount = 0
		startDeployTimer(deployStartTime)
	})

	let wasAtBottom = true
	let autoScrollTimeout = null

	function handleScroll(e) {
		const el = e.currentTarget
		if (!el) return

		const isAtBottom = el.scrollHeight - el.clientHeight - el.scrollTop < 100
		wasAtBottom = isAtBottom

		clearTimeout(autoScrollTimeout)
		if (!isAtBottom) {
			const delay = 20000
			autoScrollTimeout = setTimeout(() => {
				wasAtBottom = true
				const targetEl = document.getElementById("deployOutputElement")
				if (targetEl) {
					targetEl.scrollTop = targetEl.scrollHeight
				}
			}, delay)
		}
	}

	const convertOutputToHTML = throttle(() => {
		const el = document.getElementById("deployOutputElement")
		if (el) {
			wasAtBottom = el.scrollHeight - el.clientHeight - el.scrollTop < 100
		} else {
			wasAtBottom = true
		}

		if (deployOutput.length < lastParsedLength) {
			lastParsedLength = 0
			parsedHtmlLines = []
			lastAppendedLine = ""
		}

		const isFinal = deployFinished || hasError
		const newChunk = deployOutput.substring(lastParsedLength)
		let newLines: string[] = []

		if (newChunk) {
			let completeChunk = ""
			let consumedLength = 0

			if (isFinal) {
				completeChunk = newChunk
				consumedLength = newChunk.length
			} else {
				const lastNewlineIdx = newChunk.lastIndexOf("\n")
				if (lastNewlineIdx !== -1) {
					completeChunk = newChunk.substring(0, lastNewlineIdx + 1)
					consumedLength = completeChunk.length
				}
			}

			if (consumedLength > 0) {
				lastParsedLength += consumedLength

				const rawLinesChunk = completeChunk.split(/\r?\n/)
				if (rawLinesChunk[rawLinesChunk.length - 1] === "") {
					rawLinesChunk.pop()
				}

				for (const line of rawLinesChunk) {
					if (line !== lastAppendedLine) {
						newLines.push(line)
						lastAppendedLine = line
					}
				}

				if (newLines.length > 0) {
					const newHtmlLines = newLines.map((line) => convertAnsi.toHtml(line))
					parsedHtmlLines.push(...newHtmlLines)
					deployOutputHTML = parsedHtmlLines.join("\n")
				}
			}
		}

		if (newLines.length > 0) {
			totalLinesCount += newLines.length
			if (deployFinished || hasError || !parserWorker) {
				parseLinesSynchronously(newLines)
			} else {
				parserWorker.postMessage({ newLines, existingWarnings: deployWarnings })
			}
		}

		updateProgressAndLabels()

		tick().then(() => {
			const el = document.getElementById("deployOutputElement")
			if (el && wasAtBottom) {
				el.scrollTop = el.scrollHeight
			}
		})
	}, 200)

	window.ipc.receive("frameworkDeployOutput", (output: string) => {
		deployOutput = output
		convertOutputToHTML()
	})

	window.ipc.receive("frameworkDeployFinished", () => {
		deployFinished = true
		convertOutputToHTML.flush()
		stopDeployTimer()

		const lines = deployOutput.split(/\r?\n/).map((a) => a.trim())
		const succeeded = lines.some((a) => a.includes("Done in"))

		if (succeeded && !hasError) {
			progressPercent = 100
			statusLabel = "Deployment completed successfully!"
		} else {
			hasError = true
			if (deployOutput.includes("Deploy.exe exited with code") || deployOutput.includes("Failed to start Deploy.exe")) {
				statusLabel = "Deployment failed: deploy.exe crashed"
			} else {
				statusLabel = "Deployment failed"
			}

			// Kill deploy process tree to prevent process leak
			window.ipc.send("killDeployProcess")

			if (!errorMessage) {
				const lastErrorLine = [...lines].reverse().find((a) => a.includes("Error:") || a.includes("ERROR") || a.includes("uncaughtException"))
				errorMessage = lastErrorLine ? lastErrorLine.replace(/.*(ERROR.*?\t|Error:\s*)/, "").trim() : "The deployment process terminated unexpectedly."
			}
		}
	})

	window.ipc.receive("modFileOpenDialogResult", (modFilePopupResult: string[] | undefined) => {
		if (!modFilePopupResult || modFilePopupResult.length === 0) {
			return
		}

		stageFiles(modFilePopupResult)
	})

	document.addEventListener("drop", (event) => {
		event.preventDefault()
		event.stopPropagation()
		showDropHint = false
		if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
			const paths = Array.from(event.dataTransfer.files).map((f: any) => f.path)
			stageFiles(paths)
		}
	})
	document.addEventListener("dragover", (event) => {
		event.preventDefault()
		event.stopPropagation()
	})
	document.addEventListener("dragenter", (event) => {
		if ((event.dataTransfer?.items?.length ?? 0) > 0 && event.dataTransfer?.items[0]?.kind === "file") showDropHint = true
	})
	document.addEventListener("dragleave", (event) => {
		if (event.relatedTarget == null) showDropHint = false
	})

	let bulkImportModalOpen = false
	let stageInProgress = false
	let importInProgress = false
	let deleteInProgress = false
	let currentStagingRunId = 0
	let activeStagingProcess: any = null
	let stagedMods: Array<{
		id: string
		fileName: string
		filePath: string
		stageDir: string
		type: "framework" | "rpkg" | "unknown"
		status: "valid" | "warning" | "invalid"
		errors: string[]
		warnings: string[]
		mods: Array<{
			id: string
			name: string
			folder: string
			isFramework: boolean
			rpkgs?: Array<{ path: string; chunk: string }>
		}>
		rpkgNameInput?: string
	}> = []

	function execFileAsync(file: string, args: string[]): Promise<string> {
		return new Promise((resolve, reject) => {
			const proc = window.child_process.execFile(file, args, (error: any, stdout: any, stderr: any) => {
				if (activeStagingProcess === proc) {
					activeStagingProcess = null
				}
				if (error) {
					reject(error)
				} else {
					resolve(stdout)
				}
			})
			activeStagingProcess = proc
		})
	}

	function sanitizeModName(name: string): string {
		let sanitized = name.replace(/[<>:"/\\|?*]/g, "")
		sanitized = sanitized.replace(/^\.+$/, "")
		sanitized = sanitized.trim()
		if (!sanitized) {
			sanitized = "staged_rpkg_mod"
		}
		return sanitized
	}

	async function stageFiles(filePaths: string[]) {
		if (activeStagingProcess) {
			try {
				activeStagingProcess.kill()
			} catch (e) {
				console.error("Failed to kill previous staging process:", e)
			}
			activeStagingProcess = null
		}
		stageInProgress = true
		bulkImportModalOpen = true
		stagedMods = []
		const runId = ++currentStagingRunId
		try {
			try {
				window.fs.emptyDirSync("./staging")
			} catch (e) {
				// staging folder might not exist yet
			}

			for (let i = 0; i < filePaths.length; i++) {
				if (runId !== currentStagingRunId) {
					return
				}
				const filePath = filePaths[i]
				const fileName = window.path.basename(filePath)
				const stageDir = window.path.join("./staging", `temp_${i}`)
				window.fs.ensureDirSync(stageDir)

				let type: "framework" | "rpkg" | "unknown" = "unknown"
				let status: "valid" | "warning" | "invalid" = "valid"
				let errors: string[] = []
				let warnings: string[] = []
				let mods: any[] = []
				let rpkgNameInput = ""

				if (filePath.toLowerCase().endsWith(".rpkg")) {
					type = "rpkg"
					status = "valid"
					let chunk = "chunk0"
					const fileName = window.path.basename(filePath)
					let result = [...fileName.matchAll(/(chunk[0-9]*)/g)]
					if (result.length) {
						chunk = result[0][1]
					}
					const destChunkDir = window.path.join(stageDir, chunk)
					window.fs.ensureDirSync(destChunkDir)
					window.fs.copyFileSync(filePath, window.path.join(destChunkDir, fileName))

					const cleanName = fileName.replace(/\.rpkg$/i, "")
					rpkgNameInput = cleanName
					mods = [
						{
							id: cleanName,
							name: cleanName,
							folder: stageDir,
							isFramework: false,
							rpkgs: [{ path: window.path.join(destChunkDir, fileName), chunk }]
						}
					]
				} else {
					try {
						await execFileAsync("..\\Third-Party\\7z.exe", ["x", filePath, "-aoa", "-y", `-o${stageDir}`])
						if (runId !== currentStagingRunId) {
							return
						}

						const rootFiles = window.fs.readdirSync(stageDir)
						const hasFilesAtRoot = window.klaw(stageDir, { depthLimit: 0, nodir: true }).length > 0
						const everySubdirHasManifest =
							rootFiles.length > 0 &&
							rootFiles.every((a) => {
								const fullSubPath = window.path.join(stageDir, a)
								if (!window.isFile(fullSubPath)) {
									return window.fs.existsSync(window.path.join(fullSubPath, "manifest.json"))
								}
								return false
							})

						if (everySubdirHasManifest && !hasFilesAtRoot) {
							type = "framework"
							for (const a of rootFiles) {
								const modFolder = window.path.join(stageDir, a)
								let manifest: any
								try {
									manifest = json5.parse(window.fs.readFileSync(window.path.join(modFolder, "manifest.json"), "utf8"))
								} catch (e) {
									status = "invalid"
									errors.push(`Invalid manifest.json syntax in folder "${a}"`)
									continue
								}

								const modValidation = await validateModFolder(modFolder)
								if (!modValidation[0]) {
									status = "invalid"
									errors.push(`Validation failed for "${manifest.name || a}": ${modValidation[1]}`)
								} else {
									let modWarning = ""
									if (manifest.scripts || manifest.options?.some((b: any) => b.scripts)) {
										modWarning = "Contains custom scripts"
									}
									if (manifest.peacockPlugins || manifest.options?.some((b: any) => b.peacockPlugins)) {
										if (modWarning) modWarning += ", and peacock plugins"
										else modWarning = "Contains peacock plugins"
									}
									if (modWarning) {
										if (status !== "invalid") {
											status = "warning"
										}
										warnings.push(`${manifest.name || a}: ${modWarning}`)
									}
									mods.push({
										id: manifest.id,
										name: manifest.name,
										folder: modFolder,
										isFramework: true
									})
								}
							}
						} else {
							const stagingFileList = window.klaw(stageDir, { nodir: true })
							const rpkgFiles = stagingFileList.filter((a) => a.path.toLowerCase().endsWith(".rpkg"))
							if (rpkgFiles.length > 0) {
								type = "rpkg"
								if ((status as string) !== "invalid") {
									status = "valid"
								}
								const cleanName = fileName.replace(/\.(zip|7z|rar)$/i, "")
								rpkgNameInput = cleanName

								const rpkgsToInstall: any[] = []
								for (const file of rpkgFiles) {
									let chunk = "chunk0"
									const relPath = window.path.relative(stageDir, file.path)
									let result = [...relPath.matchAll(/(chunk[0-9]*)/g)]
									if (result.length) {
										chunk = result[0][1]
									}
									rpkgsToInstall.push({ path: file.path, chunk })
								}

								mods = [
									{
										id: cleanName,
										name: cleanName,
										folder: stageDir,
										isFramework: false,
										rpkgs: rpkgsToInstall
									}
								]
							} else {
								type = "unknown"
								status = "invalid"
								errors.push("No manifest.json or .rpkg files found in archive")
							}
						}
					} catch (err: any) {
						status = "invalid"
						errors.push(`Extraction/Analysis failed: ${err.message || err}`)
					}
				}

				if (runId !== currentStagingRunId) {
					return
				}
				stagedMods.push({
					id: `staged_${Date.now()}_${i}`,
					fileName,
					filePath,
					stageDir,
					type,
					status,
					errors,
					warnings,
					mods,
					rpkgNameInput
				})
			}
			if (runId !== currentStagingRunId) {
				return
			}
			stagedMods = stagedMods
		} finally {
			if (runId === currentStagingRunId) {
				stageInProgress = false
			}
		}
	}

	/**
	 * Replaces a destination folder with a temporary source folder safely.
	 * Backs up the destination first and rolls back if the replacement fails.
	 *
	 * @param tempSource The path to the temporary source directory.
	 * @param destFolder The path to the destination directory.
	 */
	async function safeReplaceFolder(tempSource: string, destFolder: string) {
		const backupFolder = destFolder + ".bak"
		let backedUp = false

		try {
			if (await window.fs.pathExists(destFolder)) {
				if (await window.fs.pathExists(backupFolder)) {
					await window.fs.remove(backupFolder)
				}
				await window.fs.rename(destFolder, backupFolder)
				backedUp = true
			}

			await window.fs.rename(tempSource, destFolder)

			if (backedUp) {
				await window.fs.remove(backupFolder)
			}
		} catch (error) {
			if (backedUp) {
				try {
					if (await window.fs.pathExists(destFolder)) {
						await window.fs.remove(destFolder)
					}
					await window.fs.rename(backupFolder, destFolder)
				} catch (rollbackError) {
					console.error("Failed to rollback during folder replacement:", rollbackError)
				}
			}
			throw error
		}
	}

	async function executeBulkImport() {
		const modsToImport = stagedMods.filter((sm) => sm.status !== "invalid")

		const existingNames: string[] = []
		for (const staged of modsToImport) {
			if (staged.type === "framework") {
				for (const mod of staged.mods) {
					const existingFolder = getConfig().knownMods.includes(mod.id) ? getModFolder(mod.id) : null
					const destFolder = existingFolder || window.path.join("..", "Mods", mod.id)
					if (window.fs.existsSync(destFolder)) {
						existingNames.push(mod.name || mod.id)
					}
				}
			} else if (staged.type === "rpkg") {
				const rawName = staged.rpkgNameInput ? staged.rpkgNameInput.trim() : staged.fileName.replace(/\.[^/.]+$/, "")
				const modName = sanitizeModName(rawName)
				const destFolder = window.path.join("..", "Mods", modName)
				if (window.fs.existsSync(destFolder)) {
					existingNames.push(modName)
				}
			}
		}

		if (existingNames.length > 0) {
			const confirm = window.confirm(`The following mods already exist and will be overwritten:\n${existingNames.join(", ")}\n\nDo you want to continue?`)
			if (!confirm) {
				return
			}
		}

		importInProgress = true

		try {
			for (const staged of modsToImport) {
				if (staged.type === "framework") {
					for (const mod of staged.mods) {
						const existingFolder = getConfig().knownMods.includes(mod.id) ? getModFolder(mod.id) : null
						const destFolder = existingFolder || window.path.join("..", "Mods", mod.id)
						const tempDest = destFolder + ".tmp"
						if (await window.fs.pathExists(tempDest)) {
							await window.fs.remove(tempDest)
						}
						await window.fs.copy(mod.folder, tempDest)
						await safeReplaceFolder(tempDest, destFolder)

						if (!getConfig().knownMods.includes(mod.id)) {
							mergeConfig({
								knownMods: [...getConfig().knownMods, mod.id]
							})
						}
						clearValidationCacheForFolder(destFolder)
					}
				} else if (staged.type === "rpkg") {
					const rawName = staged.rpkgNameInput ? staged.rpkgNameInput.trim() : staged.fileName.replace(/\.[^/.]+$/, "")
					const modName = sanitizeModName(rawName)
					const destFolder = window.path.join("..", "Mods", modName)
					const tempDest = destFolder + ".tmp"
					if (await window.fs.pathExists(tempDest)) {
						await window.fs.remove(tempDest)
					}

					for (const mod of staged.mods) {
						if (mod.rpkgs) {
							for (const file of mod.rpkgs) {
								const destDir = window.path.join(tempDest, file.chunk)
								await window.fs.ensureDir(destDir)
								await window.fs.copy(file.path, window.path.join(destDir, window.path.basename(file.path)))
							}
						}
					}

					await safeReplaceFolder(tempDest, destFolder)

					if (!getConfig().knownMods.includes(modName)) {
						mergeConfig({
							knownMods: [...getConfig().knownMods, modName]
						})
					}
					clearValidationCacheForFolder(destFolder)
				}
			}

			try {
				await window.fs.remove("./staging")
			} catch {}

			// NOTE: We are running a full asynchronous cache rebuild here.
			/*  This can take some time if the user has many mods installed
			    as it scans directories and reads manifest JSON files in the background.

			    A future optimization could update in-memory cache maps
			    incrementally to run it in 0ms, but that would significantly
			    increase the complexity and risk of cache drift.
			*/
			bulkImportModalOpen = false
			stagedMods = []

			await preloadModsCache("bulkImport", true)

			forceModListsUpdate = Math.random()
			markChanged()
		} catch (error) {
			console.error("Failed to execute bulk import:", error)
			window.alert(`Failed to import mods: ${error instanceof Error ? error.message : String(error)}`)
		} finally {
			importInProgress = false
		}
	}

	function removeStagedMod(id: string) {
		const modToRemove = stagedMods.find((sm) => sm.id === id)
		if (modToRemove) {
			try {
				window.fs.removeSync(modToRemove.stageDir)
			} catch (e) {
				// ignore cleanup errors
			}
		}
		stagedMods = stagedMods.filter((sm) => sm.id !== id)
		if (stagedMods.length === 0) {
			bulkImportModalOpen = false
		}
	}

	function cancelBulkImport() {
		if (importInProgress) {
			return
		}
		currentStagingRunId++
		if (activeStagingProcess) {
			try {
				activeStagingProcess.kill()
			} catch (e) {
				console.error("Failed to kill staging process on cancel:", e)
			}
			activeStagingProcess = null
		}
		for (const staged of stagedMods) {
			try {
				window.fs.removeSync(staged.stageDir)
			} catch (e) {
				// ignore cleanup errors
			}
		}
		try {
			window.fs.removeSync("./staging")
		} catch (e) {
			// ignore cleanup errors
		}
		stagedMods = []
		bulkImportModalOpen = false
	}

	function openAddModDialog() {
		window.ipc.send("modFileOpenDialog")
	}

	let displayExtractedModsDialog = false
	const extractedMods: string[] = []

	// Config verification moved to reactive cacheLoaded block to prevent synchronous loading blocks on render

	let uploadedLogURL = ""
	let uploadLogModalOpen = false
	let uploadLogFailedModalOpen = false

	let availableModFilter = ""
	let enabledModFilter = ""

	let autoInstallDownloading = false
	let autoInstallDownloadProgress = 0
	let autoInstallDownloadSize = 0
	let autoInstallModName = ""
	let autoInstallModalOpen = false

	$: if ($page.url.searchParams.get("urlScheme")) {
		;(async () => {
			try {
				const downloadUrl = $page.url.searchParams.get("urlScheme")!
				const url = new URL(downloadUrl)
				if (url.protocol !== "https:" || !trustedHosts.has(url.hostname)) {
					window.alert("Security error: Untrusted host or protocol for mod download: " + url.hostname)
					return
				}

				autoInstallDownloading = true
				autoInstallDownloadProgress = 0
				autoInstallDownloadSize = 0

				const response = await fetch(downloadUrl)
				if (!response.ok || !response.body) {
					throw new Error(`Failed to fetch mod: ${response.statusText}`)
				}
				const reader = response.body.getReader()
				autoInstallDownloadSize = +response.headers.get("Content-Length")!

				window.fs.writeFileSync("./tempArchive", new Uint8Array(0)) // Clear file

				let receivedLength = 0
				while (true) {
					const { done, value } = await reader.read()
					if (done) {
						break
					}
					window.fs.appendFileSync("./tempArchive", value)
					receivedLength += value.length
					autoInstallDownloadProgress = receivedLength
				}

				window.fs.emptyDirSync("./staging")
				window.child_process.execSync(`"..\\Third-Party\\7z.exe" x "./tempArchive" -aoa -y -o"./staging"`)

				const rootFiles = window.fs.readdirSync("./staging")
				if (rootFiles.length === 0) {
					throw new Error("Extracted staging folder is empty")
				}
				const manifestPath = window.path.join("./staging", rootFiles[0], "manifest.json")
				if (!window.fs.existsSync(manifestPath)) {
					throw new Error("No manifest.json found in the extracted mod")
				}
				autoInstallModName = json5.parse(window.fs.readFileSync(manifestPath, "utf8")).name
				autoInstallModalOpen = true
			} catch (e: any) {
				window.alert("Couldn't download or extract the mod! Check your internet connection, or contact the mod author for help.\n\n" + (e.message || e))
			} finally {
				autoInstallDownloading = false
			}
		})()
	}

	function handleSort(event: any) {
		mergeConfig({
			loadOrder: event.detail.map((a: any) => a.value)
		})
		forceModListsUpdate = Math.random()
		markChanged()
	}

	function parseLinesSynchronously(newLines: string[]) {
		const result = parseLogs(newLines, deployWarnings, currentPhase, currentModName)

		if (result.hasError) {
			hasError = true
			errorMessage = result.errorMessage
		}

		if (result.newlyDiscoveredWarnings.length > 0) {
			deployWarnings = [...deployWarnings, ...result.newlyDiscoveredWarnings]
		}

		if (result.newlyAnalyzedMods.length > 0) {
			for (const mod of result.newlyAnalyzedMods) {
				analyzedMods.add(mod)
			}
			analyzedMods = analyzedMods
		}

		if (result.newlyDeployedMods.length > 0) {
			for (const mod of result.newlyDeployedMods) {
				deployedMods.add(mod)
			}
			deployedMods = deployedMods
		}

		if (result.currentPhase === "generating-rpkgs" && currentPhase !== "generating-rpkgs") {
			rpkgStartTime = performance.now()
		}

		currentPhase = result.currentPhase
		currentModName = result.currentModName

		updateProgressAndLabels()
	}

	onDestroy(() => {
		stopDeployTimer()
	})

	beforeNavigate((navigation) => {
		if (frameworkDeployModalOpen && !deployFinished) {
			navigation.cancel()
		}
	})
</script>

<svelte:window on:keydown={handleKeydown} />

{#if !cacheLoaded}
	<CacheLoading loading={!cacheLoaded} error={cacheLoadError} retryCallback={preloadCache} />
{:else}
	<div class="grid grid-cols-2 gap-4 w-full mb-16">
		<div class="w-full">
			<div class="flex gap-4 items-center justify-center" transition:scale>
				<h1 class="flex-grow">Available Mods</h1>
				<div>
					<Search icon={Filter} placeholder="Filter available mods" bind:value={availableModFilter} />
				</div>
				<Button
					kind="primary"
					icon={Add}
					on:click={() => {
						openAddModDialog()
					}}
				>
					Add a Mod
				</Button>
			</div>
			<br />
			<div class="h-[90vh] overflow-y-auto">
				{#each disabledMods.filter( (a) => ((modIsFramework(a.value) ? getManifestFromModID(a.value).name : a.value) + (modIsFramework(a.value) ? getManifestFromModID(a.value).description : ""))
							.toLowerCase()
							.includes(availableModFilter.toLowerCase()) ) as item (item.value)}
					<div animate:flip={{ duration: 300 }}>
						<div transition:scale>
							<Mod
								isFrameworkMod={modIsFramework(item.value)}
								manifest={modIsFramework(item.value) ? getManifestFromModID(item.value) : undefined}
								rpkgModName={!modIsFramework(item.value) ? item.value : undefined}
							>
								<Button
									kind="primary"
									icon={AddAlt}
									on:click={() => {
										mergeConfig({
											loadOrder: [...getConfig().loadOrder, item.value]
										})
										markChanged()
										forceModListsUpdate = Math.random()
									}}
								>
									Enable
								</Button>
								<Button
									kind="danger"
									icon={TrashCan}
									on:click={() => {
										deleteModInProgress = item.value
										deleteModModalOpen = true
									}}
								>
									Delete
								</Button>
							</Mod>
						</div>
						<br />
					</div>
				{/each}
			</div>
		</div>
		<div class="w-full">
			<div class="flex gap-4 items-center justify-center" transition:scale>
				<h1 class="flex-grow">{changed && !deployFinished ? "To Be Applied" : "Enabled Mods"}</h1>
				<div>
					<Search icon={Filter} placeholder="Filter enabled mods" bind:value={enabledModFilter} />
				</div>
				<Button
					kind="primary"
					{...{ style: changed && !deployFinished ? "background-color: green" : "" }}
					icon={Rocket}
					on:click={() => {
						if (sortMods()) {
							deployOutput = ""
							resetRenderedOutput()
							deployFinished = false
							window.ipc.send("deploy")
						} else {
							dependencyCycleModalOpen = true
						}
					}}
				>
					Apply
				</Button>
			</div>
			<br />
			<div class="h-[90vh] overflow-y-auto">
				<SortableList list={enabledMods} key="value" on:sort={handleSort} let:item>
					<div class="cursor-grab">
						<Mod
							isFrameworkMod={modIsFramework(item.value)}
							manifest={modIsFramework(item.value) ? getManifestFromModID(item.value) : undefined}
							rpkgModName={!modIsFramework(item.value) ? item.value : undefined}
							darken={!(
								(modIsFramework(item.value) ? getManifestFromModID(item.value).name : item.value) + (modIsFramework(item.value) ? getManifestFromModID(item.value).description : "")
							)
								.toLowerCase()
								.includes(enabledModFilter.toLowerCase())}
						>
							{#if modIsFramework(item.value) && getManifestFromModID(item.value)?.options?.filter((a) => a.type != OptionType.conditional)?.length}
								<Button
									kind="ghost"
									icon={Settings}
									iconDescription="Adjust this mod's settings"
									on:click={() => {
										goto(`/settings?mod=${getManifestFromModID(item.value).id}`)
									}}
								/>
							{/if}
							<Button
								kind="danger"
								icon={SubtractAlt}
								on:click={() => {
									mergeConfig({
										loadOrder: getConfig().loadOrder.filter((a) => a != item.value)
									})
									markChanged()
									forceModListsUpdate = Math.random()
								}}
							>
								Disable
							</Button>
						</Mod>
						<br />
					</div>
				</SortableList>
			</div>
		</div>
	</div>

	{#if showDropHint}
		<div transition:fade={{ duration: 100 }} class="w-screen h-screen absolute top-0 left-0 bg-black/90 flex flex-col gap-4 justify-center items-center">
			<h1 class="font-bold">Drop to install</h1>
		</div>
	{/if}

	<Modal
		danger
		bind:open={deleteModModalOpen}
		modalHeading="Delete mod"
		primaryButtonText="Delete the mod"
		secondaryButtonText="Cancel"
		primaryButtonDisabled={deleteInProgress}
		on:click:button--secondary={() => {
			if (!deleteInProgress) deleteModModalOpen = false
		}}
		on:submit={async () => {
			deleteInProgress = true
			markModAsDeleting(deleteModInProgress)
			try {
				const modFolder = getModFolder(deleteModInProgress)
				await removeDirectoryRecursive(modFolder)
				mergeConfig({
					knownMods: getConfig().knownMods.filter((a) => a != deleteModInProgress),
					loadOrder: getConfig().loadOrder.filter((a) => a != deleteModInProgress)
				})
				clearValidationCacheForFolder(modFolder)

				deleteModModalOpen = false
				await preloadModsCache("deleteMod", true)

				forceModListsUpdate = Math.random()
				markChanged()
			} catch (e) {
				console.error("Failed to delete mod:", e)
				window.alert(`Failed to delete mod: ${e instanceof Error ? e.message : String(e)}`)
			} finally {
				await tick()
				unmarkModAsDeleting(deleteModInProgress)
				deleteInProgress = false
				deleteModInProgress = ""
			}
		}}
		shouldSubmitOnEnter={false}
	>
		{#if deleteInProgress}
			<div class="flex flex-col items-center justify-center py-4">
				<ProgressBar helperText="Deleting mod..." />
			</div>
		{:else if deleteModInProgress}
			<p>
				Are you sure you want to permanently remove the <i>{modIsFramework(deleteModInProgress) ? getManifestFromModID(deleteModInProgress).name : deleteModInProgress}</i>
				mod from the Mods folder? You cannot undo this.
			</p>
		{/if}
	</Modal>

	<Modal alert bind:open={dependencyCycleModalOpen} modalHeading="Dependency cycle (couldn't sort mods)" primaryButtonText="OK" shouldSubmitOnEnter={false}>
		<p>The framework couldn't sort your mods! Ask the developer of whichever mod you most recently installed to investigate this. Also, report this to Atampy26 on Hitman Forum or Discord.</p>
	</Modal>

	<Modal
		passiveModal
		bind:open={frameworkDeployModalOpen}
		modalHeading="Applying your mods"
		preventCloseOnClickOutside={!deployFinished}
		on:close={(e) => {
			if (!deployFinished) {
				e.preventDefault()
				frameworkDeployModalOpen = true
			}
		}}
	>
		{#if hasError}
			<div class="mb-4">
				<InlineNotification hideCloseButton lowContrast kind="error" title="Deployment Failed" subtitle={errorMessage} style="max-width: none; width: 100%;" />
			</div>
		{/if}

		<div class="bx--progress-bar mb-4">
			{#if !hasError}
				<div class="flex justify-between items-center mb-1 text-sm text-gray-200">
					<span>{statusLabel}</span>
					<span class="font-mono font-bold" style="color: {hasError ? '#da1e28' : '#ffffff'};">{progressPercent}%</span>
				</div>
				<div class="bx--progress-bar__track" style="height: 8px;">
					<div
						class="bx--progress-bar__bar"
						style="transform: scaleX({progressPercent / 100}); transform-origin: left; transition: transform 0.3s ease-out; background-color: {hasError ? '#da1e28' : '#0f62fe'};"
					></div>
				</div>
			{/if}
			<div class="bx--progress-bar__helper-text mt-1 text-xs text-gray-400 font-mono flex justify-between">
				{#if hasError}
					{#if elapsedTimeStr.includes("m") || parseInt(elapsedTimeStr) > 5}
						<span class="text-red-400 font-bold">Failed in {elapsedTimeStr}</span>
					{/if}
				{:else if deployFinished}
					<span class="text-green-400 font-bold">Done in {elapsedTimeStr}</span>
				{:else}
					<span>Elapsed time: {elapsedTimeStr}</span>
				{/if}
			</div>
		</div>

		<div class="flex gap-4 mt-2 items-stretch">
			<pre
				use:setupConsoleResizeObserver
				class="flex-1 min-h-[25vh] min-w-[17.5rem] overflow-auto whitespace-pre-wrap bg-neutral-800 p-2 border border-neutral-700/30 rounded-sm"
				style="font-family: 'Fira Code', 'IBM Plex Mono', 'Menlo', 'DejaVu Sans Mono', 'Bitstream Vera Sans Mono', Courier, monospace; color-scheme: dark; font-size: 0.75rem; resize: vertical; height: 35vh; max-height: 60vh;"
				id="deployOutputElement"
				on:scroll={handleScroll}>{@html deployOutputHTML}</pre>

			{#if deployWarnings.length > 0}
				<div
					class="overflow-y-auto bg-neutral-800 p-2 border border-yellow-600/40 rounded-sm text-yellow-300 text-xs flex flex-col gap-1"
					style="width: 260px; font-family: 'Fira Code', 'IBM Plex Mono', monospace; color-scheme: dark; min-height: 25vh; max-height: 60vh; margin-left: auto;"
				>
					<div class="font-bold border-b border-yellow-600/30 pb-1 mb-1 sticky top-0 bg-neutral-800 z-10">Warnings ({deployWarnings.length})</div>
					{#each deployWarnings as warning, index}
						<div class="py-1 border-b border-neutral-700/50 break-words leading-relaxed">
							<div style="color: #888888; font-weight: bold; margin-bottom: 0.25rem;">[{String(index + 1).padStart(2, "0")}]</div>
							<div>{warning}</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		{#if deployFinished}
			<br />
			<div class="flex gap-4 items-center">
				{#if deployOutput
					.split(/\r?\n/)
					.map((a) => a.trim())
					.filter((a) => a.length)
					.at(-1)
					?.match(/\tDone in .*/) && !deployOutput.split(/\r?\n/).some((a) => a.match(/.*WARN.*?\t/))}
					<Button kind="primary" icon={Close} on:click={() => (frameworkDeployModalOpen = false)}>Close</Button>
					<span class="text-green-300">Deploy successful</span>
				{:else if deployOutput
					.split(/\r?\n/)
					.map((a) => a.trim())
					.filter((a) => a.length)
					.at(-1)
					?.match(/\tDone in .*/) && deployOutput.split(/\r?\n/).some((a) => a.match(/.*WARN.*?\t/))}
					<Button kind="primary" icon={Close} on:click={() => (frameworkDeployModalOpen = false)}>Close</Button>
					<span class="text-yellow-300">Potential issues in deployment</span>
				{:else}
					<Button kind="primary" icon={Close} on:click={() => (frameworkDeployModalOpen = false)}>Close</Button>
					<Button
						kind="primary"
						icon={CloudUpload}
						on:click={async () => {
							const req = await fetch("https://hitman-resources.netlify.app/.netlify/functions/upload-smf-log", {
								method: "POST",
								headers: {
									"Content-Type": "application/json"
								},
								body: JSON.stringify({ content: "Config:\n" + JSON.stringify(getConfig()) + "\n\nDeploy log:\n" + deployOutput })
							})

							if (req.status == 200) {
								uploadedLogURL = await req.text()

								frameworkDeployModalOpen = false
								uploadLogModalOpen = true
							} else {
								uploadLogFailedModalOpen = true
							}
						}}
					>
						Upload mod list and log
					</Button>
					<span class="text-red-300">Deploy unsuccessful</span>
				{/if}
			</div>
		{/if}
	</Modal>

	<Modal
		open={bulkImportModalOpen}
		modalHeading="Staged Mods for Import"
		primaryButtonText="Import Valid Mods"
		secondaryButtonText="Cancel"
		primaryButtonDisabled={importInProgress || stagedMods.filter((sm) => sm.status !== "invalid").length === 0}
		on:click:button--primary={executeBulkImport}
		on:click:button--secondary={cancelBulkImport}
		on:close={cancelBulkImport}
	>
		<div class="mt-4 max-h-[50vh] overflow-y-auto overflow-x-hidden pr-2">
			{#if stageInProgress}
				<div class="flex flex-col items-center justify-center py-8">
					<ProgressBar helperText="Analyzing and staging mods..." />
				</div>
			{:else if importInProgress}
				<div class="flex flex-col items-center justify-center py-8">
					<ProgressBar helperText="Importing mods..." />
				</div>
			{:else}
				<div class="flex flex-col gap-4">
					{#each stagedMods as item (item.id)}
						<div class="flex flex-col gap-2 rounded bg-neutral-800 p-4 border border-neutral-700">
							<div class="flex items-center justify-between gap-4">
								<div class="flex flex-col min-w-0">
									<span class="font-bold text-white truncate text-[1rem]">{item.fileName}</span>
									<span class="text-xs text-neutral-400 truncate">{item.filePath}</span>
								</div>
								<div class="flex items-center gap-2 flex-shrink-0">
									{#if item.type === "framework"}
										<span class="px-2 py-0.5 rounded text-xs font-semibold bg-blue-900 text-blue-200">Framework Mod</span>
									{:else if item.type === "rpkg"}
										<span class="px-2 py-0.5 rounded text-xs font-semibold bg-purple-900 text-purple-200">RPKG Mod</span>
									{:else}
										<span class="px-2 py-0.5 rounded text-xs font-semibold bg-neutral-700 text-neutral-300">Unknown</span>
									{/if}

									{#if item.status === "valid"}
										<span class="px-2 py-0.5 rounded text-xs font-semibold bg-green-900 text-green-200">Ready</span>
									{:else if item.status === "warning"}
										<span class="px-2 py-0.5 rounded text-xs font-semibold bg-yellow-900 text-yellow-200">Warning</span>
									{:else}
										<span class="px-2 py-0.5 rounded text-xs font-semibold bg-red-900 text-red-200">Invalid</span>
									{/if}

									<Button kind="ghost" size="small" icon={TrashCan} iconDescription="Remove" on:click={() => removeStagedMod(item.id)} />
								</div>
							</div>

							{#if item.status === "invalid"}
								<div class="mt-2 text-xs text-red-400 bg-red-950/50 p-2 rounded border border-red-900/50">
									{#each item.errors as error}
										<div>• {error}</div>
									{/each}
								</div>
							{/if}

							{#if item.status === "warning"}
								<div class="mt-2 text-xs text-yellow-400 bg-yellow-950/50 p-2 rounded border border-yellow-900/50">
									{#each item.warnings as warning}
										<div>• {warning}</div>
									{/each}
								</div>
							{/if}

							{#if item.type === "rpkg" && item.status !== "invalid"}
								<div class="mt-2 flex flex-col gap-1">
									<label class="text-xs text-neutral-400" for="rpkgName-{item.id}">Mod folder name:</label>
									<input
										id="rpkgName-{item.id}"
										type="text"
										class="px-3 py-1.5 rounded bg-neutral-900 border border-neutral-700 text-sm text-white focus:outline-none focus:border-blue-500 w-full"
										bind:value={item.rpkgNameInput}
									/>
								</div>
							{/if}

							{#if item.type === "framework" && item.status !== "invalid"}
								<div class="mt-2 text-xs text-neutral-400">
									Contains {item.mods.length} framework mod{item.mods.length > 1 ? "s" : ""}:
									<ul class="list-disc list-inside mt-1 ml-2 text-neutral-300">
										{#each item.mods as m}
											<li>
												{m.name}
												<span class="text-neutral-500">({m.id})</span>
											</li>
										{/each}
									</ul>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</Modal>

	<Modal
		alert
		bind:open={displayExtractedModsDialog}
		modalHeading="Incorrectly installed mod{extractedMods.length > 1 ? 's' : ''}"
		primaryButtonText="OK"
		shouldSubmitOnEnter={false}
		on:submit={() => (displayExtractedModsDialog = false)}
	>
		<p>
			The mod{extractedMods.length > 1 ? "s" : ""}
			{extractedMods.slice(0, -1).length ? extractedMods.slice(0, -1).join(", ") + " and " + extractedMods[extractedMods.length - 1] : extractedMods[0]}
			{extractedMods.length > 1 ? "were" : "was"} installed by extracting the ZIP file directly to the Mods folder. That's not how you're meant to install mods; doing things this way could pose risks
			as it bypasses the framework's checks for mod validity and safety. Instead, use the Add a Mod button to add any mods you want. This message won't be shown again for {extractedMods.length >
			1
				? "these mods"
				: "this mod"}.
			<br />
			<br />
			If you're seeing this after creating a new mod yourself, you should enable developer mode in the information page - it'll improve your experience and let you use the mod authoring tools in
			the Mod Manager.
		</p>
	</Modal>

	<Modal alert bind:open={uploadLogFailedModalOpen} modalHeading="Couldn't upload log" primaryButtonText="OK" shouldSubmitOnEnter={false} on:submit={() => (uploadLogFailedModalOpen = false)}>
		<p>Your log couldn't be uploaded. Make sure you're connected to the Internet.</p>
	</Modal>

	<Modal alert bind:open={uploadLogModalOpen} modalHeading="Log uploaded" primaryButtonText="OK" shouldSubmitOnEnter={false} on:submit={() => (uploadLogModalOpen = false)}>
		<p class="mb-2">Your deploy log has been anonymously uploaded to the Internet.</p>
		<CodeSnippet code={uploadedLogURL} />
		<br />
		<div class="mb-6" />
	</Modal>

	<Modal passiveModal open={autoInstallDownloading} modalHeading={"Downloading the mod"} preventCloseOnClickOutside>
		<div class="mb-2">The mod is currently being downloaded - please wait.</div>
		<br />
		<ProgressBar kind="inline" value={autoInstallDownloadProgress} max={autoInstallDownloadSize} labelText="Downloading..." />
	</Modal>

	<Modal
		bind:open={autoInstallModalOpen}
		modalHeading="Installing {autoInstallModName}"
		primaryButtonText="OK"
		secondaryButtonText="Cancel"
		shouldSubmitOnEnter={false}
		on:click:button--secondary={() => (autoInstallModalOpen = false)}
		on:click:button--primary={() => {
			autoInstallModalOpen = false
			stageFiles(["./tempArchive"])
		}}
	>
		<p>The mod {autoInstallModName} has been downloaded via a link - would you like to install it?</p>
	</Modal>
{/if}

<style>
	:global(.bx--btn--ghost) {
		color: inherit;
		@apply bg-neutral-800;
	}

	:global(.bx--btn--ghost:hover, .bx--btn--ghost:active) {
		color: inherit;
	}

	/* Remove the weird spacing; it's created by the border, which can't be seen due to the dark background */
	:global(li) {
		border: inherit !important;
		transition: inherit !important;
	}

	:global(.over) {
		border-color: inherit !important;
	}

	:global(.bx--modal-close) {
		display: none;
	}

	:global(.bx--inline-notification__icon) {
		display: none;
	}

	:global(.bx--snippet.bx--snippet--single) {
		background-color: #262626;
	}

	@media (min-width: 82rem) {
		:global(.bx--modal-container) {
			width: 56%;
		}
	}

	:global(body.bx--body--with-modal-open) {
		overflow: auto !important;
	}

	:global(.bx--modal) {
		will-change: opacity;
	}

	:global(.bx--modal-container) {
		will-change: transform, opacity;
	}
</style>
