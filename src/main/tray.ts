import { Tray, Menu, BrowserWindow, nativeImage, app } from 'electron'
import { join } from 'path'

let _tray: Tray | null = null

export function createTray(win: BrowserWindow): void {
  // Use a plain icon; production builds would supply a proper 16/32px icon
  const iconPath = join(__dirname, '../../resources/tray-icon.png')
  const icon = nativeImage.createFromPath(iconPath).isEmpty()
    ? nativeImage.createEmpty()
    : nativeImage.createFromPath(iconPath)

  _tray = new Tray(icon)
  _tray.setToolTip('AV Monitoring')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show AV Monitoring',
      click: () => {
        win.show()
        win.focus()
      }
    },
    {
      label: 'Hide',
      click: () => win.hide()
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit()
      }
    }
  ])

  _tray.setContextMenu(contextMenu)

  _tray.on('double-click', () => {
    win.show()
    win.focus()
  })
}

export function destroyTray(): void {
  if (_tray) {
    _tray.destroy()
    _tray = null
  }
}
