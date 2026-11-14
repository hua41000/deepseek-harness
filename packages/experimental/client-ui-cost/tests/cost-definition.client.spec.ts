import { describe, expect, it } from 'vitest'
import type { SessionEventLike } from '@deepseek-ai/dsh-api-session-controller/client'
import type {
  ConversationContextReader, ConversationMatch, ConversationNodeContext, ConversationStartMatch,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import type { SessionEventType } from '@deepseek-ai/dsh-session/types'
import {
  TARGET, costRouteDefinition, costStepDefinition,
} from '../src/client/cost-definition.ts'

function event(type: SessionEventType, seq: number, time: number, data: object): SessionEventLike {
  return { type, seq, time, data } as SessionEventLike
}

function stepStart(seq: number, time: number, turn = 1, step = 1): SessionEventLike {
  return event('step/start', seq, time, { turn, step })
}

function message(seq: number, time: number, usage?: TokenUsage, turn = 1, step = 1): SessionEventLike {
  return event('assistant/message', seq, time, { turn, step, usage })
}

function header(seq: number, model: string): SessionEventLike {
  return event('request/header', seq, seq, { header: { config: { provider: 'deepseek', model } }, reason: { kind: 'initial' } })
}

function asMatch(item: SessionEventLike, role: 'start' | 'update'): ConversationMatch {
  return { event: item, role, location: { kind: 'unresolved' } }
}

function context<State>(state: State | undefined, matches: ConversationMatch[]): ConversationNodeContext<State> {
  return {
    key: 'k', kind: 'cost-step', id: '1:1', matches,
    start: matches.find((match): match is ConversationStartMatch => match.role === 'start'),
    state, current: new Map(),
  }
}

type RouteState = ReturnType<typeof costRouteDefinition.start>

const READER: ConversationContextReader = { previous: () => undefined }
const USAGE: TokenUsage = { inputTokens: 10_000, outputTokens: 1_000, cacheReadTokens: 90_000, cacheWriteTokens: 5 }

describe('cost step definition', () => {
  it('starts on step/start and updates on assistant/message of the same step', () => {
    expect(costStepDefinition.match(stepStart(1, 100, 2, 3))).toEqual({ id: '2:3', role: 'start' })
    expect(costStepDefinition.match(message(2, 200, USAGE, 2, 3))).toEqual({ id: '2:3', role: 'update' })
    expect(costStepDefinition.match(event('step/end', 3, 300, { turn: 2, step: 3 }))).toBeNull()
    expect(costStepDefinition.match(header(4, 'deepseek-flash'))).toBeNull()
  })

  it('publishes on the message, not on the start', () => {
    expect(costStepDefinition.publication!(asMatch(stepStart(1, 100), 'start'))).toBe('none')
    expect(costStepDefinition.publication!(asMatch(message(2, 200, USAGE), 'update'))).toBe('immediate')
  })

  it('keeps the start time as State', () => {
    const start = asMatch(stepStart(1, 100), 'start')
    const state = costStepDefinition.start(context<number>(undefined, [start]), start as ConversationStartMatch, READER)
    expect(state).toBe(100)
    expect(costStepDefinition.update({ ...context(state, [start]), state }, asMatch(message(2, 200, USAGE), 'update'))).toBe(100)
  })

  it('builds a step node from the message usage and the start time', () => {
    const node = costStepDefinition.buildViewNode!(context(100, [asMatch(stepStart(1, 100), 'start'), asMatch(message(7, 200, USAGE), 'update')]))
    expect(node).toEqual({
      key: 'k', kind: 'cost-step', id: '1:1', target: TARGET,
      data: { kind: 'step', step: { turn: 1, step: 1, startTime: 100, messageSeq: 7, miss: 10_000, hit: 90_000, write: 5, output: 1_000 } },
    })
  })

  it('falls back to the message time when the step start is outside the window', () => {
    const node = costStepDefinition.buildViewNode!(context<number>(undefined, [asMatch(message(7, 200, USAGE), 'update')]))
    expect(node?.data).toMatchObject({ kind: 'step', step: { startTime: 200 } })
  })

  it('reads missing cache counts as zero', () => {
    const node = costStepDefinition.buildViewNode!(context(100, [asMatch(message(7, 200, { inputTokens: 1, outputTokens: 2 }), 'update')]))
    expect(node?.data).toMatchObject({ kind: 'step', step: { miss: 1, hit: 0, write: 0, output: 2 } })
  })

  it('publishes no node for a step without usage or without a message', () => {
    expect(costStepDefinition.buildViewNode!(context(100, [asMatch(stepStart(1, 100), 'start'), asMatch(message(2, 200), 'update')]))).toBeNull()
    expect(costStepDefinition.buildViewNode!(context(100, [asMatch(stepStart(1, 100), 'start')]))).toBeNull()
  })
})

describe('cost route definition', () => {
  it('starts one route per request header', () => {
    expect(costRouteDefinition.match(header(5, 'deepseek-v4-pro'))).toEqual({ id: '5', role: 'start' })
    expect(costRouteDefinition.match(message(6, 1, USAGE))).toBeNull()
  })

  it('records the header sequence number and model', () => {
    const start = asMatch(header(5, 'deepseek-v4-pro'), 'start') as ConversationStartMatch
    const state = costRouteDefinition.start(context<RouteState>(undefined, [start]), start, READER)
    expect(state).toEqual({ seq: 5, model: 'deepseek-v4-pro' })
    expect(costRouteDefinition.update({ ...context(state, [start]), state }, start)).toBe(state)
    expect(costRouteDefinition.buildViewNode!(context(state, [start]))?.data).toEqual({ kind: 'route', seq: 5, model: 'deepseek-v4-pro' })
  })

  it('rejects a start match of another event type', () => {
    const start = asMatch(message(6, 1, USAGE), 'start') as ConversationStartMatch
    expect(() => costRouteDefinition.start(context<RouteState>(undefined, [start]), start, READER)).toThrow('cost-route start requires request/header')
  })

  it('publishes no node without State', () => {
    expect(costRouteDefinition.buildViewNode!(context<RouteState>(undefined, []))).toBeNull()
  })
})
