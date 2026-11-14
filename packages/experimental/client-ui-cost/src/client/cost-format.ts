/** Display formatting for amounts and token counts in the cost View. */

/** Positive amounts below this round to zero at four decimals. */
const SMALLEST_SHOWN = 0.00005

/** Amounts from here up round to ¥1.0000 at four decimals, so they use the two-decimal form. */
const TWO_DECIMALS_FROM = 0.99995

/**
 * Yuan amount: two decimals from ¥1, four decimals below, and `<¥0.0001` for a positive amount that rounds to zero.
 * @param value - non-negative amount in yuan.
 * @returns the formatted amount.
 */
export function formatYuan(value: number): string {
  if (value > 0 && value < SMALLEST_SHOWN) return '<¥0.0001'
  return value >= TWO_DECIMALS_FROM ? `¥${value.toFixed(2)}` : `¥${value.toFixed(4)}`
}

/**
 * Token count in K, switching to M from ten million, matching the Statistics View.
 * @param value - non-negative token count.
 * @returns the K/M-suffixed count.
 */
export function formatTokens(value: number): string {
  if (value >= 10_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  return `${(value / 1_000).toFixed(value >= 1_000 ? 1 : 2)}K`
}
