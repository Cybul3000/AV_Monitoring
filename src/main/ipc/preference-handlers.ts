import { ipcMain } from 'electron'
import { getPreference, setPreference, getAllPreferences } from '../preferences'
import type { PreferencesSchema } from '../preferences'

export function registerPreferenceHandlers(): void {
  ipcMain.handle('preferences:get', (_event, payload: { key: string }) => {
    if (!payload?.key || typeof payload.key !== 'string') {
      return { success: false, error: 'Invalid payload' }
    }
    const value = getPreference(payload.key as keyof PreferencesSchema)
    return { value }
  })

  ipcMain.handle('preferences:set', (_event, payload: { key: string; value: unknown }) => {
    if (!payload?.key || typeof payload.key !== 'string') {
      return { success: false, error: 'Invalid payload' }
    }
    try {
      setPreference(payload.key as keyof PreferencesSchema, payload.value as never)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('preferences:getAll', () => {
    return { preferences: getAllPreferences() }
  })
}
