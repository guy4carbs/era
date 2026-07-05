/**
 * The single source of truth for Era's canonical origin.
 *
 * Every absolute URL the site emits — the (site) layout `metadataBase`, per-page
 * canonicals, `sitemap.ts`, `robots.ts`, and Nova's JSON-LD builders — resolves
 * its host through here so there is exactly ONE place the production domain is
 * decided. Reads the deploy-provided `NEXT_PUBLIC_SITE_URL` (set on Railway),
 * falling back to localhost for dev so the value is always a valid absolute URL.
 *
 * `NEXT_PUBLIC_*` means this is inlined into the browser bundle at build time, so
 * it is safe to import from client components. It carries a public URL only.
 */

/**
 * The canonical site origin with NO trailing slash (a trailing slash breaks
 * `new URL(path, base)` joins and produces `//`-doubled canonicals). Callers
 * append their own leading-slash paths, e.g. `` `${siteUrl()}/sitemap.xml` ``.
 */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return raw.replace(/\/+$/, '');
}
