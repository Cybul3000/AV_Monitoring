import keytar from 'keytar'

const SERVICE_PREFIX = 'av-monitoring'

/**
 * Build the keytar service name.
 * Format: av-monitoring:<module-type>
 * e.g.  av-monitoring:zoom-room
 */
function service(moduleType: string): string {
  return `${SERVICE_PREFIX}:${moduleType}`
}

/**
 * Account is the device ID, ensuring each device has its own keychain entry.
 */

export async function saveCredential(
  moduleType: string,
  deviceId: string,
  password: string
): Promise<void> {
  await keytar.setPassword(service(moduleType), deviceId, password)
}

export async function getCredential(
  moduleType: string,
  deviceId: string
): Promise<string | null> {
  return keytar.getPassword(service(moduleType), deviceId)
}

export async function deleteCredential(
  moduleType: string,
  deviceId: string
): Promise<boolean> {
  return keytar.deletePassword(service(moduleType), deviceId)
}

/**
 * Convenience: load all credentials for a device as a map.
 * Keys match the `key` field of configFields entries that are `secret: true`.
 */
export async function loadDeviceCredentials(
  moduleType: string,
  deviceId: string,
  secretKeys: string[]
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  for (const key of secretKeys) {
    const accountKey = `${deviceId}:${key}`
    const value = await keytar.getPassword(service(moduleType), accountKey)
    if (value) result[key] = value
  }
  return result
}

export async function saveDeviceCredentials(
  moduleType: string,
  deviceId: string,
  credentials: Record<string, string>
): Promise<void> {
  for (const [key, value] of Object.entries(credentials)) {
    const accountKey = `${deviceId}:${key}`
    await keytar.setPassword(service(moduleType), accountKey, value)
  }
}

export async function deleteDeviceCredentials(
  moduleType: string,
  deviceId: string,
  secretKeys: string[]
): Promise<void> {
  for (const key of secretKeys) {
    const accountKey = `${deviceId}:${key}`
    await keytar.deletePassword(service(moduleType), accountKey)
  }
}
