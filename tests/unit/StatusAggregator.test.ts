import { describe, it, expect } from 'vitest'
import {
  aggregateStatus,
  computeRoomStatus,
  computeFloorStatus,
  computeOfficeStatus,
  computeRegionStatus
} from '../../src/main/services/StatusAggregator'
import type { LEDStatus } from '../../src/main/services/StatusAggregator'

describe('aggregateStatus', () => {
  it('returns GREY for empty list', () => {
    expect(aggregateStatus([])).toBe('GREY')
  })

  it('RED wins over all others', () => {
    const statuses: LEDStatus[] = ['GREEN', 'RED', 'AMBER']
    expect(aggregateStatus(statuses)).toBe('RED')
  })

  it('AMBER wins over GREEN and GREY', () => {
    expect(aggregateStatus(['GREEN', 'AMBER', 'GREY'])).toBe('AMBER')
  })

  it('GREEN when all are GREEN', () => {
    expect(aggregateStatus(['GREEN', 'GREEN'])).toBe('GREEN')
  })

  it('GREY when all are GREY', () => {
    expect(aggregateStatus(['GREY', 'GREY'])).toBe('GREY')
  })

  it('RED beats AMBER', () => {
    expect(aggregateStatus(['AMBER', 'RED'])).toBe('RED')
  })

  it('single GREEN returns GREEN', () => {
    expect(aggregateStatus(['GREEN'])).toBe('GREEN')
  })

  it('single RED returns RED', () => {
    expect(aggregateStatus(['RED'])).toBe('RED')
  })

  it('GREEN and GREY returns GREEN', () => {
    expect(aggregateStatus(['GREEN', 'GREY'])).toBe('GREEN')
  })
})

describe('computeRoomStatus', () => {
  it('returns GREY when no devices', () => {
    expect(computeRoomStatus([])).toBe('GREY')
  })

  it('aggregates device statuses', () => {
    expect(computeRoomStatus(['GREEN', 'AMBER'])).toBe('AMBER')
  })

  it('RED device makes room RED', () => {
    expect(computeRoomStatus(['GREEN', 'RED', 'GREY'])).toBe('RED')
  })
})

describe('computeFloorStatus', () => {
  it('returns GREY when no rooms', () => {
    expect(computeFloorStatus([])).toBe('GREY')
  })

  it('aggregates room statuses', () => {
    expect(computeFloorStatus(['GREEN', 'RED'])).toBe('RED')
  })
})

describe('computeOfficeStatus', () => {
  it('returns GREY when no floors', () => {
    expect(computeOfficeStatus([])).toBe('GREY')
  })

  it('aggregates floor statuses', () => {
    expect(computeOfficeStatus(['AMBER', 'GREEN'])).toBe('AMBER')
  })
})

describe('computeRegionStatus', () => {
  it('returns GREY when no offices', () => {
    expect(computeRegionStatus([])).toBe('GREY')
  })

  it('aggregates office statuses', () => {
    expect(computeRegionStatus(['GREEN', 'GREEN'])).toBe('GREEN')
  })

  it('single RED office makes region RED', () => {
    expect(computeRegionStatus(['GREEN', 'RED', 'AMBER'])).toBe('RED')
  })
})
