import { join } from 'node:path'
import { app, BrowserWindow, nativeTheme, shell } from 'electron'
import { registerScreenHandlers } from './screen'
import { registerSessionHandlers } from './session'

// Só uma janela do Resenha por vez: abrir de novo traz a que já está aberta para a frente.
if (!app.requestSingleInstanceLock()) app.quit()

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  nativeTheme.themeSource = 'dark' // barra de título do Windows no tema escuro

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 940,
    minHeight: 560,
    title: 'Resenha',
    backgroundColor: '#111318', // evita o "flash" branco enquanto carrega
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // A tela não tem acesso ao Node nem ao sistema; só ao que o preload expõe.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // Links externos abrem no navegador; a janela do app nunca sai do próprio app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault()
  })

  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devServer) void mainWindow.loadURL(devServer)
  else void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.whenReady().then(() => {
  registerSessionHandlers()
  registerScreenHandlers(() => mainWindow?.getMediaSourceId() ?? null)
  createWindow()
})

app.on('window-all-closed', () => app.quit())
