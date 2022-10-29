const { contextBridge, ipcRenderer, shell } = require("electron")
const { torchlight, Block } = require("./torchlight")

contextBridge.exposeInMainWorld("fs", require("fs-extra"))
contextBridge.exposeInMainWorld("path", require("path"))
contextBridge.exposeInMainWorld("klaw", require("klaw-sync"))
contextBridge.exposeInMainWorld("AdmZip", require("adm-zip"))
contextBridge.exposeInMainWorld("Buffer", require("buffer").Buffer)
contextBridge.exposeInMainWorld("ipc", {
	send: (channel, data) => {
		ipcRenderer.send(channel, data)
	},
	sendSync: (channel, data) => {
		ipcRenderer.sendSync(channel, data)
	},
	receive: (channel, func) => {
		ipcRenderer.on(channel, (event, ...args) => func(...args))
	},
	receiveOnce: (channel, func) => {
		ipcRenderer.once(channel, (event, ...args) => func(...args))
	}
})
contextBridge.exposeInMainWorld("openExternalLink", shell.openExternal)