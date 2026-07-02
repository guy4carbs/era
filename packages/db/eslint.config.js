import { config } from '@era/eslint-config';

// drizzle-kit requires drizzle.config.ts to use a default export (forbidden by
// the shared no-default-export rule) and reads process.env, so exempt it and
// the generated migration output from linting.
export default [...config, { ignores: ['drizzle.config.ts', 'drizzle/**'] }];
