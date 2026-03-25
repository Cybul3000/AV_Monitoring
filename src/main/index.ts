import { app, BrowserWindow, Menu, protocol, net } from 'electron'
import { join } from 'path'
import { initDatabase, closeDatabase } from './db/database'
import { registerAllModules } from './modules/index'
import { registerPreferenceHandlers } from './ipc/preference-handlers'
import { registerNetworkHandlers, unregisterNetworkHandlers } from './ipc/network-handlers'
import { registerHierarchyHandlers } from './ipc/hierarchy-handlers'
import { registerDeviceHandlers, startPolling, stopPolling } from './ipc/device-handlers'
import { registerConfigHandlers } from './ipc/config-handlers'
import { registerLogHandlers } from './ipc/log-handlers'
import { registerOtelHandlers } from './ipc/otel-handlers'
import { registerZoomHandlers } from './ipc/zoom-handlers'
import { registerSettingsHandlers } from './ipc/settings-handlers'
import { registerAlertHandlers } from './ipc/alert-handlers'
import { registerDanteHandlers } from './ipc/dante-handlers'
import { buildMenu } from './menu'
import { createTray } from './tray'
import { getPreference, setPreference } from './preferences'

// Must be called before app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { secure: true, supportFetchAPI: true } }
])

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const savedBounds = getPreference('pref:windowBounds')

  mainWindow = new BrowserWindow({
    width: savedBounds?.width ?? 1280,
    height: savedBounds?.height ?? 800,
    x: savedBounds?.x,
    y: savedBounds?.y,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Persist window bounds
  const saveBounds = () => {
    if (mainWindow && !mainWindow.isMaximized() && !mainWindow.isMinimized()) {
      const bounds = mainWindow.getBounds()
      setPreference('pref:windowBounds', bounds)
    }
  }
  mainWindow.on('resize', saveBounds)
  mainWindow.on('move', saveBounds)

  mainWindow.once('ready-to-show', () => {
    mainWindow!.show()
  })

  // Load app
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Menu & tray
  const menu = buildMenu(mainWindow)
  Menu.setApplicationMenu(menu)
  createTray(mainWindow)

  // Register IPC handlers
  registerPreferenceHandlers()
  registerNetworkHandlers(mainWindow)
  registerHierarchyHandlers()
  registerDeviceHandlers(mainWindow)
  registerConfigHandlers()
  registerLogHandlers()
  registerOtelHandlers()
  registerZoomHandlers()
  registerSettingsHandlers()
  registerAlertHandlers()
  registerDanteHandlers(mainWindow)

  // Start device polling
  startPolling(mainWindow)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  // Allow renderer to load local files via local-file:// scheme
  protocol.handle('local-file', (request) => {
    const filePath = decodeURIComponent(request.url.slice('local-file://'.length))
    return net.fetch(`file://${filePath}`)
  })

  // Initialise data layer
  initDatabase()
  registerAllModules()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopPolling()
    unregisterNetworkHandlers()
    closeDatabase()
    app.quit()
  }
})

app.on('before-quit', () => {
  stopPolling()
  closeDatabase()
})
