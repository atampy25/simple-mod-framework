const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld("fs", require("fs-extra"))
contextBridge.exposeInMainWorld("path", require("path"))
contextBridge.exposeInMainWorld("klaw", require("klaw-sync"))
contextBridge.exposeInMainWorld("AdmZip", require("adm-zip"))
contextBridge.exposeInMainWorld("Buffer", require('buffer').Buffer)
contextBridge.exposeInMainWorld(
    'electron', {
        send: (channel, data) => {
            ipcRenderer.send(channel, data)
        },
        sendSync: (channel, data) => {
            ipcRenderer.sendSync(channel, data)
        },
        receive: (channel, func) => {
            ipcRenderer.once(channel, (event, ...args) => func(...args))
        }
    }
)