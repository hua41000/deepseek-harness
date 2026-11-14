/** Browser plugin contributing the conversation cost View. */

import { CONFIG_GLOBAL, Config } from '../config.ts'
import type { PriceTable } from './cost-contract.ts'
import { resolvePrices } from './cost-pricing.ts'

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

/** Reads the embedded price configuration before any registration, so a missing one fails the plugin without a tab. */
export function apply(): void {
  injectedPrices((globalThis as { [CONFIG_GLOBAL]?: Partial<Config> })[CONFIG_GLOBAL])
}
