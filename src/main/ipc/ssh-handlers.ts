import { ipcMain, BrowserWindow } from 'electron'
import { getModule } from '../modules/index'
import type { CrestronSSHModule } from '../modules/crestron-ssh/CrestronSSHModule'
import type {
  SSHOpenResponse,
  SSHSendRequest,
  SSHOutput,
  SSHStateChange,
  SSHSessionState
} from '@shared/ipc-types'

export function registerSSHHandlers(win: BrowserWindow): void {

  // ssh:open — opens SSH session for a device
  ipcMain.handle('ssh:open', async (_event, payload: { deviceId: string }): Promise<SSHOpenResponse> => {
    const { deviceId } = payload

    const module = getModule('crestron-ssh') as CrestronSSHModule | null
    if (!module) {
      return { success: false, sessionState: 'ERROR', error: 'Crestron SSH module not available' }
    }

    // Register callbacks to push events to the renderer
    module.registerCallbacks(
      deviceId,
      (state: SSHSessionState, reason?: string) => {
        if (!win.isDestroyed()) {
          win.webContents.send('ssh:state', { deviceId, state, reason } as SSHStateChange)
        }
      },
      (data: string) => {
        if (!win.isDestroyed()) {
          win.webContents.send('ssh:output', {
            deviceId,
            data,
            timestamp: new Date().toISOString()
          } as SSHOutput)
        }
      }
    )

    try {
      const result = await module.sendCommand(deviceId, 'openSSH')
      if (!result.success) {
        return { success: false, sessionState: 'ERROR', error: result.error }
      }
      return { success: true, sessionState: 'CONNECTING' }
    } catch (err) {
      return { success: false, sessionState: 'ERROR', error: String(err) }
    }
  })

  // ssh:close — closes SSH session
  ipcMain.handle('ssh:close', async (_event, payload: { deviceId: string }): Promise<{ success: boolean; error?: string }> => {
    const { deviceId } = payload

    const module = getModule('crestron-ssh') as CrestronSSHModule | null
    if (!module) {
      return { success: false, error: 'Crestron SSH module not available' }
    }

    try {
      const result = await module.sendCommand(deviceId, 'closeSSH')
      return { success: result.success, error: result.error }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ssh:send — send a command string
  ipcMain.handle('ssh:send', async (_event, req: SSHSendRequest): Promise<{ success: boolean; error?: string }> => {
    const { deviceId, command } = req

    const module = getModule('crestron-ssh') as CrestronSSHModule | null
    if (!module) {
      return { success: false, error: 'Crestron SSH module not available' }
    }

    try {
      const result = await module.sendCommand(deviceId, 'sendCommand', { command })
      return { success: result.success, error: result.error }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
}
