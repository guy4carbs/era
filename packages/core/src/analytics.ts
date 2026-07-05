/**
 * @era/core — SDK-agnostic analytics contract.
 *
 * This is the ONLY analytics surface web and mobile code against. It is a plain
 * interface so the backing SDK (PostHog, Segment, whatever Scout adds) stays
 * SWAPPABLE — nothing outside the adapter that constructs an `Analytics` knows
 * which vendor is behind it. No node imports live here, so this subpath is safe
 * in a client bundle. Import via the `@era/core/analytics` subpath.
 *
 * The funnel is fixed. `FunnelEvent` names the seven activation moments that
 * define whether Era is working; keep those first-class and let arbitrary
 * string events ride alongside for everything more granular.
 *
 * Tracking is fire-and-forget and NEVER throws — a broken tracker must not take
 * down a render or a request. When no SDK/keys are wired, `noopAnalytics` is the
 * default and the app behaves identically minus the reporting.
 */

/** The seven activation moments that define the Era funnel. */
export type FunnelEvent =
  | 'quiz_started'
  | 'quiz_completed'
  | 'first_item_added'
  | 'first_outfit_saved'
  | 'ovi_message'
  | 'wear_logged'
  | 'waitlist_signup';

/** Event properties — flat, primitive-valued, and safe to serialize. */
export type AnalyticsProps = Record<string, string | number | boolean>;

/**
 * The swappable analytics surface. `track` is fire-and-forget; `identify` binds
 * subsequent events to a distinct id; `reset` clears identity on sign-out.
 * Implementations MUST NOT throw.
 */
export interface Analytics {
  track(event: FunnelEvent | string, props?: AnalyticsProps): void;
  identify(distinctId: string, props?: AnalyticsProps): void;
  reset(): void;
}

/** The default when no SDK or keys are configured. Does nothing, never throws. */
export const noopAnalytics: Analytics = {
  track() {},
  identify() {},
  reset() {},
};

/** A captured event, as handed to a debug sink. */
export interface CapturedEvent {
  readonly event: string;
  readonly props?: AnalyticsProps;
  readonly ts: number;
}

/** A debug analytics instance plus a getter over what it has captured. */
export interface DebugAnalytics extends Analytics {
  /** Every event captured so far, oldest first. For tests/verification. */
  getEvents(): readonly CapturedEvent[];
  /** Drop all captured events. */
  clear(): void;
}

/**
 * A verifiable analytics implementation — captures events in memory (for tests)
 * and forwards each to `sink`, defaulting to `console.info('[analytics]', ...)`.
 * Lets us prove the funnel fires end-to-end WITHOUT a live backend. Never throws:
 * a sink that throws is swallowed so tracking stays fire-and-forget.
 */
export function createDebugAnalytics(sink?: (event: CapturedEvent) => void): DebugAnalytics {
  const events: CapturedEvent[] = [];
  const emit = sink ?? ((e: CapturedEvent) => console.info('[analytics]', e.event, e.props ?? {}));

  return {
    track(event, props) {
      const captured: CapturedEvent = { event, props, ts: Date.now() };
      events.push(captured);
      try {
        emit(captured);
      } catch {
        // Fire-and-forget: a broken sink must never surface to the caller.
      }
    },
    identify(distinctId, props) {
      const captured: CapturedEvent = { event: 'identify', props: { distinctId, ...props }, ts: Date.now() };
      events.push(captured);
      try {
        emit(captured);
      } catch {
        // See above.
      }
    },
    reset() {
      const captured: CapturedEvent = { event: 'reset', ts: Date.now() };
      events.push(captured);
      try {
        emit(captured);
      } catch {
        // See above.
      }
    },
    getEvents() {
      return events;
    },
    clear() {
      events.length = 0;
    },
  };
}
