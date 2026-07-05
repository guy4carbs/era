/**
 * Web error reporter — the single surface the web app reports errors through.
 *
 * Builds one {@link ErrorReporter} singleton from Oracle's SDK-agnostic contract
 * (`@era/core/reporting`) and picks its backing tracker from env at module load:
 *
 *   - `NEXT_PUBLIC_SENTRY_DSN` set → a Sentry adapter. `@sentry/nextjs` is
 *     imported lazily on first use (and `Sentry.init` runs once, with a low
 *     `tracesSampleRate`), so it stays out of the hot path until a DSN exists.
 *   - otherwise → Oracle's `createDebugReporter()`, which `console.error`s each
 *     report as `[error-reporter] ...` and retains them for `getReports()`. This
 *     is the active path until a DSN lands, so a forced error is verifiable NOW.
 *
 * Reporting never throws (guaranteed by the contract). This module is plain TS
 * with no React or `window` requirement, so it is safe on the server (the debug
 * API route reports through it) and in the client bundle alike.
 */
import {
  createDebugReporter,
  type CapturedReport,
  type DebugReporter,
  type ErrorReporter,
  type ReportLevel,
} from '@era/core/reporting';

/** Keep tracing overhead negligible — we want errors, not a perf firehose. */
const SENTRY_TRACES_SAMPLE_RATE = 0.05;

/**
 * A Sentry-backed adapter. `@sentry/nextjs` is loaded lazily and initialized
 * once; calls made before it resolves are buffered and replayed. Every method
 * swallows its own failures so reporting an error can never itself throw.
 */
function createSentryReporter(dsn: string): { reporter: ErrorReporter; warm: () => void } {
  type Sentry = typeof import('@sentry/nextjs');
  let client: Sentry | null = null;
  let loading = false;
  const queue: Array<(s: Sentry) => void> = [];

  const ensureLoaded = () => {
    if (client || loading) return;
    loading = true;
    void import('@sentry/nextjs')
      .then((Sentry) => {
        Sentry.init({ dsn, tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE });
        client = Sentry;
        for (const fn of queue.splice(0)) {
          try {
            fn(Sentry);
          } catch {
            // Never let reporting an error throw.
          }
        }
      })
      .catch(() => {
        loading = false;
        queue.length = 0;
      });
  };

  const run = (fn: (s: Sentry) => void) => {
    if (client) {
      try {
        fn(client);
      } catch {
        // See above.
      }
      return;
    }
    queue.push(fn);
    ensureLoaded();
  };

  return {
    reporter: {
      captureError(error, context) {
        run((s) => s.captureException(error, context ? { extra: context } : undefined));
      },
      captureMessage(message, level: ReportLevel = 'info') {
        run((s) => s.captureMessage(message, level));
      },
    },
    // Warm (Sentry.init) without emitting anything, so global handlers register early.
    warm: ensureLoaded,
  };
}

/** Construct the singleton once, choosing the adapter from env. */
function createReporter(): {
  reporter: ErrorReporter;
  debug: DebugReporter | null;
  warm: () => void;
} {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (dsn && dsn.length > 0) {
    const sentry = createSentryReporter(dsn);
    return { reporter: sentry.reporter, debug: null, warm: sentry.warm };
  }
  const debug = createDebugReporter();
  return { reporter: debug, debug, warm: () => {} };
}

const { reporter: reporterSingleton, debug: debugReporter, warm: warmReporter } = createReporter();

/** The web error-reporting singleton. Import this — never an SDK directly. */
export const reporter: ErrorReporter = reporterSingleton;

/**
 * Eagerly warm the reporter. With a DSN this triggers `Sentry.init` (registering
 * global handlers) without emitting an event; on the debug adapter it is a no-op.
 * Safe to call repeatedly. Mounted from a client boundary via `ReporterBoot`.
 */
export function initReporting(): void {
  warmReporter();
}

/**
 * Captured reports, for tests / E2E verification. Non-empty only on the debug
 * adapter; the Sentry path returns an empty list since reports go to the SDK.
 */
export function getCapturedReports(): readonly CapturedReport[] {
  return debugReporter ? debugReporter.getReports() : [];
}

// Expose the debug sink on the client for E2E assertions when it's the active
// adapter. Never attached when a real tracker is wired.
if (typeof window !== 'undefined' && debugReporter) {
  (window as unknown as { __eraReporter?: DebugReporter }).__eraReporter = debugReporter;
}
