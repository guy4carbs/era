/**
 * ASOS order-confirmation parser. ASOS is a multi-brand marketplace, so brand is
 * lifted per item from `span.brand`; the product name is `span.productTitle`.
 * Items render as `tr.lineItem` rows. Sender domain: asos.com.
 */
import { makeRetailerParser } from './retailer.ts';

export const asosParser = makeRetailerParser({
  domains: ['asos.com'],
  blockRe: /<tr[^>]*class="[^"]*lineItem[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi,
  nameRe: /<span[^>]*class="[^"]*productTitle[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
  brandRe: /<span[^>]*class="[^"]*brand[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
  priceRe: /<td[^>]*class="[^"]*price[^"]*"[^>]*>([\s\S]*?)<\/td>/i,
});
