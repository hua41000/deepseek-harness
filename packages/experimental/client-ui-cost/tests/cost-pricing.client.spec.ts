import { afterEach, describe, expect, it } from 'vitest'
import type { AttributedCostStep, CostSnapshot, PriceTable } from '../src/client/cost-contract.ts'
import { BUILTIN_PRICES, priceStep, priceSummary, pricePeriod, resolvePrices } from '../src/client/cost-pricing.ts'

/** Epoch milliseconds of a Beijing wall-clock time (UTC+8). */
function beijing(month: number, day: number, hour: number, minute = 0, second = 0): number {
  return Date.UTC(2026, month - 1, day, hour - 8, minute, second)
}

// 2026-11-11 is a Wednesday; 2026-11-14 is a Saturday.
const WED_10 = beijing(11, 11, 10)
const WED_11_59_59 = beijing(11, 11, 11, 59, 59)
const WED_12 = beijing(11, 11, 12)
const WED_08_59_59 = beijing(11, 11, 8, 59, 59)
const SAT_10 = beijing(11, 14, 10)

/** The AC-02 step: 10,000 missed, 90,000 hit, no writes, 1,000 output tokens. */
function step(overrides: Partial<AttributedCostStep> = {}): AttributedCostStep {
  return { turn: 1, step: 1, startTime: WED_10, messageSeq: 1, miss: 10_000, hit: 90_000, write: 0, output: 1_000, model: 'deepseek-flash', ...overrides }
}

function snapshot(steps: AttributedCostStep[], windowHasHeader = true): CostSnapshot {
  return { steps, windowHasHeader }
}

describe('price period', () => {
  const zone = process.env.TZ
  afterEach(() => {
    if (zone === undefined) delete process.env.TZ
    else process.env.TZ = zone
  })

  it.each([
    ['Wednesday 10:00', WED_10, 'peak'],
    ['Wednesday 11:59:59', WED_11_59_59, 'peak'],
    ['Wednesday 12:00:00', WED_12, 'offPeak'],
    ['Wednesday 08:59:59', WED_08_59_59, 'offPeak'],
    ['Wednesday 09:00', beijing(11, 11, 9), 'peak'],
    ['Wednesday 14:00', beijing(11, 11, 14), 'peak'],
    ['Wednesday 17:59:59', beijing(11, 11, 17, 59, 59), 'peak'],
    ['Wednesday 18:00', beijing(11, 11, 18), 'offPeak'],
    ['Saturday 10:00', SAT_10, 'offPeak'],
    ['Sunday 10:00', beijing(11, 15, 10), 'offPeak'],
    ['Monday 00:30, still Sunday in UTC', beijing(11, 16, 0, 30), 'offPeak'],
  ])('classifies Beijing %s', (_label, at, period) => {
    expect(pricePeriod(at)).toBe(period)
  })

  it('ignores the runtime time zone', () => {
    process.env.TZ = 'America/Los_Angeles'
    expect(pricePeriod(WED_10)).toBe('peak')
    expect(pricePeriod(WED_12)).toBe('offPeak')
    expect(pricePeriod(SAT_10)).toBe('offPeak')
  })
})

describe('step price', () => {
  it('prices a peak step at peak rates', () => {
    expect(priceStep(step(), 'deepseek-flash', BUILTIN_PRICES)!.cost).toBeCloseTo(0.0316, 10)
  })

  it.each([WED_12, WED_08_59_59, SAT_10])('prices off-peak and weekend steps at off-peak rates (%i)', (startTime) => {
    expect(priceStep(step({ startTime }), 'deepseek-flash', BUILTIN_PRICES)!.cost).toBeCloseTo(0.0158, 10)
  })

  it('prices the last peak second at peak rates', () => {
    expect(priceStep(step({ startTime: WED_11_59_59 }), 'deepseek-flash', BUILTIN_PRICES)!.cost).toBeCloseTo(0.0316, 10)
  })

  it('computes cache savings from the miss and hit rate difference', () => {
    expect(priceStep(step(), 'deepseek-flash', BUILTIN_PRICES)!.savings).toBeCloseTo(0.1764, 10)
  })

  it('prices cache writes at the cache-miss rate', () => {
    const written = priceStep(step({ miss: 0, hit: 0, output: 0, write: 1_000_000 }), 'deepseek-flash', BUILTIN_PRICES)
    expect(written).toEqual({ cost: 2, savings: 0 })
  })

  it('returns null for an unknown model, an unpriced model, and prototype keys', () => {
    expect(priceStep(step(), null, BUILTIN_PRICES)).toBeNull()
    expect(priceStep(step(), 'other-model', BUILTIN_PRICES)).toBeNull()
    expect(priceStep(step(), 'toString', BUILTIN_PRICES)).toBeNull()
  })
})

describe('price resolution', () => {
  const configured: PriceTable = {
    'deepseek-flash': { peak: { cacheHit: 0.04, cacheMiss: 2, output: 16 }, offPeak: { cacheHit: 0.02, cacheMiss: 1, output: 4 } },
    'custom-model': { peak: { cacheHit: 0, cacheMiss: 1, output: 1 }, offPeak: { cacheHit: 0, cacheMiss: 1, output: 1 } },
  }

  it('replaces a built-in model entry with the configured one', () => {
    const table = resolvePrices(configured)
    expect(priceStep(step(), 'deepseek-flash', table)!.cost).toBeCloseTo(0.0396, 10)
    expect(table['deepseek-v4-pro']).toBe(BUILTIN_PRICES['deepseek-v4-pro'])
  })

  it('prices a configured model missing from the built-in table', () => {
    expect(priceStep(step(), 'custom-model', resolvePrices(configured))!.cost).toBeCloseTo(0.011, 10)
  })

  it('keeps the built-in table without configuration', () => {
    expect(resolvePrices({})).toEqual(BUILTIN_PRICES)
  })
})

describe('session summary', () => {
  it('prices each model at its own rates and lists both models', () => {
    const summary = priceSummary(snapshot([
      step(),
      step({ turn: 2, messageSeq: 2, model: 'deepseek-v4-pro' }),
    ]), BUILTIN_PRICES, null)
    const pro = (10_000 * 9 + 90_000 * 0.3 + 1_000 * 27) / 1_000_000
    expect(summary.total).toBeCloseTo(0.0316 + pro, 10)
    expect(summary.models).toEqual(['deepseek-flash', 'deepseek-v4-pro'])
    expect(summary.turns.map(row => row.cost)).toEqual([expect.closeTo(0.0316, 10), expect.closeTo(pro, 10)])
  })

  it('orders turn rows by turn and makes them sum to the total', () => {
    const summary = priceSummary(snapshot([
      step({ turn: 3, messageSeq: 1 }),
      step({ turn: 1, messageSeq: 2 }),
      step({ turn: 1, step: 2, messageSeq: 3, startTime: SAT_10 }),
    ]), BUILTIN_PRICES, null)
    expect(summary.turns.map(row => row.turn)).toEqual([1, 3])
    expect(summary.turns[0]).toMatchObject({ input: 200_000, output: 2_000, partial: false })
    expect(summary.turns.reduce((sum, row) => sum + row.cost!, 0)).toBeCloseTo(summary.total, 12)
    expect(summary.pricedSteps).toBe(3)
  })

  it('excludes unpriced steps from amounts and marks partly priced turns', () => {
    const summary = priceSummary(snapshot([
      step(),
      step({ step: 2, messageSeq: 2, model: 'other-model' }),
      step({ turn: 2, messageSeq: 3, model: 'other-model' }),
    ]), BUILTIN_PRICES, null)
    expect(summary.total).toBeCloseTo(0.0316, 10)
    expect(summary.savings).toBeCloseTo(0.1764, 10)
    expect(summary.unpricedSteps).toBe(2)
    expect(summary.pricedSteps).toBe(1)
    expect(summary.turns[0]).toMatchObject({ turn: 1, input: 200_000, output: 2_000, partial: true })
    expect(summary.turns[0]!.cost).toBeCloseTo(0.0316, 10)
    expect(summary.turns[1]).toEqual({ turn: 2, input: 100_000, output: 1_000, cost: null, partial: false })
  })

  it('keeps the model list when every step is unpriced', () => {
    const summary = priceSummary(snapshot([step({ model: 'other-model' })]), BUILTIN_PRICES, null)
    expect(summary).toMatchObject({ total: 0, pricedSteps: 0, unpricedSteps: 1, models: ['other-model'] })
  })

  it('uses the last used model only when the window has no request header', () => {
    const unknown = [step({ model: null })]
    expect(priceSummary(snapshot(unknown, false), BUILTIN_PRICES, 'deepseek-flash')).toMatchObject({ pricedSteps: 1, models: ['deepseek-flash'] })
    expect(priceSummary(snapshot(unknown, true), BUILTIN_PRICES, 'deepseek-flash'))
      .toMatchObject({ pricedSteps: 0, unpricedSteps: 1, models: [] })
    expect(priceSummary(snapshot(unknown, false), BUILTIN_PRICES, null)).toMatchObject({ pricedSteps: 0, unpricedSteps: 1 })
  })

  it('returns empty totals for an empty snapshot', () => {
    expect(priceSummary(snapshot([], false), BUILTIN_PRICES, null))
      .toEqual({ total: 0, savings: 0, models: [], pricedSteps: 0, unpricedSteps: 0, turns: [] })
  })
})
