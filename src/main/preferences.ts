import ElectronStore from 'electron-store'

export interface PreferencesSchema {
  'pref:tooltipsEnabled': boolean
  'pref:pollIntervalDefault': number
  'pref:pythonPath': string
  'pref:logRetentionDays': number
  'pref:otelNewRelicKey': string
  'pref:zoomFactor': number
  'pref:lastHierarchyPath': string
  'pref:windowBounds': { x: number; y: number; width: number; height: number } | null
  'pref:consecutiveFailuresBeforeRed': number
}

const store = new ElectronStore<PreferencesSchema>({
  name: 'preferences',
  defaults: {
    'pref:tooltipsEnabled': true,
    'pref:pollIntervalDefault': 30000,
    'pref:pythonPath': 'python3',
    'pref:logRetentionDays': 30,
    'pref:otelNewRelicKey': '',
    'pref:zoomFactor': 1.0,
    'pref:lastHierarchyPath': '/',
    'pref:windowBounds': null,
    'pref:consecutiveFailuresBeforeRed': 3
  }
})

export function getPreference<K extends keyof PreferencesSchema>(key: K): PreferencesSchema[K] {
  return store.get(key)
}

export function setPreference<K extends keyof PreferencesSchema>(
  key: K,
  value: PreferencesSchema[K]
): void {
  store.set(key, value)
}

export function getAllPreferences(): PreferencesSchema {
  return store.store
}

export { store as preferencesStore }
