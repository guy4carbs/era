import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit runs from this package dir, but the repo keeps its env in the
// root .env. Load that first, then fall back to a package-local .env if one
// exists (default lookup).
loadEnv({ path: '../../.env' });
loadEnv();

export default defineConfig({
  schema: './src/schema/*.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
