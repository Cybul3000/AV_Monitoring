// DanteSettingsForm.tsx — Device settings form: sample rate, encoding, latency, device rename
import React, { useState, useEffect } from 'react'
import type { DanteDeviceSnapshot } from '@shared/ipc-types'

const SAMPLE_RATES = [44100, 48000, 88200, 96000, 176400, 192000] as const
const ENCODINGS    = [16, 24, 32] as const

interface Props {
  device: DanteDeviceSnapshot
  onSettingsSet?: (opts: { sampleRate?: number; encoding?: number; latencyNs?: number }) => Promise<void>
  onRenameDevice?: (newName: string) => Promise<void>
  onRenameChannel?: (direction: 'tx' | 'rx', channelNum: number, newName: string) => Promise<void>
}

export function DanteSettingsForm({ device, onSettingsSet, onRenameDevice }: Props): React.ReactElement {
  const [sampleRate, setSampleRate] = useState<number>(device.sampleRate ?? 48000)
  const [encoding, setEncoding] = useState<number>(device.encoding ?? 24)
  const [latencyMs, setLatencyMs] = useState<string>(
    device.latencyNs ? String(device.latencyNs / 1_000_000) : ''
  )
  const [deviceName, setDeviceName] = useState<string>(device.danteName)
  const [saving, setSaving] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Sync with device prop updates
  useEffect(() => {
    setSampleRate(device.sampleRate ?? 48000)
    setEncoding(device.encoding ?? 24)
    setLatencyMs(device.latencyNs ? String(device.latencyNs / 1_000_000) : '')
    setDeviceName(device.danteName)
  }, [device.id])

  const handleSaveSettings = async () => {
    setError(null)
    setSuccess(null)
    setSaving(true)
    try {
      const latencyNs = latencyMs ? Math.round(parseFloat(latencyMs) * 1_000_000) : undefined
      await onSettingsSet?.({
        sampleRate,
        encoding,
        latencyNs: latencyNs && !isNaN(latencyNs) ? latencyNs : undefined,
      })
      setSuccess('Settings saved')
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleRenameDevice = async () => {
    setError(null)
    setSuccess(null)
    setRenaming(true)
    try {
      await onRenameDevice?.(deviceName)
      setSuccess(deviceName ? `Renamed to "${deviceName}"` : 'Reset to factory name')
    } catch (err) {
      setError(String(err))
    } finally {
      setRenaming(false)
    }
  }

  const hasActiveSubscriptions = device.rxChannels.some(
    ch => ch.subscription && ch.subscription.status === 'connected'
  )

  return (
    <div className="dante-settings-form">
      <h4>Device Settings</h4>

      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      {hasActiveSubscriptions && (
        <div className="warning-banner">
          Warning: changing sample rate will disrupt active subscriptions.
        </div>
      )}

      <div className="form-group">
        <label htmlFor="sampleRate">Sample Rate</label>
        <select
          id="sampleRate"
          value={sampleRate}
          onChange={e => setSampleRate(Number(e.target.value))}
        >
          {SAMPLE_RATES.map(r => (
            <option key={r} value={r}>
              {r >= 1000 ? `${r / 1000} kHz` : `${r} Hz`}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label>Encoding</label>
        <div className="radio-group">
          {ENCODINGS.map(enc => (
            <label key={enc} className="radio-label">
              <input
                type="radio"
                name="encoding"
                value={enc}
                checked={encoding === enc}
                onChange={() => setEncoding(enc)}
              />
              {enc}-bit
            </label>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="latencyMs">Latency (ms)</label>
        <input
          id="latencyMs"
          type="number"
          min="0"
          step="0.1"
          value={latencyMs}
          onChange={e => setLatencyMs(e.target.value)}
          placeholder="e.g. 1.0"
        />
      </div>

      <button
        className="btn-primary"
        onClick={() => void handleSaveSettings()}
        disabled={saving}
      >
        {saving ? 'Saving…' : 'Save Settings'}
      </button>

      <hr />

      <h4>Rename Device</h4>
      <div className="form-group">
        <label htmlFor="deviceName">Dante Name</label>
        <input
          id="deviceName"
          type="text"
          value={deviceName}
          onChange={e => setDeviceName(e.target.value)}
          placeholder="Leave empty to reset to factory name"
        />
      </div>
      <div className="button-group">
        <button
          className="btn-primary"
          onClick={() => void handleRenameDevice()}
          disabled={renaming}
        >
          {renaming ? 'Renaming…' : 'Rename'}
        </button>
        <button
          className="btn-secondary"
          onClick={() => {
            setDeviceName('')
            void handleRenameDevice()
          }}
          disabled={renaming}
        >
          Reset to Factory Name
        </button>
      </div>
    </div>
  )
}
