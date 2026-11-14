/**
 * Browser plugin contributing one entry to the conversation view slot: the
 * estimated cost and cache savings of the loaded Session window.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the 'conversation.view' SlotMap row and target registry types.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: ctx.slots on the client root context.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: the standard Session props the slot component receives.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { CONFIG_GLOBAL, Config } from '../config.ts'
import { EMPTY_COST_SNAPSHOT, registerCostView } from './cost-builder.ts'
import type { PriceTable } from './cost-contract.ts'
import { TARGET, registerCostDefinitions } from './cost-definition.ts'
import { resolvePrices } from './cost-pricing.ts'
import { CostView, type CostViewInjected } from './CostView.tsx'
import { de, en, es, fr, ja, NS, pt, ru, zh } from './locales.ts'

export type { CostKey } from './locales.ts'
export type { CostSnapshot } from './cost-contract.ts'
export type { Config } from '../config.ts'

/** Required services: the conversation slot and view registries, Session paging, and the locale service. */
export const inject = ['slots', 'sessions', 'uiConversation', 'locale']

/**
 * Validate the price configuration the Host entry embedded in the page and merge it over the built-in prices.
 * The page global crosses a process boundary, so it is validated again with the Host schema.
 * @param injected - value of the page global, or undefined when the Host entry did not embed one.
 * @returns the effective price table.
 */
export function injectedPrices(injected: Partial<Config> | undefined): PriceTable {
  if (injected === undefined) {
    // The Host entry always embeds a configuration once it loaded. Falling back to the built-in
    // prices here would hide an invalid configuration that failed the Host entry.
    throw new Error(`client-ui-cost: the page carries no ${CONFIG_GLOBAL}; the Host entry is not loaded or its price configuration is invalid`)
  }
  return resolvePrices(Config(injected).prices)
}

/**
 * Client plugin body: validate the embedded prices, then register the
 * dictionaries, the event Definitions, the view target, and the tab. A missing
 * or invalid configuration throws before any registration, so no tab appears.
 * Every registration rides the caller's fiber effect, so unloading the plugin
 * removes the tab with it.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  const prices = injectedPrices((globalThis as { [CONFIG_GLOBAL]?: Partial<Config> })[CONFIG_GLOBAL])
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, de, es, fr, pt, ru }), 'client-ui-cost: dictionaries')
  // The tab label reads through the bound translator as a thunk, so it follows the active locale.
  const t = ctx.locale.bind(NS)
  registerCostDefinitions(ctx)
  registerCostView(ctx)
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'cost',
    order: 45,
    locale: NS,
    label: () => t('view.cost'),
    inject: (sessionId: SessionId): CostViewInjected => {
      const session = ctx.sessions.binding(sessionId)?.session
      if (session === undefined) throw new Error(`client-ui-cost: session "${sessionId}" is unavailable`)
      const target = ctx.uiConversation.binding(sessionId).target(TARGET)
      return {
        hooks: {
          cost: {
            getSnapshot: () => target.getSnapshot() ?? EMPTY_COST_SNAPSHOT,
            subscribe: listener => target.subscribe(listener),
          },
        },
        prices,
        loadOlder: () => session.loadOlder(),
      }
    },
  }, CostView))
}
