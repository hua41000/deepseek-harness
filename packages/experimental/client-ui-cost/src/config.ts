/** Price configuration shared by the Host entry and the browser cost View. */
import z from '@deepseek-ai/schemastery'
import type { ModelPrices, PriceTable, UnitPrices } from './client/cost-contract.ts'

/** Global name under which the Host entry embeds the validated configuration in browser pages. */
export const CONFIG_GLOBAL = '__DSH_UI_COST_CONFIG__'

/** Plugin configuration of the cost View. */
export interface Config {
  /**
   * Unit prices in yuan per million tokens, keyed by the model id recorded in
   * `request/header`. An entry replaces the built-in prices of that model as a
   * whole; models absent from both are shown as unpriced.
   */
  prices: PriceTable
}

/** One unit price: yuan per million tokens, zero allowed; the range rejects negative numbers and infinities. */
const price = z.number().min(0).max(Number.MAX_VALUE).required()

const unitPrices: z<UnitPrices> = z.object({
  cacheHit: price,
  cacheMiss: price,
  output: price,
})

const modelPrices: z<ModelPrices> = z.object({
  peak: unitPrices.required(),
  offPeak: unitPrices.required(),
})

const PERIODS = ['peak', 'offPeak'] as const
const PRICE_FIELDS = ['cacheHit', 'cacheMiss', 'output'] as const

/**
 * NaN passes every range check, and a transform callback receives no field path,
 * so the whole table is checked once and the path is named here.
 */
function rejectNaN(table: PriceTable): PriceTable {
  for (const [model, prices] of Object.entries(table)) {
    for (const period of PERIODS) {
      for (const field of PRICE_FIELDS) {
        if (Number.isNaN(prices[period][field])) {
          throw new z.ValidationError('expected a finite number but got NaN', { path: ['prices', model, period, field] })
        }
      }
    }
  }
  return table
}

/** Validated configuration; an invalid or incomplete price fails the plugin at load. */
export const Config: z<Partial<Config>, Config> = z.object({
  prices: z.transform(z.dict(modelPrices), rejectNaN).default({}),
})
