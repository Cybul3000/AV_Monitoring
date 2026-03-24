import { getZoomAppCredentials } from '../platform/credentials'

interface TokenCache {
  accessToken: string
  expiresAt: number
}

let _cache: TokenCache | null = null
let _sessionClientSecret: string | null = null

/** Set the client secret for this session (never persisted to disk). */
export function setSessionClientSecret(secret: string): void {
  _sessionClientSecret = secret
  _cache = null // invalidate token cache when secret changes
}

/** Returns true if a session client secret has been provided. */
export function hasSessionClientSecret(): boolean {
  return _sessionClientSecret !== null && _sessionClientSecret.length > 0
}

export async function getAccessToken(): Promise<string> {
  const now = Date.now()

  if (_cache && _cache.expiresAt > now + 30_000) {
    return _cache.accessToken
  }

  const saved = await getZoomAppCredentials()
  if (!saved) {
    throw new Error('Zoom Account ID and Client ID not configured — set them in Settings first')
  }
  if (!_sessionClientSecret) {
    throw new Error('Zoom Client Secret not set — enter it in Settings each session')
  }

  const { clientId, accountId } = saved
  const basicToken = Buffer.from(`${clientId}:${_sessionClientSecret}`).toString('base64')
  const url = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicToken}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Zoom OAuth token request failed (${response.status}): ${body}`)
  }

  const data = (await response.json()) as { access_token: string; expires_in: number }
  _cache = { accessToken: data.access_token, expiresAt: now + data.expires_in * 1000 }
  return _cache.accessToken
}

export function clearCache(): void {
  _cache = null
}
