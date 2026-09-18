/**
 * Dollars or pounds (Owen, 18 Sept: "be able to switch GBP and USD in
 * pricing"). No imports, so the landing can use it without pulling in the app.
 *
 * The pound prices are the dollar prices at the 18 Sept rate (0.748), rounded
 * down to clean numbers: $79 is £59, $12 is £9. They must match the GBP
 * currency option on each Stripe price, which is what actually gets charged.
 */
export type Currency = 'usd' | 'gbp'

export const PRICE_TABLE: Record<Currency, { year: number; month: number; symbol: string }> = {
  usd: { year: 79, month: 12, symbol: '$' },
  gbp: { year: 59, month: 9, symbol: '£' },
}

/** What a month costs on the yearly plan, e.g. "6.58" or "4.92". */
export function perMonthOfYear(currency: Currency): string {
  return (PRICE_TABLE[currency].year / 12).toFixed(2)
}

export function money(currency: Currency, amount: number | string): string {
  return `${PRICE_TABLE[currency].symbol}${amount}`
}

const KEY = 'sd_currency'

/** The visitor's choice if they made one, otherwise pounds for UK visitors. */
export function getPreferredCurrency(): Currency {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'usd' || saved === 'gbp') return saved
  } catch {
    // Storage blocked: fall through to the guess.
  }
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
    const lang = typeof navigator !== 'undefined' ? navigator.language ?? '' : ''
    if (tz === 'Europe/London' || /-GB$/i.test(lang)) return 'gbp'
  } catch {
    // No Intl: dollars.
  }
  return 'usd'
}

export function setPreferredCurrency(currency: Currency) {
  try {
    localStorage.setItem(KEY, currency)
  } catch {
    // Not saved; the choice still applies on this page.
  }
}
