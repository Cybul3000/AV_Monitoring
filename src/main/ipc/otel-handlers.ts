import { ipcMain, dialog } from 'electron'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { OtelConfigBuilder } from '../services/OtelConfigBuilder'
import type { OtelGenerateRequest, OtelGenerateResponse } from '@shared/ipc-types'

export function registerOtelHandlers(): void {
  ipcMain.handle(
    'otel:generateConfig',
    async (_event, req: OtelGenerateRequest): Promise<OtelGenerateResponse> => {
      try {
        const builder = new OtelConfigBuilder()
        const yaml = builder.build()

        let filePath = req?.savePath
        if (!filePath) {
          const result = await dialog.showSaveDialog({
            defaultPath: join(app.getPath('downloads'), 'otel-collector.yaml'),
            filters: [{ name: 'YAML', extensions: ['yaml', 'yml'] }]
          })
          if (result.canceled || !result.filePath) {
            return { success: false, error: 'Save cancelled' }
          }
          filePath = result.filePath
        }

        writeFileSync(filePath, yaml, 'utf-8')
        return { success: true, filePath, yaml }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )
}
