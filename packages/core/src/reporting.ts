/**
 * @era/core — SDK-agnostic error reporting contract.
 *
 * The ONLY error-reporting surface web and mobile code against, so the backing
 * tracker (Sentry, whatever Scout adds) stays SWAPPABLE. No node imports live
 * here, so this subpath is safe in a client bundle. Import via the
 * `@era/core/reporting` subpath.
 *
 * Reporting NEVER throws — a broken tracker must not turn a caught error into an
 * uncaught one. When nothing is wired, `noopReporter` is the default.
 */

/** Severity for a captured message. */
export type ReportLevel = 'info' | 'warning' | 'error';

/**
 * The swappable error-reporting surface. Both methods swallow their own
 * failures — capturing an error must never itself throw.
 */
export interface ErrorReporter {
  captureError(error: unknown, context?: Record<string, unknown>): void;
  captureMessage(message: string, level?: ReportLevel): void;
}

/** The default when no tracker is configured. Does nothing, never throws. */
export const noopReporter: ErrorReporter = {
  captureError() {},
  captureMessage() {},
};

/** A captured report, as handed to a debug sink. */
export type CapturedReport =
  | { readonly kind: 'error'; readonly error: unknown; readonly context?: Record<string, unknown>; readonly ts: number }
  | { readonly kind: 'message'; readonly message: string; readonly level: ReportLevel; readonly ts: number };

/** A debug reporter instance plus a getter over what it has captured. */
export interface DebugReporter extends ErrorReporter {
  /** Every report captured so far, oldest first. For tests/verification. */
  getReports(): readonly CapturedReport[];
  /** Drop all captured reports. */
  clear(): void;
}

/**
 * A verifiable error-reporting implementation — captures reports in memory (for
 * tests) and forwards each to `sink`, defaulting to `console.error('[error-reporter]', ...)`.
 * Lets us prove a forced error reaches the tracker WITHOUT a live backend. Never
 * throws: a sink that throws is swallowed.
 */
export function createDebugReporter(sink?: (report: CapturedReport) => void): DebugReporter {
  const reports: CapturedReport[] = [];
  const emit =
    sink ??
    ((r: CapturedReport) =>
      r.kind === 'error'
        ? console.error('[error-reporter]', r.error, r.context ?? {})
        : console.error('[error-reporter]', r.level, r.message));

  return {
    captureError(error, context) {
      const captured: CapturedReport = { kind: 'error', error, context, ts: Date.now() };
      reports.push(captured);
      try {
        emit(captured);
      } catch {
        // Never let reporting an error throw.
      }
    },
    captureMessage(message, level = 'info') {
      const captured: CapturedReport = { kind: 'message', message, level, ts: Date.now() };
      reports.push(captured);
      try {
        emit(captured);
      } catch {
        // See above.
      }
    },
    getReports() {
      return reports;
    },
    clear() {
      reports.length = 0;
    },
  };
}
