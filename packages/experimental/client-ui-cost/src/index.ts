/** Host entry of the cost View: validates the price configuration and embeds it in browser pages. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { CONFIG_GLOBAL, type Config } from './config.ts'

export { Config } from './config.ts'

/**
 * Embed the validated price configuration in every served page. The Loader validates
 * `config` before this runs, so an invalid price fails this plugin at load.
 * @param ctx - Host context serving browser pages.
 * @param config - validated price configuration.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: CONFIG_GLOBAL, value: config })
  })
}
