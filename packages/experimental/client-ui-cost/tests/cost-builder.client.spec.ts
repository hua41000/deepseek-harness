import { describe, expect, it } from 'vitest'
import type { ConversationTimelineSnapshot } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { EMPTY_COST_SNAPSHOT, attributeModels, costViewDefinition } from '../src/client/cost-builder.ts'
import type { RequestHeaderReason } from '@deepseek-ai/dsh-session/types'
import type { CostStep } from '../src/client/cost-contract.ts'
import { TARGET, type CostViewNode } from '../src/client/cost-definition.ts'

const TIMELINE: ConversationTimelineSnapshot = { turnOrder: [], turns: new Map() }

function step(messageSeq: number, turn = 1): CostViewNode {
  const data: CostStep = { turn, step: messageSeq, startTime: 0, messageSeq, miss: 1, hit: 0, write: 0, output: 1 }
  return { key: `step:${messageSeq}`, kind: 'cost-step', id: `${turn}:${messageSeq}`, target: TARGET, data: { kind: 'step', step: data } }
}

function route(seq: number, model: string, reason: RequestHeaderReason = 'change'): CostViewNode {
  return { key: `route:${seq}`, kind: 'cost-route', id: `${seq}`, target: TARGET, data: { kind: 'route', seq, model, reason } }
}

function models(nodes: CostViewNode[]): (string | null)[] {
  return attributeModels(nodes).steps.map(attributed => attributed.model)
}

describe('model attribution', () => {
  it('leaves every step unknown when the window has no header', () => {
    expect(attributeModels([step(2), step(5)])).toMatchObject({ windowHasHeader: false, steps: [{ model: null }, { model: null }] })
  })

  it('attributes every step to a header at the start of the window', () => {
    expect(models([route(1, 'deepseek-flash'), step(2), step(5)])).toEqual(['deepseek-flash', 'deepseek-flash'])
  })

  it('leaves steps before the first header unknown and attributes later ones', () => {
    const snapshot = attributeModels([step(2), route(4, 'deepseek-flash'), step(5)])
    expect(snapshot.windowHasHeader).toBe(true)
    expect(snapshot.steps.map(attributed => attributed.model)).toEqual([null, 'deepseek-flash'])
  })

  it('attributes steps before a leading series header to its model', () => {
    expect(models([step(2), route(4, 'deepseek-flash', 'series'), step(5)])).toEqual(['deepseek-flash', 'deepseek-flash'])
  })

  it.each(['resume', 'change'] as const)('leaves steps before a leading %s header unknown', (reason) => {
    expect(models([step(2), route(4, 'deepseek-flash', reason), step(5)])).toEqual([null, 'deepseek-flash'])
  })

  it('switches models at each later header', () => {
    expect(models([route(1, 'deepseek-flash'), step(2), route(3, 'deepseek-v4-pro'), step(4), step(6), route(7, 'deepseek-flash'), step(8)]))
      .toEqual(['deepseek-flash', 'deepseek-v4-pro', 'deepseek-v4-pro', 'deepseek-flash'])
  })

  it('orders steps by message sequence regardless of node order', () => {
    const snapshot = attributeModels([step(8, 2), route(3, 'deepseek-v4-pro'), step(2, 1), route(1, 'deepseek-flash'), step(4, 1)])
    expect(snapshot.steps.map(attributed => [attributed.messageSeq, attributed.model]))
      .toEqual([[2, 'deepseek-flash'], [4, 'deepseek-v4-pro'], [8, 'deepseek-v4-pro']])
  })
})

describe('cost snapshot builder', () => {
  it('starts from the empty snapshot', () => {
    expect(costViewDefinition.target).toBe(TARGET)
    expect(costViewDefinition.create().empty).toBe(EMPTY_COST_SNAPSHOT)
  })

  it('applies live upserts on top of a replaced window', () => {
    const builder = costViewDefinition.create()
    builder.replace({ nodes: [route(1, 'deepseek-flash'), step(2)], timeline: TIMELINE })
    const next = builder.apply({ upserts: [step(4)], timeline: TIMELINE })
    expect(next.steps.map(attributed => [attributed.messageSeq, attributed.model])).toEqual([[2, 'deepseek-flash'], [4, 'deepseek-flash']])
  })

  it('resolves earlier unknown steps once an older page adds their header', () => {
    const builder = costViewDefinition.create()
    expect(builder.replace({ nodes: [step(5)], timeline: TIMELINE }).windowHasHeader).toBe(false)
    const paged = builder.replace({ nodes: [route(1, 'deepseek-v4-pro'), step(2), step(5)], timeline: TIMELINE })
    expect(paged.steps.map(attributed => attributed.model)).toEqual(['deepseek-v4-pro', 'deepseek-v4-pro'])
  })

  it('replaces an updated node by key and drops nodes missing from a replacement', () => {
    const builder = costViewDefinition.create()
    builder.replace({ nodes: [step(2), step(4)], timeline: TIMELINE })
    expect(builder.apply({ upserts: [step(2)], timeline: TIMELINE }).steps).toHaveLength(2)
    expect(builder.replace({ nodes: [step(4)], timeline: TIMELINE }).steps).toHaveLength(1)
  })

  it('keeps the snapshot identity when nothing changed', () => {
    const builder = costViewDefinition.create()
    const current = builder.replace({ nodes: [step(2)], timeline: TIMELINE })
    expect(builder.apply({ upserts: [], timeline: TIMELINE })).toBe(current)
  })
})
