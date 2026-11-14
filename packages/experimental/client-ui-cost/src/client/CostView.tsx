/** Cost View: Session totals, the partial-window notice, and the per-turn cost table. */

import { useMemo, useState, type ReactElement } from 'react'
import type {} from '@deepseek-ai/dsh-agent/types'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { CostSnapshot, CostSummary, CostTurnRow, PriceTable } from './cost-contract.ts'
import { formatTokens, formatYuan } from './cost-format.ts'
import { priceSummary } from './cost-pricing.ts'
import type { CostTranslate } from './locales.ts'
import css from './cost.module.css'

/** Values the plugin injects into the View for one Session. */
export interface CostViewInjected {
  /** Snapshot sources bound by InjectFace. */
  hooks: {
    /** This target's snapshot; InjectFace exposes it as `useCost`. */
    cost: ObservableSnapshot<CostSnapshot>
  }
  /** Effective price table: the configured override merged over the built-in prices. */
  prices: PriceTable
  /**
   * Load one older history page into the Session window shared by every View.
   * @returns settles when the page request ends; rejects when it fails.
   */
  loadOlder: () => Promise<void>
}

/** Full props of the cost View. */
export type CostViewProps = ConvViewProps & InjectFace<CostViewInjected> & PropsLocale<'cost'>

/** Session totals: amounts, models, unpriced steps, and the estimate note. */
function SummaryCard({ summary, t }: { readonly summary: CostSummary; readonly t: CostTranslate }): ReactElement {
  const allUnpriced = summary.pricedSteps === 0
  return (
    <section className={css.card} aria-label={t('summary.cost')}>
      {allUnpriced ? <p className={css.notice}>{t('summary.allUnpriced')}</p> : null}
      <dl className={css.metrics}>
        {allUnpriced ? null : (
          <>
            <div className={css.metric}>
              <dt className={css.label}>{t('summary.cost')}</dt>
              <dd className={css.amount}>{formatYuan(summary.total)}</dd>
            </div>
            <div className={css.metric}>
              <dt className={css.label}>{t('summary.savings')}</dt>
              <dd className={css.amount}>{formatYuan(summary.savings)}</dd>
            </div>
          </>
        )}
        {summary.models.length === 0 ? null : (
          <div className={css.metric}>
            <dt className={css.label}>{t('summary.models')}</dt>
            <dd className={css.value}>{summary.models.join(t('summary.models.separator'))}</dd>
          </div>
        )}
      </dl>
      {!allUnpriced && summary.unpricedSteps > 0
        ? <p className={css.notice}>{t('summary.excludesUnpriced', { count: summary.unpricedSteps })}</p>
        : null}
      <p className={css.note}>{t('summary.note')}</p>
    </section>
  )
}

/** Cost cell of one turn: the priced amount, a partial marker, or the unpriced label. */
function CostCell({ row, t }: { readonly row: CostTurnRow; readonly t: CostTranslate }): ReactElement {
  if (row.cost === null) return <td className={`${css.td} ${css.unpriced}`}>{t('unpriced')}</td>
  const excluded = t('summary.excludesUnpriced', { count: row.unpricedSteps })
  return (
    <td className={css.td}>
      {formatYuan(row.cost)}
      {row.partial ? <span className={css.mark} role="img" aria-label={excluded} title={excluded}>*</span> : null}
    </td>
  )
}

/**
 * Render the cost of the loaded Session window. Pricing runs here because the
 * fallback model comes from a Session projection that the view target cannot read.
 * @param props - composed conversation View props: the cost snapshot hook, prices, the older-page
 *   loader, Session state, and the locale seat.
 * @returns the empty state, or the summary card, the partial-window notice, and the turn table.
 */
export function CostView(props: CostViewProps): ReactElement {
  const { useCost, useSession, useProjection, prices, loadOlder, t } = props
  const snapshot = useCost(value => value)
  const lastUsed = useProjection('modelSelection', value => value?.lastUsed?.model ?? null)
  const hasMore = useSession(session => session.hasMore)
  const loadingOlder = useSession(session => session.loadingOlder)
  const historyFailed = useSession(session => session.historyLoadStatus === 'error')
  const [rejected, setRejected] = useState(false)
  const summary = useMemo(() => priceSummary(snapshot, prices, lastUsed), [snapshot, prices, lastUsed])
  const requestOlder = (): void => {
    setRejected(false)
    loadOlder().catch((error: unknown) => {
      // The notice offers the retry; the console keeps the cause.
      console.warn('client-ui-cost: loading earlier turns failed', error)
      setRejected(true)
    })
  }
  const older = !hasMore ? null : (
    <div className={css.older}>
      {snapshot.steps.length === 0 ? null : <span>{t('partial', { count: summary.turns.length })}</span>}
      {loadingOlder ? (
        <span role="status">{t('loadOlder.loading')}</span>
      ) : (
        <Button size="sm" variant="outline" onClick={requestOlder}>
          {rejected || historyFailed ? t('loadOlder.failed') : t('loadOlder')}
        </Button>
      )}
    </div>
  )
  return (
    <div className={css.root} data-conversation-composer-overlay="">
      <div className={css.scroll} role="region" aria-label={t('view.cost')} tabIndex={0}>
        {snapshot.steps.length === 0 ? (
          <>
            <div className={css.empty}>{t('empty')}</div>
            {older}
          </>
        ) : (
          <>
            <SummaryCard summary={summary} t={t} />
            {older}
            <table className={css.table} aria-label={t('view.cost')}>
              <thead>
                <tr>
                  <th className={css.th} scope="col">{t('column.turn')}</th>
                  <th className={css.th} scope="col">{t('column.input')}</th>
                  <th className={css.th} scope="col">{t('column.output')}</th>
                  <th className={css.th} scope="col">{t('column.cost')}</th>
                </tr>
              </thead>
              <tbody>
                {summary.turns.map(row => (
                  <tr key={row.turn}>
                    <td className={css.td}>{row.turn}</td>
                    <td className={css.td}>{formatTokens(row.input)}</td>
                    <td className={css.td}>{formatTokens(row.output)}</td>
                    <CostCell row={row} t={t} />
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}
