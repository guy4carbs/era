/**
 * Uniqlo order-confirmation parser. Single-brand; items render as `tr.cart-item`
 * rows. Sender: order@uniqlo.com / mail.uniqlo.com — matched by `uniqlo.com`.
 */
import { makeRetailerParser } from './retailer.ts';

export const uniqloParser = makeRetailerParser({
  domains: ['uniqlo.com'],
  brandDefault: 'UNIQLO',
  blockRe: /<tr[^>]*class="[^"]*cart-item[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi,
  nameRe: /<td[^>]*class="[^"]*item-name[^"]*"[^>]*>([\s\S]*?)<\/td>/i,
  priceRe: /<td[^>]*class="[^"]*item-price[^"]*"[^>]*>([\s\S]*?)<\/td>/i,
});
