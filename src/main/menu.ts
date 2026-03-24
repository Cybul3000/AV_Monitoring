import { Menu, BrowserWindow, shell, app } from 'electron'

export function buildMenu(win: BrowserWindow): Menu {
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    // File
    {
      label: 'File',
      submenu: [
        isMac ? { role: 'close' as const } : { role: 'quit' as const }
      ]
    },
    // Edit
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const }
      ]
    },
    // View
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        {
          label: 'Toggle Developer Tools',
          accelerator: isMac ? 'Cmd+Option+I' : 'Ctrl+Shift+I',
          click: () => win.webContents.toggleDevTools()
        },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const }
      ]
    },
    // Help
    {
      role: 'help',
      submenu: [
        {
          label: 'About AV Monitoring',
          click: () => shell.openExternal('https://github.com/your-org/av-monitoring')
        }
      ]
    }
  ]

  return Menu.buildFromTemplate(template)
}
