import { ipcMain, BrowserWindow } from 'electron'
import { checkNetworkStatus } from '../platform/network-check'

let _networkInterval: NodeJS.Timeout | null = null

export function registerNetworkHandlers(win: BrowserWindow): void {
  ipcMain.handle('network:get', () => {
    return checkNetworkStatus()
  })

  // Push network status every 10 seconds
  _networkInterval = setInterval(() => {
    const status = checkNetworkStatus()
    if (!win.isDestroyed()) {
      win.webContents.send('network:status', status)
    }
  }, 10_000)
}

export function unregisterNetworkHandlers(): void {
  if (_networkInterval) {
    clearInterval(_networkInterval)
    _networkInterval = null
  }
  ipcMain.removeHandler('network:get')
}
