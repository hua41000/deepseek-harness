/** Step pricing, price periods, and Session cost totals. */

import type { CostSnapshot, CostStep, CostSummary, PricePeriod, PriceTable, WindowFallback } from './cost-contract.ts'

/**
 * DeepSeek list prices in yuan per million tokens. This is business data, not a
 * deployment tunable: deployments replace entries through the `prices` config.
 */
export const BUILTIN_PRICES: PriceTable = {
  'deepseek-flash': {
    peak: { cacheHit: 0.04, cacheMiss: 2, output: 8 },
    offPeak: { cacheHit: 0.02, cacheMiss: 1, output: 4 },
  },
  'deepseek-v4-pro': {
    peak: { cacheHit: 0.3, cacheMiss: 9, output: 27 },
    offPeak: { cacheHit: 0.15, cacheMiss: 4.5, output: 13.5 },
  },
}

/** DeepSeek defines its price periods in Beijing time (UTC+8, no daylight saving time). */
const BEIJING_OFFSET_MS = 8 * 3_600_000

/** Peak periods as half-open minute-of-day ranges: [09:00, 12:00) and [14:00, 18:00). */
const PEAK_MINUTES: readonly (readonly [number, number])[] = [[9 * 60, 12 * 60], [14 * 60, 18 * 60]]

const PER_MILLION = 1_000_000

/**
 * Price period of a moment, independent of the runtime time zone. Public holidays are not recognized.
 * @param epochMs - epoch milliseconds.
 * @returns `peak` on Monday to Friday within the peak ranges in Beijing time, otherwise `offPeak`.
 */
export function pricePeriod(epochMs: number): PricePeriod {
  const beijing = new Date(epochMs + BEIJING_OFFSET_MS)
  const day = beijing.getUTCDay()
  if (day === 0 || day === 6) return 'offPeak'
  const minute = beijing.getUTCHours() * 60 + beijing.getUTCMinutes()
  return PEAK_MINUTES.some(([from, to]) => minute >= from && minute < to) ? 'peak' : 'offPeak'
}

/**
 * Merge configured prices over the built-in table; a configured model replaces the whole built-in entry.
 * @param configured - validated `prices` config.
 * @returns the effective price table.
 */
export function resolvePrices(configured: PriceTable): PriceTable {
  return { ...BUILTIN_PRICES, ...configured }
}

/**
 * Cost and cache savings of one step.
 * @param step - step usage and start time.
 * @param model - model id, or null when unknown.
 * @param table - effective price table.
 * @returns yuan amounts, or null when the model is unknown or has no price.
 */
export function priceStep(step: CostStep, model: string | null, table: PriceTable): { cost: number; savings: number } | null {
  // hasOwn keeps prototype keys such as 'toString' from matching a model id.
  const prices = model !== null && Object.hasOwn(table, model) ? table[model] : undefined
  if (prices === undefined) return null
  const unit = prices[pricePeriod(step.startTime)]
  const input = step.miss * unit.cacheMiss + step.hit * unit.cacheHit + step.write * unit.cacheMiss
  return {
    cost: (input + step.output * unit.output) / PER_MILLION,
    savings: step.hit * (unit.cacheMiss - unit.cacheHit) / PER_MILLION,
  }
}

interface TurnAccumulator {
  input: number
  output: number
  cost: number
  priced: number
  unpriced: number
}

/**
 * Track the model of the steps a window holds while it contains no `request/header`.
 * The first model seen is kept: the last used model changes only through a new
 * header, so a change while the window shows none belongs to a header that has
 * not reached the window yet. Older header-free pages extend the covered range;
 * once a header is loaded the fallback no longer changes.
 * @param previous - fallback recorded for the same Session, or null.
 * @param snapshot - attributed steps of the loaded window.
 * @param lastUsed - the Session's last used model, or null before it is known.
 * @returns the fallback to price unattributed steps with, or null when none is known.
 */
export function rememberWindowModel(
  previous: WindowFallback | null,
  snapshot: CostSnapshot,
  lastUsed: string | null,
): WindowFallback | null {
  const first = snapshot.steps[0]
  if (snapshot.windowHasHeader || first === undefined) return previous
  if (previous === null) return lastUsed === null ? null : { model: lastUsed, fromSeq: first.messageSeq }
  return first.messageSeq < previous.fromSeq ? { model: previous.model, fromSeq: first.messageSeq } : previous
}

/**
 * Price every step of a snapshot and total the results per turn and per Session.
 * @param snapshot - attributed steps of the loaded window.
 * @param table - effective price table.
 * @param fallback - model for steps without an attributed model, applied from its `fromSeq` on; null when none is known.
 * @returns totals, model list, step counts, and turn rows.
 */
export function priceSummary(snapshot: CostSnapshot, table: PriceTable, fallback: WindowFallback | null): CostSummary {
  const turns = new Map<number, TurnAccumulator>()
  const models = new Set<string>()
  let total = 0
  let savings = 0
  let pricedSteps = 0
  let unpricedSteps = 0
  for (const step of snapshot.steps) {
    const model = step.model ?? (fallback !== null && step.messageSeq >= fallback.fromSeq ? fallback.model : null)
    if (model !== null) models.add(model)
    let row = turns.get(step.turn)
    if (row === undefined) {
      row = { input: 0, output: 0, cost: 0, priced: 0, unpriced: 0 }
      turns.set(step.turn, row)
    }
    row.input += step.miss + step.hit + step.write
    row.output += step.output
    const priced = priceStep(step, model, table)
    if (priced === null) {
      row.unpriced++
      unpricedSteps++
      continue
    }
    row.cost += priced.cost
    row.priced++
    total += priced.cost
    savings += priced.savings
    pricedSteps++
  }
  return {
    total,
    savings,
    models: [...models],
    pricedSteps,
    unpricedSteps,
    turns: [...turns].sort(([a], [b]) => a - b).map(([turn, row]) => ({
      turn,
      input: row.input,
      output: row.output,
      cost: row.priced === 0 ? null : row.cost,
      partial: row.priced > 0 && row.unpriced > 0,
      unpricedSteps: row.unpriced,
    })),
  }
}
