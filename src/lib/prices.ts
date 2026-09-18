/**
 * The prices, as plain constants with no imports.
 *
 * Split out of billing.ts (18 Sept) because billing imports the Supabase
 * client, and the landing page importing PRICES from there pulled all of
 * supabase-js (auth, realtime, storage, postgrest) into the landing's first
 * download. billing.ts re-exports these, so every existing import still works.
 */

/**
 * The prices, decided 14-15 Sept 2026. The server picks the Stripe price;
 * these are only what the page says, and must match it.
 */
export const PRICES = {
  founding: { amount: 49, interval: 'year' as const },
  year: { amount: 79, interval: 'year' as const },
  month: { amount: 12, interval: 'month' as const },
}

export const FOUNDING_CAP = 100

/**
 * The $49 founding offer. OFF, settled 15 Sept after a Hormozi pass:
 * discounting an unproven product teaches people to wait and lowers what it
 * is worth. Everything behind it (the 100-place cap in 035, the Stripe price,
 * the checkout path) stays built, so turning it on is this flag plus
 * FOUNDING_OFFER=on on the checkout function.
 */
export const FOUNDING_OFFER = false

/** Said wherever the founding price is offered, before anyone pays. */
export const FOUNDING_TERMS =
  '$49 a year for as long as your subscription stays active. If you cancel, you rejoin at the current price.'
