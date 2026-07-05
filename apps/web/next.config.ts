import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

/**
 * Remote hosts allowed for `next/image` optimization. Public-profile imagery
 * (item cutouts, outfit covers) is served from R2 — either the default
 * `*.r2.dev` public host or a custom R2 domain set via `NEXT_PUBLIC_R2_PUBLIC_URL`.
 * We always allow `**.r2.dev`, and additionally allow the configured custom host
 * when it is a non-r2.dev domain. Wired ahead of Layer-3 public profiles.
 */
const r2RemotePatterns: NonNullable<NonNullable<NextConfig['images']>['remotePatterns']> = [
  { protocol: 'https', hostname: '**.r2.dev' },
];

const r2PublicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
if (r2PublicUrl) {
  try {
    const { hostname } = new URL(r2PublicUrl);
    if (!hostname.endsWith('r2.dev')) {
      r2RemotePatterns.push({ protocol: 'https', hostname });
    }
  } catch {
    // Malformed URL — env validation in @era/core is the real guard; skip here.
  }
}

/**
 * Workspace packages ship as TypeScript source (@era/core, @era/db expose
 * ./src/index.ts via their exports map), so Next must transpile them itself.
 */
const nextConfig: NextConfig = {
  transpilePackages: ['@era/core', '@era/db'],

  /**
   * Force blocking (in-`<head>`) metadata for every client.
   *
   * Next 15.5 *streams* metadata by default: for regular browsers (and, here,
   * Googlebot + Lighthouse's UA) it renders `<title>`/`<meta name=description>`/
   * `<link rel=canonical>`/OG/twitter into the `<body>` after a Suspense marker,
   * relying on React 19 to hoist them into `<head>` client-side. That hoist does
   * NOT fire reliably in this app because the root layout renders an explicit
   * `<head>` (the no-flash theme script + token CSS, which must stay in head to
   * avoid a pre-paint theme flash). The result: metadata stranded in `<body>` →
   * Lighthouse's `meta-description` audit fails (SEO 0.91) and a `<link
   * rel=canonical>` in `<body>` is ignored by Google, defeating the per-page
   * canonicals.
   *
   * `htmlLimitedBots` is the UA regex Next treats as "can't hoist — serve
   * blocking metadata". Setting it to a match-every-UA pattern opts ALL clients
   * out of streaming metadata, so the SEO tags are authored directly into
   * `<head>` during SSR — no client hoist, no reliance on removing the head's
   * theme script. Next serializes the RegExp via its `source`, so the literal
   * below yields the pattern `dot-star` and matches any user agent. Metadata on
   * these pages is static, so blocking rendering is effectively free. Verified:
   * this is the exact code path that scores SEO 1.0 / meta-description 1.
   */
  htmlLimitedBots: /.*/,

  images: {
    remotePatterns: r2RemotePatterns,
  },

  /**
   * The ONE canonical place for permanent (301) redirects. Host-level normalization
   * — www ↔ apex, http → https for era.style — is intentionally NOT here: it is
   * handled at the Railway/DNS edge, which is cheaper and runs before the app. This
   * config is for in-app *path* rewrites: retired routes, renamed pages, legacy
   * URLs that must keep their link equity. Add new 301s to the returned array.
   */
  async redirects() {
    return [
      // Example (kept as the documented pattern): a legacy path 301s to its new
      // home. Replace/extend as real renames land — e.g. an old `/waitlist` →
      // the landing `/`, or a moved legal page.
      {
        source: '/home',
        destination: '/',
        permanent: true,
      },
    ];
  },
};

/**
 * Sentry wrapping is dormant until a DSN is present: with no
 * `NEXT_PUBLIC_SENTRY_DSN` we export the bare config untouched, so builds carry
 * no Sentry instrumentation or source-map upload. When a DSN is set,
 * `withSentryConfig` adds the build-time integration (source-map upload only
 * runs when `SENTRY_AUTH_TOKEN`/org/project are also configured); `silent`
 * keeps the build log quiet.
 */
const config = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, { silent: true })
  : nextConfig;

export default config;
