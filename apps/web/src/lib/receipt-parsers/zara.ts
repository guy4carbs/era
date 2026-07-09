/**
 * Zara order-confirmation parser. Single-brand; items render as table rows
 * (`tr.order-line`) with a name cell and a price cell. Sender: order@e.zara.com,
 * noreply@zara.com — matched by the registrable `zara.com`.
 */
import { makeRetailerParser } from './retailer.ts';

export const zaraParser = makeRetailerParser({
  domains: ['zara.com'],
  brandDefault: 'Zara',
  blockRe: /<tr[^>]*class="[^"]*order-line[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi,
  nameRe: /<td[^>]*class="[^"]*(?:product-)?name[^"]*"[^>]*>([\s\S]*?)<\/td>/i,
  priceRe: /<td[^>]*class="[^"]*price[^"]*"[^>]*>([\s\S]*?)<\/td>/i,
});
