import { app, BrowserWindow, Menu } from 'electron'
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
import { buildMenu } from './menu'
import { createTray } from './tray'
import { getPreference, setPreference } from './preferences'

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
      preload: join(__dirname, '../preload/index.js'),
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

  // Start device polling
  startPolling(mainWindow)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
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
