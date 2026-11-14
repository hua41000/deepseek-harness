/** The browser entry adopts only a price configuration the Host entry embedded. */
import { describe, expect, it } from 'vitest'
import { CONFIG_GLOBAL } from '../src/config.ts'
import { injectedPrices } from '../src/client/index.ts'
import { BUILTIN_PRICES } from '../src/client/cost-pricing.ts'

const FLASH = { peak: { cacheHit: 0.04, cacheMiss: 2, output: 16 }, offPeak: { cacheHit: 0.02, cacheMiss: 1, output: 4 } }
describe('embedded prices', () => {
  it('merges the embedded override over the built-in prices', () => {
    const prices = injectedPrices({ prices: { 'deepseek-flash': FLASH } })
    expect(prices['deepseek-flash']).toEqual(FLASH)
    expect(prices['deepseek-v4-pro']).toBe(BUILTIN_PRICES['deepseek-v4-pro'])
  })

  it('uses the built-in prices when the embedded configuration has no override', () => {
    expect(injectedPrices({ prices: {} })).toEqual(BUILTIN_PRICES)
  })

  it('validates the embedded value again and names the invalid field', () => {
    const invalid = { prices: { 'deepseek-flash': { ...FLASH, offPeak: { ...FLASH.offPeak, cacheMiss: -2 } } } }
    expect(() => injectedPrices(invalid)).toThrow('$.prices.deepseek-flash.offPeak.cacheMiss')
  })

  it('fails instead of falling back to the built-in prices when nothing was embedded', () => {
    expect(() => injectedPrices(undefined)).toThrow(`client-ui-cost: the page carries no ${CONFIG_GLOBAL}`)
  })
})
