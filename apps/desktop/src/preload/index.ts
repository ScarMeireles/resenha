import { contextBridge, ipcRenderer } from 'electron'
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
}

contextBridge.exposeInMainWorld('resenha', bridge)
