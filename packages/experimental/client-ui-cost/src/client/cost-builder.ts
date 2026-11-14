/** View target builder attributing each priced step to the model it ran on. */

import type { Context } from '@deepseek-ai/cordis'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import type { ConversationViewBuilder, ConversationViewDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { AttributedCostStep, CostSnapshot, CostStep } from './cost-contract.ts'
import { TARGET, type CostViewNode } from './cost-definition.ts'

/** Stable snapshot used before a Session published any cost node. */
export const EMPTY_COST_SNAPSHOT: CostSnapshot = { steps: [], windowHasHeader: false }

/**
 * Attribute each step to the model of the latest `request/header` before its
 * `assistant/message`. A header precedes the message of its own step, so the
 * two sequence numbers are never equal. The result depends only on the node
 * set, not on the order in which paging or live updates delivered it.
 * @param nodes - current cost target nodes.
 * @returns steps ordered by message sequence, with a null model when no earlier header is loaded.
 */
export function attributeModels(nodes: Iterable<CostViewNode>): CostSnapshot {
  const routes: { seq: number; model: string }[] = []
  const steps: CostStep[] = []
  for (const node of nodes) {
    switch (node.data.kind) {
      case 'route':
        routes.push(node.data)
        break
      case 'step':
        steps.push(node.data.step)
        break
      /* v8 ignore next 2 -- closed node union; TypeScript rejects other kinds. */
      default:
        assertNever(node.data)
    }
  }
  routes.sort((a, b) => a.seq - b.seq)
  steps.sort((a, b) => a.messageSeq - b.messageSeq)
  // Both lists ascend by seq, so one cursor walks the routes once.
  let model: string | null = null
  let next = 0
  const attributed = steps.map((step): AttributedCostStep => {
    for (let route = routes[next]; route !== undefined && route.seq < step.messageSeq; route = routes[++next]) model = route.model
    return { ...step, model }
  })
  return { steps: attributed, windowHasHeader: routes.length > 0 }
}

/** Per-Session builder keeping the target's current nodes by key. */
class CostSnapshotBuilder implements ConversationViewBuilder<CostViewNode, CostSnapshot> {
  private readonly nodes = new Map<string, CostViewNode>()
  private current = EMPTY_COST_SNAPSHOT
  readonly empty = EMPTY_COST_SNAPSHOT

  replace({ nodes }: { readonly nodes: readonly CostViewNode[] }): CostSnapshot {
    this.nodes.clear()
    return this.merge(nodes)
  }

  apply({ upserts }: { readonly upserts: readonly CostViewNode[] }): CostSnapshot {
    return upserts.length === 0 ? this.current : this.merge(upserts)
  }

  private merge(nodes: readonly CostViewNode[]): CostSnapshot {
    for (const node of nodes) this.nodes.set(node.key, node)
    this.current = attributeModels(this.nodes.values())
    return this.current
  }
}

/** The `cost` view target both Definitions publish into. */
export const costViewDefinition: ConversationViewDefinition<CostViewNode, CostSnapshot> = {
  target: TARGET,
  create: () => new CostSnapshotBuilder(),
}

/**
 * Register the view target. The registration rides the caller's fiber effect,
 * so unloading the plugin removes the target with it.
 * @param ctx - client root context.
 */
export function registerCostView(ctx: Context): void {
  ctx.uiConversation.views.register(costViewDefinition)
}
