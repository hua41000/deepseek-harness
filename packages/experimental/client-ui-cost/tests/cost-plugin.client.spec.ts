/** The browser plugin registers the cost tab and assembles priced steps from real Session windows. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionEventLikeEntry } from '@deepseek-ai/dsh-api-session-controller/client'
import { ConversationNodeAssembler } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ConversationNodeDefinition, ConversationViewDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import { SessionSeq, type RequestHeaderReason, type SessionEvent, type SessionId } from '@deepseek-ai/dsh-session/types'
import { CONFIG_GLOBAL, type Config } from '../src/config.ts'
import { EMPTY_COST_SNAPSHOT, costViewDefinition } from '../src/client/cost-builder.ts'
import type { CostSnapshot } from '../src/client/cost-contract.ts'
import { TARGET } from '../src/client/cost-definition.ts'
import { BUILTIN_PRICES, priceSummary, rememberWindowModel } from '../src/client/cost-pricing.ts'
import { CostView, type CostViewInjected } from '../src/client/CostView.tsx'
import { apply, inject } from '../src/client/index.ts'
import { de, en, es, fr, ja, NS, pt, ru, zh } from '../src/client/locales.ts'

const SID = 'cost-session' as SessionId
const page = globalThis as { [CONFIG_GLOBAL]?: Partial<Config> }
const FLASH = { peak: { cacheHit: 0, cacheMiss: 1, output: 1 }, offPeak: { cacheHit: 0, cacheMiss: 1, output: 1 } }

afterEach(() => {
  Reflect.deleteProperty(page, CONFIG_GLOBAL)
})

/** Mount the browser plugin on a real Cordis context with recorded service stubs. */
async function mount() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const events: ConversationNodeDefinition[] = []
  const views: ConversationViewDefinition[] = []
  const localeDispose = vi.fn()
  const localeRegister = vi.fn(() => localeDispose)
  let snapshot: CostSnapshot | undefined
  const unsubscribe = vi.fn()
  const subscribe = vi.fn(() => unsubscribe)
  const loadOlder = vi.fn(async () => undefined)
  ctx.provide('sessions', { binding: (id: SessionId) => (id === SID ? { session: { loadOlder } } : undefined) } as never)
  ctx.provide('locale', { register: localeRegister, bind: () => makeTranslate(zh) } as never)
  ctx.provide('uiConversation', {
    binding: () => ({ target: () => ({ getSnapshot: () => snapshot, subscribe }) }),
    events: { register: (definition: ConversationNodeDefinition) => { events.push(definition); return () => undefined } },
    views: { register: (definition: ConversationViewDefinition) => { views.push(definition); return () => undefined } },
  } as never)
  ctx.slots.register({ name: 'root', children: { 'conversation.view': { kind: 'list', scope: 'session' } } } as never, () => null)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  return {
    fiber, events, views, localeRegister, localeDispose, loadOlder, subscribe, unsubscribe,
    entries: () => ctx.slots.entries('conversation.view'),
    injectFor: (sessionId: SessionId) => {
      const injectEntry = ctx.slots.entries('conversation.view')[0]!.inject as ((id: SessionId) => CostViewInjected) | undefined
      return injectEntry!(sessionId)
    },
    setSnapshot: (next: CostSnapshot) => { snapshot = next },
  }
}

describe('browser plugin registration', () => {
  it('registers the cost tab, dictionaries, Definitions, and view target, and removes the tab on unload', async () => {
    page[CONFIG_GLOBAL] = { prices: {} }
    const bench = await mount()
    await bench.fiber.await()
    expect(inject).toEqual(['slots', 'sessions', 'uiConversation', 'locale'])
    expect(bench.localeRegister).toHaveBeenCalledWith(NS, { zh, en, ja, de, es, fr, pt, ru })
    expect(bench.events.map(definition => definition.kind)).toEqual(['cost-step', 'cost-route'])
    expect(bench.views).toEqual([costViewDefinition])
    const entry = bench.entries()[0]!
    expect(entry.component).toBe(CostView)
    expect(entry.options).toMatchObject({ id: 'cost', order: 45 })
    expect(entry.locale).toBe(NS)
    expect(resolveSlotLabel(entry.options.label)).toBe('花费')
    await bench.fiber.dispose()
    expect(bench.entries()).toEqual([])
    expect(bench.localeDispose).toHaveBeenCalledTimes(1)
  })

  it('fails to load without the embedded configuration and registers nothing', async () => {
    const bench = await mount()
    await expect(bench.fiber.await()).rejects.toThrow(CONFIG_GLOBAL)
    expect(bench.entries()).toEqual([])
    expect(bench.events).toEqual([])
    expect(bench.localeRegister).not.toHaveBeenCalled()
  })

  it('fails to load with an invalid embedded price and names the field', async () => {
    page[CONFIG_GLOBAL] = { prices: { 'deepseek-flash': { ...FLASH, peak: { ...FLASH.peak, output: -1 } } } }
    const bench = await mount()
    await expect(bench.fiber.await()).rejects.toThrow('$.prices.deepseek-flash.peak.output')
    expect(bench.entries()).toEqual([])
  })

  it('injects the target snapshot, the effective prices, and Session paging', async () => {
    page[CONFIG_GLOBAL] = { prices: { 'deepseek-flash': FLASH } }
    const bench = await mount()
    await bench.fiber.await()
    const injected = bench.injectFor(SID)
    expect(injected.hooks.cost.getSnapshot()).toBe(EMPTY_COST_SNAPSHOT)
    const published: CostSnapshot = { steps: [], windowHasHeader: true }
    bench.setSnapshot(published)
    expect(injected.hooks.cost.getSnapshot()).toBe(published)
    const listener = vi.fn()
    expect(injected.hooks.cost.subscribe(listener)).toBe(bench.unsubscribe)
    expect(bench.subscribe).toHaveBeenCalledWith(listener)
    expect(injected.prices['deepseek-flash']).toEqual(FLASH)
    expect(injected.prices['deepseek-v4-pro']).toBe(BUILTIN_PRICES['deepseek-v4-pro'])
    await injected.loadOlder()
    expect(bench.loadOlder).toHaveBeenCalledTimes(1)
    expect(injected.windowModel).toEqual({ current: null })
  })

  it('rejects a Session the binding registry does not know', async () => {
    page[CONFIG_GLOBAL] = { prices: {} }
    const bench = await mount()
    await bench.fiber.await()
    expect(() => bench.injectFor('other' as SessionId)).toThrow('client-ui-cost: session "other" is unavailable')
  })
})

let seq = 0

/** One durable window entry; payloads are fixtures, so this is where type checking stops. */
function entry(type: string, data: object, time = 0): SessionEventLikeEntry {
  seq += 1
  return { type: 'event', event: { type, seq: SessionSeq(seq), time, data } as SessionEvent }
}

const USAGE: TokenUsage = { inputTokens: 10_000, outputTokens: 1_000, cacheReadTokens: 90_000 }

function header(model: string, reason: RequestHeaderReason = 'change'): SessionEventLikeEntry {
  return entry('request/header', { header: { config: { provider: 'deepseek', model } }, reason })
}

function step(turn: number, start: number): SessionEventLikeEntry[] {
  return [
    entry('step/start', { turn, step: 1 }, start),
    entry('assistant/message', { turn, step: 1, message: { role: 'assistant', content: [] }, stream: [], usage: USAGE }, start + 500),
  ]
}

/** Run the real conversation assembler over the plugin's Definitions and view target. */
function assembler(definitions: readonly ConversationNodeDefinition[]): ConversationNodeAssembler {
  const instance = new ConversationNodeAssembler(
    { entries: () => definitions, fallbackEntry: () => undefined },
    { entries: () => [costViewDefinition] },
  )
  instance.activateTarget(TARGET)
  return instance
}

async function registeredDefinitions(): Promise<readonly ConversationNodeDefinition[]> {
  page[CONFIG_GLOBAL] = { prices: {} }
  const bench = await mount()
  await bench.fiber.await()
  await bench.fiber.dispose()
  return bench.events
}

describe('assembled Session windows', () => {
  it('prices each step on the model of the preceding request header', async () => {
    const engine = assembler(await registeredDefinitions())
    engine.replaceWindow([entry('turn/start', { turn: 1 }), header('deepseek-flash'), ...step(1, 1_000), header('deepseek-v4-pro'), ...step(2, 2_000)], false)
    engine.flush()
    expect(engine.get(TARGET)?.steps.map(({ turn, model, startTime }) => ({ turn, model, startTime }))).toEqual([
      { turn: 1, model: 'deepseek-flash', startTime: 1_000 },
      { turn: 2, model: 'deepseek-v4-pro', startTime: 2_000 },
    ])
  })

  it('adds a live step without rebuilding the window', async () => {
    const engine = assembler(await registeredDefinitions())
    engine.replaceWindow([header('deepseek-flash'), ...step(1, 1_000)], false)
    engine.flush()
    for (const record of step(2, 2_000)) {
      engine.append(record)
      engine.flush()
    }
    expect(engine.get(TARGET)?.steps.map(attributed => [attributed.turn, attributed.model])).toEqual([[1, 'deepseek-flash'], [2, 'deepseek-flash']])
  })

  it('keeps a header-free window priced after a live resume header and prices it from a series header', async () => {
    const engine = assembler(await registeredDefinitions())
    engine.replaceWindow([...step(1, 1_000)], true)
    engine.flush()
    const before = engine.get(TARGET)!
    const fallback = rememberWindowModel(null, before, 'deepseek-flash')
    for (const record of [header('deepseek-flash', 'resume'), ...step(2, 2_000)]) {
      engine.append(record)
      engine.flush()
    }
    const after = engine.get(TARGET)!
    expect(after.windowHasHeader).toBe(true)
    expect(priceSummary(after, BUILTIN_PRICES, rememberWindowModel(fallback, after, 'deepseek-flash'))).toMatchObject({ pricedSteps: 2, unpricedSteps: 0 })
    const series = assembler(await registeredDefinitions())
    series.replaceWindow([...step(1, 1_000), header('deepseek-v4-pro', 'series'), ...step(2, 2_000)], true)
    series.flush()
    expect(series.get(TARGET)?.steps.map(attributed => attributed.model)).toEqual(['deepseek-v4-pro', 'deepseek-v4-pro'])
  })

  it('recovers the start time and model once an older page loads them', async () => {
    const engine = assembler(await registeredDefinitions())
    const older = [header('deepseek-v4-pro'), entry('step/start', { turn: 1, step: 1 }, 1_000)]
    const message = entry('assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [] }, stream: [], usage: USAGE }, 1_500)
    const later = [header('deepseek-flash'), ...step(2, 2_000)]
    engine.replaceWindow([message, ...later], true)
    engine.flush()
    expect(engine.get(TARGET)?.steps.map(({ model, startTime }) => ({ model, startTime }))).toEqual([
      { model: null, startTime: 1_500 },
      { model: 'deepseek-flash', startTime: 2_000 },
    ])
    engine.prepend(older, false)
    engine.flush()
    expect(engine.get(TARGET)?.steps.map(({ model, startTime }) => ({ model, startTime }))).toEqual([
      { model: 'deepseek-v4-pro', startTime: 1_000 },
      { model: 'deepseek-flash', startTime: 2_000 },
    ])
  })
})
