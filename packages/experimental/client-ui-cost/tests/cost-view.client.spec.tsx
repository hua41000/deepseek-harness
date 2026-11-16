// @vitest-environment jsdom
/**
 * CostView presentation: the empty state, the summary card in its priced,
 * partly priced and unpriced forms, the turn table, the partial-window notice
 * with its loading and failure states, the fallback model, and live updates.
 */

import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { AttributedCostStep, CostSnapshot, WindowFallback } from '../src/client/cost-contract.ts'
import { BUILTIN_PRICES } from '../src/client/cost-pricing.ts'
import { CostView } from '../src/client/CostView.tsx'
import { en, zh } from '../src/client/locales.ts'

const t = makeTranslate(zh)

/** 2026-11-11 10:00 Beijing time, a Wednesday peak minute. */
const PEAK = Date.UTC(2026, 10, 11, 2)

/** The PRD AC-02 step: ¥0.0316 at the deepseek-flash peak price. */
function step(turn: number, model: string | null, messageSeq = turn): AttributedCostStep {
  return { turn, step: 1, startTime: PEAK, messageSeq, miss: 10_000, hit: 90_000, write: 0, output: 1_000, model }
}

interface SessionState {
  hasMore: boolean
  loadingOlder: boolean
  historyLoadStatus: 'idle' | 'loading' | 'pendingConsumption' | 'error'
}

interface Mounted {
  readonly cost: ReturnType<typeof createSnapshotStore<CostSnapshot>>
  readonly session: ReturnType<typeof createSnapshotStore<SessionState>>
  readonly loadOlder: ReturnType<typeof vi.fn<() => Promise<void>>>
  readonly projection: ReturnType<typeof createSnapshotStore<ModelProjection>>
}

interface ModelProjection {
  readonly lastUsed: { readonly provider: string; readonly model: string } | null
}

/** Render the View with every prop it consumes. */
function mount(
  snapshot: CostSnapshot,
  options: {
    readonly session?: Partial<SessionState>
    readonly lastUsed?: string
    readonly translate?: typeof t
    readonly windowModel?: { current: WindowFallback | null }
  } = {},
): Mounted {
  const cost = createSnapshotStore<CostSnapshot>(snapshot)
  const session = createSnapshotStore<SessionState>({ hasMore: false, loadingOlder: false, historyLoadStatus: 'idle', ...options.session })
  const loadOlder = vi.fn(async () => undefined)
  const projection = createSnapshotStore<ModelProjection>({ lastUsed: options.lastUsed === undefined ? null : { provider: 'deepseek', model: options.lastUsed } })
  const useModelSelection = bindSnapshotSelector(projection)
  const useProjection = (_key: string, select: (value: ModelProjection) => unknown): unknown => useModelSelection(select)
  render(createElement(CostView, {
    useCost: bindSnapshotSelector(cost),
    useSession: bindSnapshotSelector(session),
    useProjection,
    prices: BUILTIN_PRICES,
    loadOlder,
    windowModel: options.windowModel ?? { current: null },
    t: options.translate ?? t,
  } as never))
  return { cost, session, loadOlder, projection }
}

function card(): HTMLElement {
  return screen.getByRole('region', { name: '估算花费' })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('cost view', () => {
  it('shows only the empty state when no step recorded usage', () => {
    mount({ steps: [], windowHasHeader: false })
    expect(screen.getByText(zh.empty)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('region', { name: '估算花费' })).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('totals priced steps, savings, and models, with the estimate note', () => {
    mount({ steps: [step(1, 'deepseek-flash'), step(2, 'deepseek-v4-pro')], windowHasHeader: true })
    const summary = within(card())
    expect(summary.getByText('¥0.1756')).toBeTruthy()
    expect(summary.getByText('¥0.9594')).toBeTruthy()
    expect(summary.getByText('deepseek-flash、deepseek-v4-pro')).toBeTruthy()
    expect(summary.getByText(zh['summary.note'])).toBeTruthy()
    expect(summary.queryByText(/未定价/u)).toBeNull()
  })

  it('lists one row per turn with column headers and token counts', () => {
    mount({ steps: [step(1, 'deepseek-flash'), step(2, 'deepseek-flash')], windowHasHeader: true })
    const table = screen.getByRole('table', { name: '花费' })
    expect(within(table).getAllByRole('columnheader').map(cell => [cell.textContent, cell.getAttribute('scope')]))
      .toEqual([['轮次', 'col'], ['输入', 'col'], ['输出', 'col'], ['花费', 'col']])
    const rows = within(table).getAllByRole('row').slice(1).map(row => within(row).getAllByRole('cell').map(cell => cell.textContent))
    expect(rows).toEqual([['1', '100.0K', '1.0K', '¥0.0316'], ['2', '100.0K', '1.0K', '¥0.0316']])
  })

  it('marks partly priced turns, labels unpriced turns, and counts excluded steps', () => {
    mount({
      steps: [step(1, 'deepseek-flash', 1), step(1, 'other-model', 2), step(2, 'other-model', 3)],
      windowHasHeader: true,
    })
    expect(within(card()).getByText('不含 2 步未定价')).toBeTruthy()
    expect(within(card()).getByText('¥0.0316')).toBeTruthy()
    const mark = screen.getByRole('img', { name: '不含 1 步未定价' })
    expect(mark.getAttribute('title')).toBe('不含 1 步未定价')
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(within(rows[0]!).getAllByRole('cell')[3]!.textContent).toBe('¥0.0316*')
    expect(within(rows[1]!).getAllByRole('cell')[3]!.textContent).toBe('未定价')
  })

  it('shows the add-a-price notice and the models but no amount when every step is unpriced', () => {
    mount({ steps: [step(1, 'other-model')], windowHasHeader: true })
    const summary = within(card())
    expect(summary.getByText(zh['summary.allUnpriced'])).toBeTruthy()
    expect(summary.getByText('other-model')).toBeTruthy()
    expect(summary.queryByText(/¥/u)).toBeNull()
    expect(summary.queryByText(/不含/u)).toBeNull()
  })

  it('omits the model row when no model is known', () => {
    mount({ steps: [step(1, null)], windowHasHeader: true }, { lastUsed: 'deepseek-flash' })
    expect(within(card()).queryByText(zh['summary.models'])).toBeNull()
    expect(within(card()).getByText(zh['summary.allUnpriced'])).toBeTruthy()
  })

  it('prices a window without request headers on the last used model', () => {
    mount({ steps: [step(1, null)], windowHasHeader: false }, { lastUsed: 'deepseek-flash' })
    expect(within(card()).getByText('¥0.0316')).toBeTruthy()
    expect(within(card()).getByText('deepseek-flash')).toBeTruthy()
  })

  it('keeps header-free steps priced when a live request header arrives', () => {
    const mounted = mount({ steps: [step(1, null, 100)], windowHasHeader: false }, { lastUsed: 'deepseek-flash' })
    expect(within(card()).getByText('¥0.0316')).toBeTruthy()
    act(() => { mounted.cost.set({ steps: [step(1, null, 100), step(2, 'deepseek-flash', 400)], windowHasHeader: true }) })
    expect(within(card()).getByText('¥0.0632')).toBeTruthy()
    expect(within(card()).queryByText(/未定价/)).toBeNull()
  })

  it('keeps the window model record across remounts of the tab', () => {
    const windowModel = { current: null as WindowFallback | null }
    mount({ steps: [step(1, null, 100)], windowHasHeader: false }, { lastUsed: 'deepseek-flash', windowModel })
    cleanup()
    mount({ steps: [step(1, null, 100), step(2, 'deepseek-v4-pro', 400)], windowHasHeader: true }, { lastUsed: 'deepseek-v4-pro', windowModel })
    expect(within(screen.getByRole('table')).getByText('¥0.0316')).toBeTruthy()
    expect(within(card()).getByText('deepseek-flash、deepseek-v4-pro')).toBeTruthy()
  })

  it('prices a replacing later window on the last used model at that time', () => {
    const mounted = mount({ steps: [step(1, null, 100)], windowHasHeader: false }, { lastUsed: 'deepseek-flash' })
    expect(within(card()).getByText('¥0.0316')).toBeTruthy()
    // A reconnect replaces the window with a later page that no longer holds the model change header.
    act(() => {
      mounted.projection.set({ lastUsed: { provider: 'deepseek', model: 'deepseek-v4-pro' } })
      mounted.cost.set({ steps: [step(5, null, 500)], windowHasHeader: false })
    })
    expect(within(card()).getByText('¥0.1440')).toBeTruthy()
    expect(within(card()).getByText('deepseek-v4-pro')).toBeTruthy()
    expect(within(card()).queryByText(/未定价/)).toBeNull()
  })

  it('leaves steps before the first header of a replacing window unpriced', () => {
    const mounted = mount({ steps: [step(1, null, 100)], windowHasHeader: false }, { lastUsed: 'deepseek-flash' })
    act(() => { mounted.cost.set({ steps: [step(5, null, 500), step(6, 'deepseek-v4-pro', 600)], windowHasHeader: true }) })
    expect(within(card()).getByText('¥0.1440')).toBeTruthy()
    expect(within(card()).getByText(/未定价/)).toBeTruthy()
  })

  it('updates the amounts when a new step arrives', () => {
    const mounted = mount({ steps: [step(1, 'deepseek-flash')], windowHasHeader: true })
    act(() => { mounted.cost.set({ steps: [step(1, 'deepseek-flash'), step(2, 'deepseek-flash')], windowHasHeader: true }) })
    expect(within(card()).getByText('¥0.0632')).toBeTruthy()
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3)
  })

  it('follows the active locale', () => {
    mount({ steps: [step(1, 'deepseek-flash'), step(2, 'deepseek-v4-pro')], windowHasHeader: true }, { translate: makeTranslate(en) })
    expect(screen.getByRole('region', { name: 'Estimated cost' })).toBeTruthy()
    expect(screen.getByText('deepseek-flash, deepseek-v4-pro')).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Turn' })).toBeTruthy()
  })
})

describe('partial window', () => {
  it('counts the loaded turns and loads one older page on request', () => {
    const mounted = mount({ steps: [step(1, 'deepseek-flash'), step(2, 'deepseek-flash')], windowHasHeader: true }, { session: { hasMore: true } })
    expect(screen.getByText('仅统计已加载的 2 轮。')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh.loadOlder }))
    expect(mounted.loadOlder).toHaveBeenCalledTimes(1)
  })

  it('hides the notice once the whole Session is loaded', () => {
    const mounted = mount({ steps: [step(1, 'deepseek-flash')], windowHasHeader: true }, { session: { hasMore: true } })
    act(() => { mounted.session.set({ hasMore: false, loadingOlder: false, historyLoadStatus: 'idle' }) })
    expect(screen.queryByText(/仅统计已加载/u)).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows a loading status instead of the button while a page loads', () => {
    mount({ steps: [step(1, 'deepseek-flash')], windowHasHeader: true }, { session: { hasMore: true, loadingOlder: true } })
    expect(screen.getByRole('status').textContent).toBe(zh['loadOlder.loading'])
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('offers a retry after a rejected page request', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const mounted = mount({ steps: [step(1, 'deepseek-flash')], windowHasHeader: true }, { session: { hasMore: true } })
    const failure = new Error('offline')
    mounted.loadOlder.mockRejectedValueOnce(failure)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: zh.loadOlder })) })
    expect(warn).toHaveBeenCalledWith('client-ui-cost: loading earlier turns failed', failure)
    fireEvent.click(screen.getByRole('button', { name: zh['loadOlder.failed'] }))
    expect(mounted.loadOlder).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: zh.loadOlder })).toBeTruthy()
  })

  it('offers a retry when the Session reports a failed history request', () => {
    mount({ steps: [step(1, 'deepseek-flash')], windowHasHeader: true }, { session: { hasMore: true, historyLoadStatus: 'error' } })
    expect(screen.getByRole('button', { name: zh['loadOlder.failed'] })).toBeTruthy()
  })

  it('still offers older history when the loaded window has no priced step', () => {
    mount({ steps: [], windowHasHeader: false }, { session: { hasMore: true } })
    expect(screen.getByText(zh.empty)).toBeTruthy()
    expect(screen.queryByText(/仅统计已加载/u)).toBeNull()
    expect(screen.getByRole('button', { name: zh.loadOlder })).toBeTruthy()
  })
})
