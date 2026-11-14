/**
 * Conversation Definitions producing the cost target's nodes: one node per step
 * that recorded usage, and one node per `request/header` naming the model of the
 * requests that follow it.
 *
 * Every callback reads only the events of its own Context, so one Definition set
 * serves every Session binding, and paging older history in cannot misattribute
 * events.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {
  ConversationNodeContext, ConversationNodeDefinition, ConversationViewNode,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { CostStep } from './cost-contract.ts'

/** View target shared by both Definitions and the snapshot builder. */
export const TARGET = 'cost'

/** Business data of one cost target node. */
export type CostNodeData =
  | { readonly kind: 'step'; readonly step: CostStep }
  | { readonly kind: 'route'; readonly seq: number; readonly model: string }

/** A node published into the cost target. */
export interface CostViewNode extends ConversationViewNode {
  /** Step usage or a model route. */
  readonly data: CostNodeData
}

/** State of a route Context: the header's sequence number and model id. */
interface RouteState {
  readonly seq: number
  readonly model: string
}

/** Wrap node data in the target's envelope. */
function costNode(context: ConversationNodeContext, data: CostNodeData): CostViewNode {
  return { key: context.key, kind: context.kind, id: context.id, target: TARGET, data }
}

/**
 * One step per `step/start`, completed by its `assistant/message`. The State is
 * the step start time. When the start is outside the loaded window the engine
 * creates no State, and the message time stands in for the start time.
 */
export const costStepDefinition: ConversationNodeDefinition<number> = {
  kind: 'cost-step',
  target: TARGET,
  match: (event) => {
    if (event.type !== 'step/start' && event.type !== 'assistant/message') return null
    return { id: `${event.data.turn}:${event.data.step}`, role: event.type === 'step/start' ? 'start' : 'update' }
  },
  start: (_context, match) => match.event.time,
  update: context => context.state,
  publication: match => (match.event.type === 'step/start' ? 'none' : 'immediate'),
  buildViewNode: (context) => {
    let message: Extract<(typeof context.matches)[number]['event'], { type: 'assistant/message' }> | undefined
    for (const match of context.matches) {
      if (match.event.type === 'assistant/message') message = match.event
    }
    const usage = message?.data.usage
    // A step without reported usage (cancelled, failed, or still running) is not priced.
    if (message === undefined || usage === undefined) return null
    return costNode(context, {
      kind: 'step',
      step: {
        turn: message.data.turn,
        step: message.data.step,
        startTime: context.state ?? message.time,
        messageSeq: message.seq,
        miss: usage.inputTokens,
        hit: usage.cacheReadTokens ?? 0,
        write: usage.cacheWriteTokens ?? 0,
        output: usage.outputTokens,
      },
    })
  },
}

/** One route per `request/header`; the header is logged only when the model or header changes. */
export const costRouteDefinition: ConversationNodeDefinition<RouteState> = {
  kind: 'cost-route',
  target: TARGET,
  match: event => (event.type === 'request/header' ? { id: `${event.seq}`, role: 'start' } : null),
  start: (_context, match) => {
    if (match.event.type !== 'request/header') throw new Error('cost-route start requires request/header')
    return { seq: match.event.seq, model: match.event.data.header.config.model }
  },
  update: context => context.state,
  buildViewNode: (context) => {
    const state = context.state
    return state === undefined ? null : costNode(context, { kind: 'route', seq: state.seq, model: state.model })
  },
}

/**
 * Register both Definitions. Each registration rides the caller's fiber effect,
 * so unloading the plugin removes the nodes with it.
 * @param ctx - client root context.
 */
export function registerCostDefinitions(ctx: Context): void {
  ctx.uiConversation.events.register(costStepDefinition)
  ctx.uiConversation.events.register(costRouteDefinition)
}
