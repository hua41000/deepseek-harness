/** Host configuration validates price overrides and embeds them in browser pages. */
import { Context } from '@deepseek-ai/cordis'
import type { IndexInjection, WebServer } from '@deepseek-ai/dsh-host-webserver'
import { describe, expect, it, onTestFinished } from 'vitest'
import { CONFIG_GLOBAL, Config } from '../src/config.ts'
import * as host from '../src/index.ts'

/** The Peer an index render speaks for; this listener reads no field of it. */
const PAGE_PEER = { principal: { kind: 'owner' } } as Parameters<WebServer['renderIndex']>[1]

const VALID = { cacheHit: 0.04, cacheMiss: 2, output: 16 }

/** Raw YAML-like input; values outside the declared types reach the schema unchecked. */
function input(prices: object): Partial<Config> {
  return { prices } as Partial<Config>
}

/** A `prices` override of deepseek-flash whose peak prices are replaced by `peak`. */
function flash(peak: object): Partial<Config> {
  return input({ 'deepseek-flash': { peak, offPeak: VALID } })
}

describe('price configuration', () => {
  it('defaults to no override', () => {
    expect(Config({})).toEqual({ prices: {} })
  })

  it('accepts complete prices unchanged, including zero', () => {
    const prices = { 'deepseek-flash': { peak: { ...VALID, cacheHit: 0 }, offPeak: VALID }, 'custom-model': { peak: VALID, offPeak: VALID } }
    expect(Config({ prices })).toEqual({ prices })
  })

  it.each([
    ['a negative price', { ...VALID, output: -1 }, 'expected number >= 0'],
    ['NaN', { ...VALID, output: Number.NaN }, 'expected a finite number'],
    ['Infinity', { ...VALID, output: Number.POSITIVE_INFINITY }, 'expected number <='],
    ['a string', { ...VALID, output: 'abc' }, 'expected number'],
    ['a numeric string', { ...VALID, output: '16' }, 'expected number'],
    ['a missing price', { cacheHit: 0.04, cacheMiss: 2 }, 'missing required value'],
  ])('rejects %s and names the field', (_label, peak, reason) => {
    expect(() => Config(flash(peak))).toThrow(`$.prices.deepseek-flash.peak.output ${reason}`)
  })

  it('rejects a model entry without both periods', () => {
    expect(() => Config(input({ 'deepseek-flash': { peak: VALID } })))
      .toThrow('$.prices.deepseek-flash.offPeak missing required value')
  })
})

describe('host entry', () => {
  it('exposes the shared configuration schema', () => {
    expect(host.Config).toBe(Config)
  })

  it('embeds the validated prices in browser pages and withdraws them on disposal', async () => {
    const ctx = new Context()
    onTestFinished(async () => { await ctx.fiber.dispose() })
    const config = Config(flash(VALID))
    const fiber = ctx.plugin(host, config)
    await fiber.await()
    const rows: IndexInjection[] = []
    ctx.emit('webserver/index-inject', rows, PAGE_PEER)
    expect(rows).toEqual([{ kind: 'global', name: CONFIG_GLOBAL, value: config }])
    await fiber.dispose()
    const after: IndexInjection[] = []
    ctx.emit('webserver/index-inject', after, PAGE_PEER)
    expect(after).toEqual([])
  })

  it('fails to load with an invalid price and embeds nothing', async () => {
    const ctx = new Context()
    onTestFinished(async () => { await ctx.fiber.dispose() })
    const fiber = ctx.plugin(host, flash({ ...VALID, output: -1 }))
    await expect(fiber.await()).rejects.toThrow('$.prices.deepseek-flash.peak.output')
    const rows: IndexInjection[] = []
    ctx.emit('webserver/index-inject', rows, PAGE_PEER)
    expect(rows).toEqual([])
  })
})
