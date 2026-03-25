// DanteSubscriptionTable.tsx — RX channel routing table with subscription status badges
import React, { useState } from 'react'
import type { DanteDeviceSnapshot } from '@shared/ipc-types'

interface Props {
  device: DanteDeviceSnapshot
  onSubscribe?: (rxChannelNum: number, txDeviceName: string, txChannelName: string) => Promise<void>
  onUnsubscribe?: (rxChannelNum: number) => Promise<void>
  availableDevices?: DanteDeviceSnapshot[]
}

type StatusBadgeVariant = 'connected' | 'unresolved' | 'self-loop' | 'unsubscribed'

function statusBadgeClass(status: StatusBadgeVariant): string {
  switch (status) {
    case 'connected':    return 'badge-green'
    case 'unresolved':   return 'badge-amber'
    case 'self-loop':    return 'badge-amber'
    case 'unsubscribed': return 'badge-grey'
    default:             return 'badge-grey'
  }
}

export function DanteSubscriptionTable({ device, onSubscribe, onUnsubscribe, availableDevices = [] }: Props): React.ReactElement {
  const [addingToChannel, setAddingToChannel] = useState<number | null>(null)
  const [txDeviceName, setTxDeviceName] = useState('')
  const [txChannelName, setTxChannelName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubscribe = async (rxChannelNum: number) => {
    if (!txDeviceName || !txChannelName) return
    setError(null)
    try {
      await onSubscribe?.(rxChannelNum, txDeviceName, txChannelName)
      setAddingToChannel(null)
      setTxDeviceName('')
      setTxChannelName('')
    } catch (err) {
      setError(String(err))
    }
  }

  const handleUnsubscribe = async (rxChannelNum: number) => {
    setError(null)
    try {
      await onUnsubscribe?.(rxChannelNum)
    } catch (err) {
      setError(String(err))
    }
  }

  if (device.rxChannels.length === 0) {
    return (
      <div className="dante-subscription-table-empty">
        No RX channels configured
      </div>
    )
  }

  return (
    <div className="dante-subscription-table">
      <h4>RX Channel Subscriptions</h4>
      {error && <div className="error-banner">{error}</div>}
      <table>
        <thead>
          <tr>
            <th>RX Channel</th>
            <th>TX Device</th>
            <th>TX Channel</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {device.rxChannels.map(ch => {
            const sub = ch.subscription
            const isSubscribed = sub && sub.status !== 'unsubscribed'

            return (
              <tr key={ch.channelNumber}>
                <td>{ch.channelName}</td>
                <td>{sub?.txDeviceName ?? '—'}</td>
                <td>{sub?.txChannelName ?? '—'}</td>
                <td>
                  <span className={`badge ${statusBadgeClass(sub?.status ?? 'unsubscribed')}`}>
                    {sub?.status ?? 'unsubscribed'}
                  </span>
                </td>
                <td>
                  {isSubscribed ? (
                    <button
                      className="btn-remove"
                      onClick={() => void handleUnsubscribe(ch.channelNumber)}
                    >
                      Remove
                    </button>
                  ) : addingToChannel === ch.channelNumber ? (
                    <div className="add-subscription-form">
                      <select
                        value={txDeviceName}
                        onChange={e => setTxDeviceName(e.target.value)}
                      >
                        <option value="">Select TX device…</option>
                        {availableDevices.map(d => (
                          <option key={d.id} value={d.danteName}>{d.danteName}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="TX channel name"
                        value={txChannelName}
                        onChange={e => setTxChannelName(e.target.value)}
                      />
                      <button
                        className="btn-confirm"
                        disabled={!txDeviceName || !txChannelName}
                        onClick={() => void handleSubscribe(ch.channelNumber)}
                      >
                        Add
                      </button>
                      <button
                        className="btn-cancel"
                        onClick={() => {
                          setAddingToChannel(null)
                          setTxDeviceName('')
                          setTxChannelName('')
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn-add"
                      onClick={() => setAddingToChannel(ch.channelNumber)}
                    >
                      Add Subscription
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
