import { contextBridge, ipcRenderer } from 'electron'
import type { UpdateProgress } from '../main/updateRules'
import type { ResenhaBridge } from './bridge'

// Única ponte entre a tela (React) e o Electron. Expõe só funções pequenas e específicas.
const bridge: ResenhaBridge = {
  session: {
    load: () => ipcRenderer.invoke('session:load'),
    save: (token) => ipcRenderer.invoke('session:save', token),
    clear: () => ipcRenderer.invoke('session:clear'),
  },
  screen: {
    listSources: () => ipcRenderer.invoke('screen:sources'),
    choose: (choice) => ipcRenderer.invoke('screen:choose', choice),
  },
  screenAudio: {
    listApps: () => ipcRenderer.invoke('screen-audio:apps'),
    start: (request) => ipcRenderer.invoke('screen-audio:start', request),
    stop: () => ipcRenderer.invoke('screen-audio:stop'),
    onData: (listener) => subscribe('screen-audio:data', (_event, data: Uint8Array) => listener(data)),
    onEnded: (listener) => subscribe('screen-audio:ended', () => listener()),
  },
  updates: {
    run: (reason) => ipcRenderer.invoke('updates:run', reason),
    onProgress: (listener) => subscribe('updates:progress', (_event, progress: UpdateProgress) => listener(progress)),
  },
  popout: {
    setAlwaysOnTop: (on) => ipcRenderer.invoke('popout:always-on-top', on),
  },
}

/** Assina um evento do main e devolve a função que cancela; a tela nunca recebe o `event` do Electron. */
function subscribe(channel: string, handler: Parameters<typeof ipcRenderer.on>[1]): () => void {
  ipcRenderer.on(channel, handler)
  return () => { ipcRenderer.removeListener(channel, handler) }
}

contextBridge.exposeInMainWorld('resenha', bridge)
