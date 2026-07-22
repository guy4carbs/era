/**
 * TryOnSheet — the frosted sheet that shows a saved outfit rendered on the user's
 * avatar ("See it on you"). Opened from OutfitCanvas once an outfit is saved.
 *
 * LIFECYCLE (the GlassSheet stays-mounted lesson): GlassSheet keeps its children
 * mounted when closed (translated off-screen), so this component must gate every
 * async subscription — the render POST, the GET poll — on the `open` prop, not on
 * mount. A ref mirrors `open`; every state write is guarded through it so a render
 * that resolves after the sheet closes (the POST can run ~150s) never writes onto a
 * dismissed sheet, and the DimensionalHero result is handed `active={open}` so its
 * rotation-sensor tree leaves the tree the moment the sheet closes.
 *
 * ON OPEN it reads the cached state first ({@link fetchTryon}) — a complete,
 * non-stale render shows INSTANTLY with no spend. `none`/`failed` auto-render (the
 * tap is the intent to see it); `running` resumes the poll; a `complete` but STALE
 * render shows the cached image with the stale line and an explicit "Update render"
 * button — a stale render is NEVER re-spent automatically. Gating errors bubble up
 * to the parent: `plus_required` → {@link onNeedsPlus} (paywall), `no_avatar` →
 * {@link onNeedsAvatar} (onboarding). The render cap, dormant, no-garment, and
 * generic-failure beats each render their calm `strings.tryon` line.
 */
import { strings } from '@era/core/strings';
import type { TryonState } from '@era/core/tryon';
import { spacing } from '@era/tokens';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { OviLoader } from '@/components/OviLoader';
import { Text } from '@/components/Text';
import { DimensionalHero } from '@/components/closet/DimensionalHero';
import { GlassSheet } from '@/components/GlassSheet';
import { useTheme } from '@/lib/theme';

import {
  MonthlyLimitError,
  NoAvatarError,
  NoGarmentsError,
  PlusRequiredError,
  TryonUnavailableError,
  fetchTryon,
  generateTryon,
} from '@/components/avatar/api';

/** The sheet's own view state — orthogonal to the underlying TryonState. */
type Phase =
  | 'checking' // reading cached state on open
  | 'running' // a render is in flight (POST + poll)
  | 'complete' // a render is showing (may be stale — see `result.stale`)
  | 'noGarments' // nothing renderable in this outfit (terminal, no retry)
  | 'monthlyLimit' // the monthly render cap was hit (calm pause)
  | 'unavailable' // the feature is off server-side (dormant beat)
  | 'failed'; // a retryable failure

interface TryOnSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The saved outfit to render — must be a persisted outfit id. */
  readonly outfitId: string;
  /** The user isn't Era+ — parent closes and routes to the paywall. */
  readonly onNeedsPlus: () => void;
  /** The user has no avatar yet — parent closes and routes to onboarding. */
  readonly onNeedsAvatar: () => void;
}

export function TryOnSheet({ open, onClose, outfitId, onNeedsPlus, onNeedsAvatar }: TryOnSheetProps) {
  const { colors } = useTheme();
  const [phase, setPhase] = useState<Phase>('checking');
  const [result, setResult] = useState<TryonState | null>(null);
  const [limit, setLimit] = useState<{ used: number | null; limit: number | null } | null>(null);

  // Mirrors `open` for the async guards: a POST/poll that settles after the sheet
  // closes must not write state (the sheet stays mounted, so a stale write would
  // otherwise land silently). Checked at every await boundary via `alive()`.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  const alive = useCallback(() => openRef.current, []);

  // Translate a thrown error into the right terminal phase or parent hand-off.
  const settleError = useCallback(
    (error: unknown) => {
      if (error instanceof PlusRequiredError) {
        onNeedsPlus();
        return;
      }
      if (error instanceof NoAvatarError) {
        onNeedsAvatar();
        return;
      }
      if (!alive()) return;
      if (error instanceof NoGarmentsError) {
        setPhase('noGarments');
      } else if (error instanceof MonthlyLimitError) {
        setLimit({ used: error.used, limit: error.limit });
        setPhase('monthlyLimit');
      } else if (error instanceof TryonUnavailableError) {
        setPhase('unavailable');
      } else {
        setPhase('failed');
      }
    },
    [alive, onNeedsPlus, onNeedsAvatar],
  );

  // Spend a credit: POST the render (with poll fallback) and settle. Used for the
  // first view, an explicit stale "Update render", and a failure retry.
  //
  // Honesty gate (Axiom): the "Dressing your avatar…" copy only appears once the
  // request has survived the server's gate checks — a 403 plus_required / 409
  // no_avatar rejects near-instantly (before any vendor call), so we hold the
  // neutral checking spinner through a short grace window. A free user sees
  // spinner → paywall with no false progress; a real render flips to the patient
  // copy ~2.5s in and keeps it for the long haul.
  const startRender = useCallback(async () => {
    if (alive()) setPhase('checking');
    const promoteToRunning = setTimeout(() => {
      if (alive()) setPhase('running');
    }, 2_500);
    try {
      const state = await generateTryon(outfitId);
      clearTimeout(promoteToRunning);
      if (!alive()) return;
      if (state.status === 'complete') {
        setResult(state);
        setPhase('complete');
      } else {
        setPhase('failed');
      }
    } catch (error) {
      clearTimeout(promoteToRunning);
      settleError(error);
    }
  }, [alive, outfitId, settleError]);

  // On open: read cached state first (no spend), then decide. Re-runs each time the
  // sheet is opened; a mid-flight settle after close is dropped by the `alive` guard.
  const ranForOpen = useRef(false);
  useEffect(() => {
    if (!open) {
      ranForOpen.current = false;
      return;
    }
    if (ranForOpen.current) return;
    ranForOpen.current = true;

    void (async () => {
      setPhase('checking');
      setLimit(null);
      let cached: TryonState | null = null;
      try {
        cached = await fetchTryon(outfitId);
      } catch {
        cached = null; // unreadable — fall through to a render, which surfaces the real error
      }
      if (!alive()) return;
      if (cached && cached.status === 'complete') {
        // Cached render — show instantly (stale flag drives the update prompt). No spend.
        setResult(cached);
        setPhase('complete');
        return;
      }
      if (cached && cached.status === 'running') {
        // A render is already in flight server-side — resume it via startRender's
        // poll fallback (the POST returns 409 already_running → poll, no double spend).
        void startRender();
        return;
      }
      // none / failed / unreadable → the tap is the intent to render.
      void startRender();
    })();
  }, [open, outfitId, alive, startRender]);

  return (
    // busy: floats over try-on render imagery → AA scrim tint.
    <GlassSheet open={open} onClose={onClose} busy>
      <Body
        phase={phase}
        result={result}
        limit={limit}
        open={open}
        colors={colors}
        onUpdate={() => void startRender()}
        onRetry={() => void startRender()}
      />
    </GlassSheet>
  );
}

interface BodyProps {
  readonly phase: Phase;
  readonly result: TryonState | null;
  readonly limit: { used: number | null; limit: number | null } | null;
  readonly open: boolean;
  readonly colors: ReturnType<typeof useTheme>['colors'];
  readonly onUpdate: () => void;
  readonly onRetry: () => void;
}

function Body({ phase, result, open, colors, onUpdate, onRetry }: BodyProps) {
  if (phase === 'checking') {
    return <Centered><OviLoader variant="page" /></Centered>;
  }

  if (phase === 'running') {
    return (
      <Centered>
        {/* Ovi's orb breathing beside the render progress line (kept as-is). */}
        <OviLoader variant="page" />
        <Line color={colors.secondaryStrong}>{strings.tryon.rendering}</Line>
      </Centered>
    );
  }

  if (phase === 'complete' && result && result.imageUrl) {
    const partial = result.garmentsRendered < result.garmentsTotal;
    return (
      <View style={styles.result}>
        <DimensionalHero
          uri={result.imageUrl}
          active={open}
          accessibilityLabel={strings.tryon.seeItOnYou}
          style={styles.hero}
        />
        {partial ? (
          <Line color={colors.secondary}>
            {strings.tryon.partial(result.garmentsRendered, result.garmentsTotal)}
          </Line>
        ) : null}
        {result.stale ? (
          <View style={styles.staleBlock}>
            <Line color={colors.secondaryStrong}>{strings.tryon.stale}</Line>
            <Button label={strings.tryon.updateRender} variant="secondary" onPress={onUpdate} />
          </View>
        ) : null}
      </View>
    );
  }

  if (phase === 'monthlyLimit') {
    return (
      <Centered>
        <Line color={colors.secondaryStrong}>{strings.tryon.monthlyLimit}</Line>
      </Centered>
    );
  }

  if (phase === 'noGarments') {
    return (
      <Centered>
        <Line color={colors.secondaryStrong}>{strings.tryon.noGarments}</Line>
      </Centered>
    );
  }

  if (phase === 'unavailable') {
    return (
      <Centered>
        <Line color={colors.secondaryStrong}>{strings.tryon.unavailable}</Line>
      </Centered>
    );
  }

  // failed (or a complete render with no imageUrl — treat as a retryable miss).
  return (
    <Centered>
      <Line color={colors.text}>{strings.tryon.failed}</Line>
      <Button label={strings.errors.retry} variant="secondary" onPress={onRetry} />
    </Centered>
  );
}

function Centered({ children }: { readonly children: ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

function Line({ color, children }: { readonly color: string; readonly children: string }) {
  return (
    <Text accessibilityLiveRegion="polite" variant="body" color={color} style={{ textAlign: 'center' }}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s4,
    padding: spacing.s4,
  },
  result: {
    flex: 1,
    gap: spacing.s3,
  },
  hero: {
    flex: 1,
    width: '100%',
  },
  staleBlock: {
    gap: spacing.s2,
  },
});
