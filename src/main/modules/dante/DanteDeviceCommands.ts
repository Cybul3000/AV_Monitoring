export {
  OP,
  RESULT_OK,
  RESULT_MORE_PAGES,
  buildGetChannelCount,
  buildGetDeviceName,
  buildGetDeviceInfo,
  buildGetSettings,
  buildSetSettings,
  buildSetDeviceName,
  buildListTxChannels,
  buildListTxChannelNames,
  buildListRxChannels,
  buildAddSubscription,
  buildRemoveSubscription,
  buildSettingsPacket,
  parseMacAddress,
  parseDeviceName,
  parseChannelCount,
  parseSettings,
  parseSubscriptionStatus,
  parseArcResponse,
} from './DantePacket'

// TX pages: 32 channels per page; RX pages: 16 channels per page
export const TX_PAGE_SIZE = 32
export const RX_PAGE_SIZE = 16

// AVIO gain command bytes (Settings port 8700)
export const AVIO_GAIN_INPUT_CMD  = 0x01
export const AVIO_GAIN_OUTPUT_CMD = 0x02

export const INPUT_GAIN_VALUES  = ['+24 dBu', '+4 dBu', '0 dBu', '0 dBV', '-10 dBV'] as const
export const OUTPUT_GAIN_VALUES = ['+18 dBu', '+4 dBu', '0 dBu', '0 dBV', '-10 dBV'] as const

export type InputGainLevel  = typeof INPUT_GAIN_VALUES[number]
export type OutputGainLevel = typeof OUTPUT_GAIN_VALUES[number]
export type GainLevel = InputGainLevel | OutputGainLevel

import { buildSettingsPacket } from './DantePacket'

export function buildSetGain(
  mac: Buffer,
  direction: 'tx' | 'rx',
  channelNum: number,
  gainIndex: number
): Buffer {
  // direction 'rx' = input (AVIO_GAIN_INPUT_CMD), 'tx' = output
  const cmdByte = direction === 'rx' ? AVIO_GAIN_INPUT_CMD : AVIO_GAIN_OUTPUT_CMD
  const cmdBytes = Buffer.from([cmdByte, channelNum & 0xff, gainIndex & 0xff])
  return buildSettingsPacket(mac, cmdBytes)
}
