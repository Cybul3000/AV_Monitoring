import { join } from 'path'
import { app } from 'electron'
import { readFileSync, existsSync } from 'fs'
import type { DeviceModule } from './_base/DeviceModule'
import { alertRulesService } from '../services/AlertRulesService'
import { ZoomModule } from './zoom/ZoomModule'
import { LGDisplayModule } from './lg-display/LGDisplayModule'
import { CrestronSSHModule } from './crestron-ssh/CrestronSSHModule'
import { LightwareModule } from './lightware/LightwareModule'
import { BiampTesiraModule } from './biamp-tesira/BiampTesiraModule'
import { DanteModule } from './dante/DanteModule'

// Lazily-loaded module instances keyed by device type
const _modules = new Map<string, DeviceModule>()

// Registry of known module class factories keyed by the `module` field in device-registry.json
const _factories = new Map<string, () => DeviceModule>()

interface RegistryEntry {
  type: string
  label: string
  module: string
  protocol: string
  port: number | null
  configFields: Array<{
    key: string
    label: string
    secret: boolean
    enum?: string[]
  }>
}

interface DeviceRegistry {
  version: string
  devices: RegistryEntry[]
}

let _registry: DeviceRegistry | null = null

function getRegistryPath(): string {
  // In production, extraResources copies it to resources/device-registry.json
  // In dev, use the repo resources/ folder
  const prodPath = join(process.resourcesPath, 'device-registry.json')
  const devPath = join(app.getAppPath(), 'resources/device-registry.json')
  if (existsSync(prodPath)) return prodPath
  return devPath
}

export function loadRegistry(): DeviceRegistry {
  if (_registry) return _registry
  const path = getRegistryPath()
  if (!existsSync(path)) {
    throw new Error(`Device registry not found at: ${path}`)
  }
  _registry = JSON.parse(readFileSync(path, 'utf-8')) as DeviceRegistry
  return _registry
}

export function getRegistryEntries(): RegistryEntry[] {
  return loadRegistry().devices
}

export function getRegistryEntry(type: string): RegistryEntry | undefined {
  return loadRegistry().devices.find(d => d.type === type)
}

/**
 * Register a module factory for a given device type.
 * Called at app startup for each implemented module.
 */
export function registerModule(type: string, factory: () => DeviceModule): void {
  _factories.set(type, factory)
}

/**
 * Get (or lazily create) the module for a device type.
 * Returns null if no factory is registered (pending module).
 */
export function getModule(type: string): DeviceModule | null {
  if (_modules.has(type)) return _modules.get(type)!
  const factory = _factories.get(type)
  if (!factory) return null
  const instance = factory()
  _modules.set(type, instance)
  return instance
}

export function isModuleAvailable(type: string): boolean {
  return _factories.has(type)
}

/**
 * Called after a new device is successfully created in the hierarchy.
 * Seeds default alert rules for the given device type.
 */
export function onDeviceCreated(deviceType: string): void {
  try {
    alertRulesService.seedDefaults(deviceType)
  } catch {
    // Non-fatal: alert rules are a best-effort seeding
  }
}

/** Register all implemented modules. Add new modules here as they are developed. */
export function registerAllModules(): void {
  // Zoom module
  registerModule('zoom-room', () => new ZoomModule())

  registerModule('lg-display', () => new LGDisplayModule())
  registerModule('crestron-ssh', () => new CrestronSSHModule())
  registerModule('lightware-matrix', () => new LightwareModule())
  registerModule('biamp-tesira', () => new BiampTesiraModule())
  registerModule('dante-network-audio', () => new DanteModule())
}
