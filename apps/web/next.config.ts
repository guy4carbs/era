import type { NextConfig } from 'next';

/**
 * Workspace packages ship as TypeScript source (@era/core, @era/db expose
 * ./src/index.ts via their exports map), so Next must transpile them itself.
 */
const nextConfig: NextConfig = {
  transpilePackages: ['@era/core', '@era/db'],
};

export default nextConfig;
