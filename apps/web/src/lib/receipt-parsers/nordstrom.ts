/**
 * Nordstrom order-confirmation parser. Department store carrying many brands, so
 * brand is per item (`span.brand-name`); the product name is `span.product-name`.
 * Items render as `tr.product-row` rows. Sender domain: nordstrom.com.
 */
import { makeRetailerParser } from './retailer.ts';

export const nordstromParser = makeRetailerParser({
  domains: ['nordstrom.com'],
  blockRe: /<tr[^>]*class="[^"]*product-row[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi,
  nameRe: /<span[^>]*class="[^"]*product-name[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
  brandRe: /<span[^>]*class="[^"]*brand-name[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
  priceRe: /<span[^>]*class="[^"]*item-price[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
});
