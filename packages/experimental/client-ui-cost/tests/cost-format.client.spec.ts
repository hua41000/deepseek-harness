import { describe, expect, it } from 'vitest'
import { formatTokens, formatYuan } from '../src/client/cost-format.ts'

describe('yuan amounts', () => {
  it.each([
    [12.3456, '¥12.35'],
    [0.03164, '¥0.0316'],
    [0.00004, '<¥0.0001'],
    [0.99995, '¥1.00'],
    [0.99994, '¥0.9999'],
    [1, '¥1.00'],
    [0.00005, '¥0.0001'],
    [0, '¥0.0000'],
  ])('formats %d as %s', (value, text) => {
    expect(formatYuan(value)).toBe(text)
  })
})

describe('token counts', () => {
  it.each([
    [520, '0.52K'],
    [5_200, '5.2K'],
    [9_999_999, '10000.0K'],
    [10_000_000, '10.0M'],
    [0, '0.00K'],
  ])('formats %i as %s', (value, text) => {
    expect(formatTokens(value)).toBe(text)
  })
})
