'use client';

import { useEffect } from 'react';
import { initReporting } from '../../lib/reporting';

/**
 * Warms the error reporter once on the client. With a Sentry DSN this registers
 * the global error handlers early; on the dormant debug adapter it is a no-op.
 * Renders nothing. Mounted from the root layout so it covers every surface.
 */
export function ReporterBoot() {
  useEffect(() => {
    initReporting();
  }, []);
  return null;
}
