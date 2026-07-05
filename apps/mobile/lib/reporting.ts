/**
 * Mobile error reporting — the one crash/error surface every mobile screen
 * reports against.
 *
 * Codes to `@era/core`'s SDK-agnostic {@link ErrorReporter} contract so the
 * backing tracker stays swappable. DORMANT by default:
 *
 *   - `EXPO_PUBLIC_SENTRY_DSN` set → Sentry React Native is initialised
 *     (`tracesSampleRate: 0.1`) and a real adapter maps captureError →
 *     captureException and captureMessage → captureMessage.
 *   - unset (today) → {@link createDebugReporter}, which console-errors every
 *     report and exposes `getReports()` so a forced error is VERIFIABLE with no
 *     live backend.
 *
 * The native Sentry module requires a dev build (not Expo Go), but init is guarded
 * so a DSN-less build stays fully inert and `expo export` still succeeds. Reporting
 * NEVER throws — capturing an error must not turn a caught error into an uncaught
 * one.
 */
import type { ComponentType } from 'react';

import type { ErrorReporter } from '@era/core/reporting';
import { createDebugReporter } from '@era/core/reporting';
import * as Sentry from '@sentry/react-native';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

/** Whether the live Sentry tracker is active (vs the dormant debug sink). */
export const reportingActive = Boolean(DSN);

/** Wrap the initialised Sentry client in the swappable {@link ErrorReporter} surface. */
function createSentryReporter(): ErrorReporter {
  Sentry.init({ dsn: DSN, tracesSampleRate: 0.1 });
  return {
    captureError(error, context) {
      try {
        Sentry.captureException(error, context ? { extra: context } : undefined);
      } catch {
        // Never let reporting an error throw.
      }
    },
    captureMessage(message, level = 'info') {
      try {
        Sentry.captureMessage(message, level);
      } catch {
        // See above.
      }
    },
  };
}

/** The one error reporter every mobile screen imports. */
export const reporter: ErrorReporter = DSN ? createSentryReporter() : createDebugReporter();

/** The line a forced test error carries, so it's recognisable in Sentry / logs. */
export const FORCED_ERROR_MESSAGE = 'Forced test error (mobile) — analytics-guardrails E2E';

/**
 * Forced-error mechanism — deterministically exercises the whole error pipeline
 * so a build can be verified reaching Sentry (Gauge's cross-platform "forced
 * error" check). It drives BOTH capture paths through {@link reporter}
 * (`captureError` and `captureMessage`); with `throwUncaught` it additionally
 * throws on the next tick to trip the Sentry root boundary — the UNcaught path.
 *
 * Dev/staging only: the sole caller is a `__DEV__`-gated Settings row, so this
 * never reaches a production surface. When no DSN is set the reporter is the
 * debug sink, so the forced error still lands in the console and `getReports()`.
 */
export function forceError(throwUncaught = false): void {
  const error = new Error(FORCED_ERROR_MESSAGE);
  reporter.captureError(error, { forced: true, platform: 'mobile' });
  reporter.captureMessage(FORCED_ERROR_MESSAGE, 'error');
  if (throwUncaught) {
    // Defer so the tap handler returns first — the throw is genuinely uncaught,
    // reaching the Sentry boundary rather than any surrounding try/catch.
    setTimeout(() => {
      throw error;
    }, 0);
  }
}

/**
 * Wrap the root component so uncaught render errors reach Sentry — a no-op passthrough
 * when Sentry isn't active, keeping the DSN-less build inert. `_layout` exports the
 * result as its default. Typed for the props-less root; the cast bridges Sentry's
 * `Record<string, unknown>` constraint without leaking it to callers.
 */
export function wrapRoot(Component: ComponentType): ComponentType {
  if (!reportingActive) return Component;
  return Sentry.wrap(Component as ComponentType<Record<string, unknown>>) as ComponentType;
}
