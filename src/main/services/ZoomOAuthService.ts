import { getZoomAppCredentials } from '../platform/credentials'

interface TokenCache {
  accessToken: string
  expiresAt: number // Unix ms
}

let _cache: TokenCache | null = null

/**
 * Returns a valid Zoom OAuth access token, refreshing via
 * account_credentials grant if the cached token has expired.
 */
export async function getAccessToken(): Promise<string> {
  const now = Date.now()

  if (_cache && _cache.expiresAt > now + 30_000) {
    return _cache.accessToken
  }

  const creds = await getZoomAppCredentials()
  if (!creds) {
    throw new Error('Zoom app credentials not configured — set them in Settings first')
  }

  const { clientId, clientSecret, accountId } = creds
  const basicToken = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

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

  _cache = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000
  }

  return _cache.accessToken
}

/** Clear the in-memory token cache (e.g. after credential change). */
export function clearCache(): void {
  _cache = null
}
