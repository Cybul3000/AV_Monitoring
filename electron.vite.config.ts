import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'

function copyMigrationsPlugin() {
  return {
    name: 'copy-migrations',
    closeBundle() {
      const src = resolve('src/main/db/migrations')
      const dest = resolve('dist-electron/main/migrations')
      mkdirSync(dest, { recursive: true })
      for (const file of readdirSync(src)) {
        copyFileSync(join(src, file), join(dest, file))
      }
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyMigrationsPlugin()],
    build: {
      outDir: 'dist-electron/main',
      lib: {
        entry: resolve('src/main/index.ts')
      }
    },
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist-electron/preload',
      lib: {
        entry: resolve('src/main/preload.ts')
      }
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    build: {
      outDir: 'dist-electron/renderer',
      rollupOptions: {
        input: resolve('src/renderer/index.html')
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()]
  }
})
