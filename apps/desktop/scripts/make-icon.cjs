// Gera build/icon.png (256 px) a partir da marca do app: o "R" em Space Grotesk sobre o quadrado laranja.
// Rodar com: npm run make:icon. O PNG gerado é versionado; só rode de novo se a marca mudar.
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..')
const font = readFileSync(
  join(root, 'node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2'),
).toString('base64')

// Mesmas cores e proporções do .brand-mark (44 px, cantos de 14 px, letra de 22 px), escaladas para 256 px.
const html = `<!doctype html><html><head><style>
@font-face { font-family: 'SG'; font-weight: 700; src: url(data:font/woff2;base64,${font}) format('woff2'); }
html, body { margin: 0; width: 256px; height: 256px; background: transparent; overflow: hidden; }
div { width: 256px; height: 256px; border-radius: 81px; background: #ff8a3d; color: #1a1206;
  display: flex; align-items: center; justify-content: center;
  font: 700 128px 'SG'; }
</style></head><body><div>R</div></body></html>`

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 256,
    height: 256,
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
    webPreferences: { offscreen: true },
  })
  // No modo offscreen os pixels chegam pelo evento "paint"; guarda o último quadro desenhado.
  let frame = null
  win.webContents.on('paint', (_event, _dirty, image) => {
    frame = image
  })
  await win.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'))
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
  win.webContents.invalidate()
  await new Promise((resolve) => setTimeout(resolve, 500))
  if (!frame) throw new Error('Nenhum quadro desenhado')
  const png = frame.resize({ width: 256, height: 256 }).toPNG()
  mkdirSync(join(root, 'build'), { recursive: true })
  writeFileSync(join(root, 'build/icon.png'), png)
  console.log('build/icon.png gerado (' + png.length + ' bytes)')
  app.quit()
}).catch((error) => {
  console.error(error)
  app.exit(1)
})
