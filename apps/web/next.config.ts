import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

/**
 * Workspace packages ship as TypeScript source (@era/core, @era/db expose
 * ./src/index.ts via their exports map), so Next must transpile them itself.
 */
const nextConfig: NextConfig = {
  transpilePackages: ['@era/core', '@era/db'],
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
