import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LightwareModule } from '../../../src/main/modules/lightware/LightwareModule'
import { LightwareLW3Transport } from '../../../src/main/modules/lightware/LightwareLW3Transport'

// Mock the transport module
vi.mock('../../../src/main/modules/lightware/LightwareLW3Transport')

const MockTransport = vi.mocked(LightwareLW3Transport)

// Helper to build a mock transport instance with controllable behavior
function buildMockTransport(overrides?: Partial<{
  connectFn: () => Promise<void>
  sendFn: (cmd: string) => Promise<{ ok: boolean; value: string; rawLines: string[] }>
  destroyFn: () => void
}>) {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {}

  const mockInstance = {
    connect: vi.fn(overrides?.connectFn ?? (() => Promise.resolve())),
    destroy: vi.fn(overrides?.destroyFn ?? (() => undefined)),
    send: vi.fn(overrides?.sendFn ?? ((_cmd: string) => Promise.resolve({ ok: true, value: '', rawLines: [] }))),
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(listener)
      return mockInstance
    }),
    emit: vi.fn((event: string, ...args: unknown[]) => {
      for (const listener of listeners[event] ?? []) {
        listener(...args)
      }
    }),
    _listeners: listeners,
  }

  return mockInstance
}

// Build a mock transport with a working connect sequence that provides identity + ports
function buildConnectedMockTransport() {
  const mockInstance = buildMockTransport()

  // Default send: return ok=true with empty response unless specifically mocked
  mockInstance.send.mockImplementation((cmd: string) => {
    if (cmd === 'GET /.ProductName') {
      return Promise.resolve({ ok: true, value: 'UCX-4x2-HC30', rawLines: ['pw /.ProductName=UCX-4x2-HC30'] })
    }
    if (cmd === 'GET /.FirmwareVersion') {
      return Promise.resolve({ ok: true, value: '2.7.3', rawLines: ['pw /.FirmwareVersion=2.7.3'] })
    }
    if (cmd === 'GET /.SerialNumber') {
      return Promise.resolve({ ok: true, value: 'SN123456', rawLines: ['pw /.SerialNumber=SN123456'] })
    }
    if (cmd === 'GETALL /MEDIA/VIDEO') {
      return Promise.resolve({
        ok: true,
        value: '',
        rawLines: [
          'pw /MEDIA/VIDEO.SignalPresent_I1=true',
          'pw /MEDIA/VIDEO.PortName_I1=HDMI 1',
          'pw /MEDIA/VIDEO.SignalPresent_I2=true',
          'pw /MEDIA/VIDEO.PortName_I2=HDMI 2',
          'pw /MEDIA/VIDEO.SignalPresent_O1=true',
          'pw /MEDIA/VIDEO.PortName_O1=Display',
        ],
      })
    }
    if (cmd.includes('DestinationConnectionList')) {
      return Promise.resolve({ ok: true, value: 'I1:O1', rawLines: ['pw /MEDIA/VIDEO/XP.DestinationConnectionList=I1:O1'] })
    }
    // Presets, OPEN, SYS queries
    return Promise.resolve({ ok: true, value: '', rawLines: [] })
  })

  return mockInstance
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('LightwareModule', () => {
  let module: LightwareModule
  let mockTransportInstance: ReturnType<typeof buildConnectedMockTransport>

  beforeEach(() => {
    vi.clearAllMocks()
    module = new LightwareModule()
    mockTransportInstance = buildConnectedMockTransport()
    MockTransport.mockImplementation(() => mockTransportInstance as unknown as LightwareLW3Transport)
  })

  // ── getStatusPoints ──────────────────────────────────────────────────────

  it('getStatusPoints() returns expected status points', () => {
    const points = module.getStatusPoints()
    expect(points).toHaveLength(3)

    const ids = points.map(p => p.id)
    expect(ids).toContain('reachable')
    expect(ids).toContain('signal_locked')
    expect(ids).toContain('hardware_fault')

    const reachable = points.find(p => p.id === 'reachable')!
    expect(reachable.defaultAlertable).toBe(true)
    expect(reachable.label).toBe('Device Reachable')

    const signalLocked = points.find(p => p.id === 'signal_locked')!
    expect(signalLocked.defaultAlertable).toBe(true)

    const hwFault = points.find(p => p.id === 'hardware_fault')!
    expect(hwFault.defaultAlertable).toBe(true)
  })

  // ── connect / disconnect lifecycle ───────────────────────────────────────

  it('connect() calls transport.connect with correct host and port', async () => {
    await module.connect('device-1', { host: '192.168.1.100', port: 6107 })

    expect(mockTransportInstance.connect).toHaveBeenCalledWith('192.168.1.100', 6107)
  })

  it('connect() uses default port 6107 when not specified', async () => {
    await module.connect('device-1', { host: '10.0.0.1' })

    expect(mockTransportInstance.connect).toHaveBeenCalledWith('10.0.0.1', 6107)
  })

  it('disconnect() calls transport.destroy', async () => {
    await module.connect('device-1', { host: '192.168.1.100', port: 6107 })
    await module.disconnect('device-1')

    expect(mockTransportInstance.destroy).toHaveBeenCalled()
  })

  // ── LED aggregation ──────────────────────────────────────────────────────

  it('returns GREY status when device has never connected', async () => {
    // Connect but simulate that 'connected' event is never fired
    // (transport.connect resolves but no 'connected' event = no sequence run)
    await module.connect('device-grey', { host: '192.168.1.1', port: 6107 })

    const status = await module.ping('device-grey')
    // State: connected=false (transport.connect resolves but 'connected' listener
    // is what sets state.connected = true and triggers sequence)
    // Since we never emitted 'connected', productName is still null → GREY
    expect(status.status).toBe('GREY')
  })

  it('returns RED status when device disconnects after being connected', async () => {
    await module.connect('device-red', { host: '192.168.1.1', port: 6107 })

    // Simulate connected event to mark device as having been connected
    // We need to trigger the 'connected' handler and wait for the sequence
    const connectedListeners = mockTransportInstance._listeners['connected'] ?? []
    for (const l of connectedListeners) l()

    // Wait for async connect sequence
    await new Promise(resolve => setTimeout(resolve, 10))

    // Now simulate disconnect
    const disconnectedListeners = mockTransportInstance._listeners['disconnected'] ?? []
    for (const l of disconnectedListeners) l()

    const status = await module.ping('device-red')
    expect(status.status).toBe('RED')
  })

  it('returns GREEN when all input ports signal locked, no faults', async () => {
    await module.connect('device-green', { host: '192.168.1.1', port: 6107 })

    // Trigger connected event to run the sequence (which populates state with locked ports)
    const connectedListeners = mockTransportInstance._listeners['connected'] ?? []
    for (const l of connectedListeners) l()

    // Wait for async connect sequence to complete
    await new Promise(resolve => setTimeout(resolve, 20))

    const status = await module.ping('device-green')
    // All input ports (I1, I2) have signalLocked=true, no faults
    expect(status.status).toBe('GREEN')
  })

  it('returns AMBER when one input port has signalLocked=false', async () => {
    // Override GETALL to return an unlocked input port
    mockTransportInstance.send.mockImplementation((cmd: string) => {
      if (cmd === 'GET /.ProductName') {
        return Promise.resolve({ ok: true, value: 'UCX-4x2-HC30', rawLines: [] })
      }
      if (cmd === 'GETALL /MEDIA/VIDEO') {
        return Promise.resolve({
          ok: true,
          value: '',
          rawLines: [
            'pw /MEDIA/VIDEO.SignalPresent_I1=true',
            'pw /MEDIA/VIDEO.SignalPresent_I2=false',  // unlocked
            'pw /MEDIA/VIDEO.PortName_I1=HDMI 1',
            'pw /MEDIA/VIDEO.PortName_I2=HDMI 2',
          ],
        })
      }
      return Promise.resolve({ ok: true, value: '', rawLines: [] })
    })

    await module.connect('device-amber', { host: '192.168.1.1', port: 6107 })

    const connectedListeners = mockTransportInstance._listeners['connected'] ?? []
    for (const l of connectedListeners) l()
    await new Promise(resolve => setTimeout(resolve, 20))

    const status = await module.ping('device-amber')
    expect(status.status).toBe('AMBER')
  })

  // ── sendCommand: switch ──────────────────────────────────────────────────

  it('sendCommand switch sends correct LW3 CALL for MMX device family', async () => {
    // MMX: productName does NOT contain 'MX2'
    mockTransportInstance.send.mockImplementation((cmd: string) => {
      if (cmd === 'GET /.ProductName') {
        return Promise.resolve({ ok: true, value: 'MMX4x2-HD20', rawLines: [] })
      }
      return Promise.resolve({ ok: true, value: 'done', rawLines: ['pm /MEDIA/VIDEO/XP:switch=done'] })
    })

    await module.connect('device-mmx', { host: '192.168.1.1', port: 6107 })

    const connectedListeners = mockTransportInstance._listeners['connected'] ?? []
    for (const l of connectedListeners) l()
    await new Promise(resolve => setTimeout(resolve, 20))

    // Reset send mock to capture the switch command
    const switchMock = vi.fn().mockResolvedValue({ ok: true, value: 'done', rawLines: [] })
    mockTransportInstance.send.mockImplementation(switchMock)

    const result = await module.sendCommand('device-mmx', 'switch', { input: 'I2', output: 'O1' })

    expect(result.success).toBe(true)
    expect(switchMock).toHaveBeenCalledWith('CALL /MEDIA/VIDEO/XP:switch(I2:O1)')
  })

  it('sendCommand switch uses MX2 path when deviceFamily is MX2', async () => {
    mockTransportInstance.send.mockImplementation((cmd: string) => {
      if (cmd === 'GET /.ProductName') {
        return Promise.resolve({ ok: true, value: 'UCX-4x2-MX2', rawLines: [] })
      }
      return Promise.resolve({ ok: true, value: 'done', rawLines: [] })
    })

    await module.connect('device-mx2', { host: '192.168.1.1', port: 6107 })

    const connectedListeners = mockTransportInstance._listeners['connected'] ?? []
    for (const l of connectedListeners) l()
    await new Promise(resolve => setTimeout(resolve, 20))

    const switchMock = vi.fn().mockResolvedValue({ ok: true, value: 'done', rawLines: [] })
    mockTransportInstance.send.mockImplementation(switchMock)

    const result = await module.sendCommand('device-mx2', 'switch', { input: 'I1', output: 'O2' })

    expect(result.success).toBe(true)
    expect(switchMock).toHaveBeenCalledWith('CALL /MEDIA/XP/VIDEO:switch(I1:O2)')
  })

  // ── sendCommand: recallPreset ─────────────────────────────────────────────

  it('sendCommand recallPreset sends correct MX2 CALL command', async () => {
    mockTransportInstance.send.mockImplementation((cmd: string) => {
      if (cmd === 'GET /.ProductName') {
        return Promise.resolve({ ok: true, value: 'UCX-4x2-MX2', rawLines: [] })
      }
      return Promise.resolve({ ok: true, value: 'done', rawLines: [] })
    })

    await module.connect('device-preset', { host: '192.168.1.1', port: 6107 })

    const connectedListeners = mockTransportInstance._listeners['connected'] ?? []
    for (const l of connectedListeners) l()
    await new Promise(resolve => setTimeout(resolve, 20))

    const presetMock = vi.fn().mockResolvedValue({ ok: true, value: 'done', rawLines: [] })
    mockTransportInstance.send.mockImplementation(presetMock)

    const result = await module.sendCommand('device-preset', 'recallPreset', { name: 'Pres Mode' })

    expect(result.success).toBe(true)
    expect(presetMock).toHaveBeenCalledWith('CALL /MEDIA/PRESET/Pres Mode:load()')
  })

  // ── NACK error handling ──────────────────────────────────────────────────

  it('NACK error response (nE) from transport does not crash the module', async () => {
    mockTransportInstance.send.mockImplementation((cmd: string) => {
      if (cmd === 'GET /.ProductName') {
        return Promise.resolve({ ok: true, value: 'UCX-4x2-HC30', rawLines: [] })
      }
      // Simulate NACK for a switch command
      if (cmd.startsWith('CALL')) {
        return Promise.resolve({
          ok: false,
          value: 'nE /MEDIA/VIDEO/XP',
          rawLines: ['nE /MEDIA/VIDEO/XP'],
        })
      }
      return Promise.resolve({ ok: true, value: '', rawLines: [] })
    })

    await module.connect('device-nack', { host: '192.168.1.1', port: 6107 })

    const connectedListeners = mockTransportInstance._listeners['connected'] ?? []
    for (const l of connectedListeners) l()
    await new Promise(resolve => setTimeout(resolve, 20))

    // Should not throw
    const result = await module.sendCommand('device-nack', 'switch', { input: 'I1', output: 'O1' })

    expect(result.success).toBe(false)
    expect(result.error).toContain('nE')
  })
})
