/**
 * Forced-error trigger for verifying the error-reporting pipeline end to end.
 *
 * GET (or POST) /api/_debug/error throws a synthetic error, routes it into the
 * shared {@link reporter} (the debug reporter captures + console.errors it today;
 * Sentry when a DSN is wired), and returns 500. It exists so Gauge can prove "a
 * forced error reaches the tracker" without waiting on a real crash.
 *
 * Guarded: only reachable outside production, or when `ENABLE_DEBUG_ERROR` is
 * explicitly set to `'true'`. Otherwise it 404s as if the route did not exist.
 */
import { NextResponse } from 'next/server';
import { getCapturedReports, reporter } from '../../../../lib/reporting';

/** Whether the trigger is allowed to fire in this environment. */
const ENABLED =
  process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEBUG_ERROR === 'true';

function trigger(): NextResponse {
  if (!ENABLED) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const error = new Error('Forced debug error — error-reporting smoke test');
  reporter.captureError(error, { source: '/api/_debug/error' });

  // `capturedReports` is populated only on the debug adapter (0 with Sentry);
  // a non-zero count is direct proof the reporter received the error.
  return NextResponse.json(
    { ok: false, error: error.message, capturedReports: getCapturedReports().length },
    { status: 500 },
  );
}

export function GET(): NextResponse {
  return trigger();
}

export function POST(): NextResponse {
  return trigger();
}
