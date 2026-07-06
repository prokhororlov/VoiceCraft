import { BrowserWindow, Menu, app } from 'electron'
import path from 'path'

let mainWindow: BrowserWindow | null = null

// Lazy getter for isDev to avoid accessing app.isPackaged before Electron is ready
const getIsDev = () => process.env.NODE_ENV === 'development' || !app.isPackaged

export function createWindow() {
  Menu.setApplicationMenu(null)

  // Get icon path - works for both dev and production
  // In dev: __dirname is dist-electron/main, so go up two levels to reach project root
  // In prod: __dirname is resources/app.asar/dist-electron/main, build is at resources/build
  const iconPath = getIsDev()
    ? path.join(__dirname, '../../build/icon.ico')
    : path.join(process.resourcesPath, 'build/icon.ico')

  // Get preload path - works for both dev and production
  // In dev: __dirname is dist-electron/main, preload is at dist-electron/preload.js
  // In prod: same structure inside asar
  const preloadPath = path.join(__dirname, '../preload.js')

  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    icon: iconPath,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
    frame: false,
    show: false,
    roundedCorners: true,
    backgroundColor: '#1E1E1E',
  })

  if (getIsDev()) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    // In prod: __dirname is app.asar/dist-electron/main, dist folder is at app.asar/dist
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  // Allow opening DevTools with F12 in production for debugging
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      mainWindow?.webContents.toggleDevTools()
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Notify renderer about maximize/unmaximize state changes
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window-maximized-change', true)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window-maximized-change', false)
  })
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
