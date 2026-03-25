import { useState, useEffect } from 'react'
import type { SSHSessionState } from '@shared/ipc-types'

export function useSSHSession(deviceId: string) {
  const [sessionState, setSessionState] = useState<SSHSessionState>('CLOSED')
  const [output, setOutput] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unsubState = window.api.onSshState((payload) => {
      if (payload.deviceId !== deviceId) return
      setSessionState(payload.state)
      if (payload.state === 'ERROR') setError(payload.reason ?? 'Connection error')
      else setError(null)
    })
    const unsubOutput = window.api.onSshOutput((payload) => {
      if (payload.deviceId !== deviceId) return
      setOutput(prev => prev + payload.data)
    })
    return () => {
      unsubState()
      unsubOutput()
    }
  }, [deviceId])

  const openSession = async () => {
    setOutput('')
    setError(null)
    await window.api.sshOpen(deviceId)
  }

  const closeSession = async () => {
    await window.api.sshClose(deviceId)
  }

  const sendCommand = async (command: string) => {
    await window.api.sshSend({ deviceId, command })
  }

  return { sessionState, output, error, openSession, closeSession, sendCommand }
}
