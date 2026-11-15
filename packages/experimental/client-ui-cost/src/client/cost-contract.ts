/** Data types shared by the cost View's event folding, pricing, and rendering. */

/** Unit prices of one model in one price period, in yuan per million tokens. */
export interface UnitPrices {
  /** Input tokens served from the provider's prompt cache. */
  readonly cacheHit: number
  /** Input tokens not served from the cache; cache writes are also priced at this rate. */
  readonly cacheMiss: number
  /** Output tokens. */
  readonly output: number
}

/** Unit prices of one model in both price periods. */
export interface ModelPrices {
  /** Prices Monday to Friday, 09:00–12:00 and 14:00–18:00 Beijing time; public holidays are not recognized. */
  readonly peak: UnitPrices
  /** Prices at all other times, including weekends. */
  readonly offPeak: UnitPrices
}

/** Unit prices keyed by the model id recorded in `request/header`. */
export type PriceTable = Readonly<Record<string, ModelPrices>>

/** DeepSeek price period of one step. */
export type PricePeriod = 'peak' | 'offPeak'

/**
 * One step that recorded token usage. The four token counts do not overlap:
 * `miss` excludes cache reads and cache writes.
 */
export interface CostStep {
  /** Turn number of the step. */
  readonly turn: number
  /** Step number within the turn. */
  readonly step: number
  /** Epoch milliseconds of `step/start`, or of the step's `assistant/message` when the start is outside the loaded window. */
  readonly startTime: number
  /** Session sequence number of the step's `assistant/message`. */
  readonly messageSeq: number
  /** Input tokens that missed the cache. */
  readonly miss: number
  /** Input tokens read from the cache. */
  readonly hit: number
  /** Input tokens written to the cache. */
  readonly write: number
  /** Output tokens. */
  readonly output: number
}

/** A step with the model it ran on. */
export interface AttributedCostStep extends CostStep {
  /** Model id, or null when the loaded window cannot determine it. */
  readonly model: string | null
}

/**
 * Model of the steps a loaded window held while it contained no `request/header`.
 * The window is a contiguous suffix of the Session log, so every such step ran on
 * the Session's last used model at that moment, even after a later header arrives.
 */
export interface WindowFallback {
  /** Model id the Session last used while the window had no header. */
  readonly model: string
  /** Lowest message sequence number of the steps this model covers. */
  readonly fromSeq: number
}

/** Cost View snapshot of the loaded Session window. */
export interface CostSnapshot {
  /** Steps with recorded usage, ordered by `messageSeq`. */
  readonly steps: readonly AttributedCostStep[]
  /** Whether the loaded window contains any `request/header`; without one, the Session's last used model applies. */
  readonly windowHasHeader: boolean
}

/** One turn row of the cost table. */
export interface CostTurnRow {
  /** Turn number. */
  readonly turn: number
  /** Input tokens: cache misses, hits, and writes. */
  readonly input: number
  /** Output tokens. */
  readonly output: number
  /** Cost of the turn's priced steps in yuan, or null when no step of the turn is priced. */
  readonly cost: number | null
  /** Whether some, but not all, steps of the turn are unpriced. */
  readonly partial: boolean
  /** Number of steps of the turn that recorded usage but have no price or no known model. */
  readonly unpricedSteps: number
}

/** Priced totals of a cost snapshot. */
export interface CostSummary {
  /** Cost of all priced steps in yuan. */
  readonly total: number
  /** Cache savings of all priced steps in yuan. */
  readonly savings: number
  /** Known model ids in first-use order, including models without a price. */
  readonly models: readonly string[]
  /** Number of priced steps. */
  readonly pricedSteps: number
  /** Number of steps that recorded usage but have no price or no known model. */
  readonly unpricedSteps: number
  /** Turn rows in ascending turn order. */
  readonly turns: readonly CostTurnRow[]
}
