/**
 * H&M order-confirmation parser. Single-brand; items render as `tr.hm-product`
 * rows. Sender: no-reply@hm.com / mailer.hm.com — matched by `hm.com`.
 */
import { makeRetailerParser } from './retailer.ts';

export const hmParser = makeRetailerParser({
  domains: ['hm.com'],
  brandDefault: 'H&M',
  blockRe: /<tr[^>]*class="[^"]*hm-product[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi,
  nameRe: /<td[^>]*class="[^"]*hm-name[^"]*"[^>]*>([\s\S]*?)<\/td>/i,
  priceRe: /<td[^>]*class="[^"]*hm-price[^"]*"[^>]*>([\s\S]*?)<\/td>/i,
});
