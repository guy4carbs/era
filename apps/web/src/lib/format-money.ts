/**
 * Client-safe money formatting for the wear-tracking surfaces.
 *
 * `costPerWear()` (from `@era/core/wear-stats`) returns a plain number; the copy
 * deck ({@link strings.wear.costPerWear}, {@link strings.wear.recap.bestCostPerWear})
 * takes an ALREADY-formatted price string. This is the single place a number
 * becomes that string, so "$15 per wear" reads the same everywhere.
 *
 * Currency is optional: the item-detail surface carries the item's ISO currency
 * and renders "$15"; the monthly recap is built from the wear-logs read, which
 * doesn't include a currency, so it renders a plain localized number ("15"). We
 * never invent a currency symbol we weren't given — honest over pretty. Whole
 * amounts drop their decimals (`15` → "$15"); fractional amounts keep cents
 * (`4.29` → "$4.29"). Any non-finite input collapses to an em dash so a bad value
 * never renders as "NaN".
 */

/** The dash shown when there is nothing sensible to format. */
const EM_DASH = '—';

/**
 * Format a numeric amount for display. With a valid ISO `currency` it uses the
 * locale's currency style; without one it falls back to a plain decimal. Whole
 * numbers render with no fraction digits, fractional ones with two.
 */
export function formatMoney(amount: number, currency?: string | null): string {
  if (!Number.isFinite(amount)) {
    return EM_DASH;
  }
  const fractionDigits = Number.isInteger(amount) ? 0 : 2;
  const options: Intl.NumberFormatOptions = {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  };
  if (currency) {
    try {
      return new Intl.NumberFormat(undefined, { ...options, style: 'currency', currency }).format(amount);
    } catch {
      // `currency` wasn't a valid ISO 4217 code — fall through to the plain form.
    }
  }
  return new Intl.NumberFormat(undefined, options).format(amount);
}
