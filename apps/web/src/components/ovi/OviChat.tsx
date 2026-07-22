'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { glow, motion as motionToken, typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import type { OviIntent } from '@era/core/ovi';
import { pressProps, transitionFor, useStagger, viewTransition } from '../../lib/motion';
import { glowShadow } from '../../lib/glow';
import { useTheme } from '../../lib/theme';
import { track } from '../../lib/analytics';
import { glassSurfaceStyle } from '../GlassPanel';
import { Chip } from '../Chip';
import { Input } from '../Input';
import { Button } from '../Button';
import { Text } from '../Text';
import { OutfitCard } from './OutfitCard';
import { OviOrb } from './OviOrb';
import { OviToast, OVI_TOAST_MS } from './OviToast';
import { useOviChat, type OviChatSeed } from './OviChatProvider';
import { sendOviChat } from './ovi-actions';
import type { ChatEntry, ItemsById } from './types';

export interface OviChatProps {
  /** A focal item id when the panel was opened to style a specific piece. */
  itemContext: string | null;
  /** Shared cutout lookup for resolving proposed outfits. */
  itemsById: ItemsById;
  /**
   * A one-shot ask to auto-send on open, set by an ambient {@link OviSuggestion}.
   * When present, the panel opens PRE-SEEDED: the seed message lands as the user's
   * turn and sends immediately at its intent, so a tapped suggestion resolves
   * straight into Ovi's answer. Null for a plainly-summoned panel (empty box).
   */
  seed: OviChatSeed | null;
  onClose: () => void;
}

/** Cap the transcript we send, matching the server's own bound. */
const MAX_HISTORY = 20;

/** Split a reply into stream tokens: words plus their trailing whitespace, so
 *  spacing survives the word-by-word reveal without extra layout work. */
function streamTokens(reply: string): string[] {
  return reply.match(/\S+\s*/g) ?? [];
}

/**
 * The floating glass panel — 420px wide, anchored bottom-right above the corner
 * orb's spot, capped at 72vh. Reuses the D0.4 glass recipe (`glassSurfaceStyle`)
 * so blur/tint/border/highlight never drift; e4 elevation, sheet radius. No
 * backdrop, no scrim — the page stays visible behind it. Bottom-anchored so it
 * blooms up from the corner where the orb lives.
 */
const panelStyle: CSSProperties = {
  ...glassSurfaceStyle(),
  position: 'fixed',
  right: 'var(--space-4)',
  bottom: 'calc(var(--space-4) + env(safe-area-inset-bottom))',
  // Fixed 420 on desktop; on narrow viewports it spans the width minus the
  // corner margins but never full width. Height is content-driven, capped at
  // 72vh — never full-screen.
  width: 'min(var(--ovi-panel-width), calc(100vw - var(--space-4) * 2))',
  maxHeight: 'var(--ovi-panel-max-height)',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  overflow: 'hidden',
  paddingInline: 'var(--space-4)',
  paddingBottom: 'var(--space-4)',
  zIndex: 60,
};

const rootStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  flex: 1,
  paddingTop: 'var(--space-2)',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
  paddingBottom: 'var(--space-3)',
};

const titleGroupStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
};

const closeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 'var(--touch-target-min)',
  minHeight: 'var(--touch-target-min)',
  border: 'none',
  background: 'transparent',
  color: 'var(--color-secondary-strong)',
  cursor: 'pointer',
  fontSize: typeRamp.title3.rem,
};

const listStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  paddingBlock: 'var(--space-2)',
};

const userBubbleStyle: CSSProperties = {
  alignSelf: 'flex-end',
  maxWidth: '82%',
  paddingInline: 'var(--space-3)',
  paddingBlock: 'var(--space-2)',
  borderRadius: 'var(--radius-card)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-hairline)',
  color: 'var(--color-text)',
};

// Ovi's replies are NOT bubbles — clean editorial text blocks straight on the
// glass, comfortable measure, no chrome.
const oviTurnStyle: CSSProperties = {
  alignSelf: 'stretch',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const oviTextStyle: CSSProperties = {
  margin: 0,
  maxWidth: '62ch',
  color: 'var(--color-text)',
};

const pendingTextStyle: CSSProperties = {
  ...oviTextStyle,
  color: 'var(--color-secondary-strong)',
};

const footerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  paddingTop: 'var(--space-3)',
};

const chipsRowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  overflowX: 'auto',
  paddingBottom: 'var(--space-1)',
};

const formStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: 'var(--space-2)',
};

/** The soft cursor caret at the streaming insertion point — a thin accent bar
 *  carrying the glow, so the words look like they're landing under Ovi's light. */
const cursorStyle: CSSProperties = {
  display: 'inline-block',
  width: 'var(--glass-border-width)',
  height: '1em',
  marginLeft: 'var(--space-1)',
  verticalAlign: 'text-bottom',
  borderRadius: 'var(--radius-chip)',
  background: 'var(--color-accent)',
};

/** A fresh id for a transcript entry. */
function entryId(): string {
  return crypto.randomUUID();
}

/** Selector for the corner summon orb, used to restore focus when the panel
 *  closes (the FAB re-mounts on close, so we re-find it by its label). */
const CORNER_ORB_SELECTOR = `[aria-label="${strings.ovi.fabLabel}"]`;

/**
 * The floating glass panel where Ovi speaks. A frosted card anchored bottom-
 * right that blooms up from the corner orb — a scrolling transcript (user turns
 * as quiet bubbles, Ovi's replies as editorial text on the glass, streamed word
 * by word), the canonical intent chips, and a glass input row. When a reply
 * carries a look, its OutfitCard renders inline. The page stays visible behind
 * it — no backdrop, no scrim. Esc / the close button / a click outside dismiss;
 * focus is trapped while open and returns to the orb on close.
 */
export function OviChat({ itemContext, itemsById, seed, onClose }: OviChatProps) {
  const reduced = useReducedMotion();
  const router = useRouter();
  const stagger = useStagger(reduced);
  const { resolved } = useTheme();
  const { oviState, setOviState } = useOviChat();
  const streamTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [messages, setMessages] = useState<ChatEntry[]>(() => [
    { id: entryId(), role: 'assistant', content: strings.ovi.chatOpener },
  ]);
  const [input, setInput] = useState('');
  const [pendingIntent, setPendingIntent] = useState<OviIntent | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Which entry is mid-stream, and how many words of it have landed so far.
  const [streaming, setStreaming] = useState<{ id: string; shown: number } | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const baseOpacity = glow.opacity[resolved];

  // Keep the newest turn in view as the transcript grows or the stream advances.
  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, streaming]);

  // Auto-dismiss the toast, matching the shared timing.
  useEffect(() => {
    if (!toast) return;
    const handle = setTimeout(() => setToast(null), OVI_TOAST_MS);
    return () => clearTimeout(handle);
  }, [toast]);

  // Escape closes the panel, as expected of a modal-ish dialog.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Click-outside closes — via a plain document listener (no tinted layer), so
  // the page behind stays fully visible and interactive right up to the tap.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const root = panelRef.current;
      if (root && !root.contains(event.target as Node)) onClose();
    };
    // Defer binding a tick so the opening tap doesn't immediately close it.
    const handle = setTimeout(
      () => document.addEventListener('pointerdown', onPointerDown),
      0,
    );
    return () => {
      clearTimeout(handle);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [onClose]);

  // Move focus into the panel on open, and return it to the corner orb on close
  // (the FAB re-mounts on close, so it's re-found by its label).
  useEffect(() => {
    inputRef.current?.focus();
    return () => {
      const orb = document.querySelector<HTMLElement>(CORNER_ORB_SELECTOR);
      orb?.focus();
    };
  }, []);

  // Trap Tab focus within the panel while it's open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const root = panelRef.current;
      if (!root) return;
      const focusable = root.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const enabled = Array.from(focusable).filter(
        (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
      );
      const first = enabled[0];
      const last = enabled[enabled.length - 1];
      if (!first || !last) return;
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Clear any in-flight stream timer on unmount so a late tick never fires
  // against a closed panel.
  useEffect(() => {
    return () => {
      if (streamTimer.current) clearTimeout(streamTimer.current);
    };
  }, []);

  /**
   * Reveal a reply word by word at the token cadence, holding the orb in
   * SPEAKING for exactly the reveal's length, then settling to IDLE. Under
   * reduced motion the whole reply shows at once with a brief speaking pulse.
   * The returned settle handle is tracked so a tap-to-skip or unmount cancels it.
   */
  const startStream = useCallback(
    (id: string, reply: string) => {
      if (streamTimer.current) clearTimeout(streamTimer.current);
      const tokens = streamTokens(reply);
      setOviState('speaking');

      if (reduced || tokens.length <= 1) {
        setStreaming(null);
        // A brief speaking pulse only — one speaking beat, then settle.
        streamTimer.current = setTimeout(
          () => setOviState('idle'),
          reduced ? motionToken.stream.wordMs : 0,
        );
        return;
      }

      setStreaming({ id, shown: 1 });
      const tick = (shown: number) => {
        if (shown >= tokens.length) {
          setStreaming(null);
          setOviState('idle');
          return;
        }
        streamTimer.current = setTimeout(() => {
          setStreaming({ id, shown: shown + 1 });
          tick(shown + 1);
        }, motionToken.stream.wordMs);
      };
      tick(1);
    },
    [reduced, setOviState],
  );

  /** Complete the in-flight stream instantly (a tap on the streaming block). */
  const skipStream = useCallback(() => {
    if (streamTimer.current) clearTimeout(streamTimer.current);
    setStreaming(null);
    setOviState('idle');
  }, [setOviState]);

  const send = useCallback(
    async (text: string, intent: OviIntent) => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || busy) return;

      // The user is sending Ovi a message — a funnel activation moment. Only the
      // coarse intent rides along; the message text is never attached.
      track('ovi_message', { intent });

      const outgoing = [
        ...messages
          .filter((entry) => !entry.pending)
          .map((entry) => ({ role: entry.role, content: entry.content })),
        { role: 'user' as const, content: trimmed },
      ].slice(-MAX_HISTORY);

      const userEntry: ChatEntry = { id: entryId(), role: 'user', content: trimmed };
      const pendingEntry: ChatEntry = {
        id: entryId(),
        role: 'assistant',
        content: strings.ovi.thinking,
        pending: true,
      };
      setMessages((prev) => [...prev, userEntry, pendingEntry]);
      setBusy(true);
      // The orb shimmers while the reply is in flight — including the corner orb,
      // which reads this same state off the provider.
      setOviState('thinking');

      const res = await sendOviChat({
        messages: outgoing,
        intent,
        itemContext: intent === 'style_item' ? itemContext : undefined,
      });

      setBusy(false);
      const reply = res ? res.reply : strings.errors.generic;
      setMessages((prev) =>
        prev.map((entry) =>
          entry.id === pendingEntry.id
            ? res
              ? {
                  id: entry.id,
                  role: 'assistant',
                  content: res.reply,
                  outfit: res.outfit,
                  weather: res.weather,
                  intent,
                }
              : { id: entry.id, role: 'assistant', content: strings.errors.generic }
            : entry,
        ),
      );

      // Client-side word stream: the reply landed as one blob, so reveal it word
      // by word and hold SPEAKING for exactly that window.
      startStream(pendingEntry.id, reply);
    },
    [busy, messages, itemContext, setOviState, startStream],
  );

  // Pre-seeded open (ambient suggestion): fire the seed ask exactly once as the
  // panel mounts, so a tapped strip lands the user in Ovi's answer. The ref guards
  // against a re-fire if `send` re-identifies while the reply is in flight.
  const seedFired = useRef(false);
  useEffect(() => {
    if (!seed || seedFired.current) return;
    seedFired.current = true;
    void send(seed.message, seed.intent);
  }, [seed, send]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const intent: OviIntent = pendingIntent ?? 'chat';
    void send(input, intent);
    setInput('');
    setPendingIntent(null);
  }

  function dismissOutfit(id: string) {
    setToast(strings.ovi.rejected);
    setMessages((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, outfit: null } : entry)),
    );
  }

  function openSavedOutfit(outfitId: string) {
    viewTransition(() => router.push(`/design/canvas?outfit=${outfitId}`));
    onClose();
  }

  // The opening choreography: a gentle spring rise blooming FROM the orb —
  // transform-origin bottom-right, scale up from 0.96, glow bloom ramping in.
  // Reduced motion collapses to a plain 150ms fade.
  const restShadow = glowShadow(baseOpacity);
  const bloomShadow = glowShadow(baseOpacity + glow.pulse.amount);
  const enter = reduced
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1, boxShadow: restShadow },
        exit: { opacity: 0 },
      }
    : {
        initial: {
          opacity: 0,
          scale: motionToken.stagger.bloomScale,
          y: motionToken.stagger.riseYPx,
          boxShadow: restShadow,
        },
        animate: { opacity: 1, scale: 1, y: 0, boxShadow: bloomShadow },
        exit: { opacity: 0, scale: motionToken.stagger.bloomScale, y: motionToken.stagger.riseYPx },
      };

  return (
    <>
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="ovi-chat-title"
        style={{ ...panelStyle, transformOrigin: 'bottom right' }}
        initial={enter.initial}
        animate={enter.animate}
        exit={enter.exit}
        transition={transitionFor(motionToken.springs.gentle, reduced)}
      >
        <div style={rootStyle}>
          <header style={headerStyle}>
            <div style={titleGroupStyle}>
              {/* The constant presence: the header orb, state-bound so it
                  shimmers while thinking and speaks exactly as the words land. */}
              <OviOrb size="header" state={oviState} />
              <Text variant="oviAccent" as="h2" id="ovi-chat-title" style={{ margin: 0 }}>
                {strings.ovi.fabLabel.split(',')[0]}
              </Text>
            </div>
            <motion.button
              type="button"
              style={closeStyle}
              aria-label={strings.common.cancel}
              onClick={onClose}
              {...pressProps(reduced)}
            >
              <span aria-hidden="true">×</span>
            </motion.button>
          </header>

          <div ref={listRef} style={listStyle}>
            {messages.map((entry) =>
              entry.role === 'user' ? (
                <motion.div
                  key={entry.id}
                  style={{ ...userBubbleStyle, margin: 0 }}
                  variants={stagger.item}
                  initial="hidden"
                  animate="visible"
                >
                  <Text variant="body" as="p" style={{ margin: 0, color: 'inherit' }}>
                    {entry.content}
                  </Text>
                </motion.div>
              ) : (
                <OviReply
                  key={entry.id}
                  entry={entry}
                  itemsById={itemsById}
                  variants={stagger.item}
                  streamingShown={
                    streaming && streaming.id === entry.id ? streaming.shown : null
                  }
                  onSkip={skipStream}
                  onSaved={setToast}
                  onDismissed={() => dismissOutfit(entry.id)}
                  onOpen={openSavedOutfit}
                />
              ),
            )}
          </div>

          <footer style={footerStyle}>
            <div style={chipsRowStyle}>
              <Chip
                glass
                disabled={busy}
                onClick={() => void send(strings.ovi.intentChips.today, 'today')}
              >
                {strings.ovi.intentChips.today}
              </Chip>
              {itemContext ? (
                <Chip
                  glass
                  disabled={busy}
                  onClick={() => void send(strings.ovi.intentChips.styleItem, 'style_item')}
                >
                  {strings.ovi.intentChips.styleItem}
                </Chip>
              ) : null}
              <Chip
                glass
                disabled={busy}
                onClick={() => void send(strings.ovi.intentChips.whatsMissing, 'whats_missing')}
              >
                {strings.ovi.intentChips.whatsMissing}
              </Chip>
            </div>

            <form style={formStyle} onSubmit={onSubmit}>
              <div style={{ flex: 1 }}>
                <Input
                  ref={inputRef}
                  aria-label={strings.ovi.chatPlaceholder}
                  placeholder={strings.ovi.chatPlaceholder}
                  value={input}
                  maxLength={2000}
                  onChange={(event) => setInput(event.target.value)}
                />
              </div>
              <Button
                type="submit"
                variant="primary"
                aria-label={strings.common.continue}
                disabled={busy || input.trim().length === 0}
              >
                <span aria-hidden="true">→</span>
              </Button>
            </form>
          </footer>
        </div>
      </motion.div>

      <AnimatePresence>{toast ? <OviToast message={toast} /> : null}</AnimatePresence>
    </>
  );
}

interface OviReplyProps {
  entry: ChatEntry;
  itemsById: ItemsById;
  variants: ReturnType<typeof useStagger>['item'];
  /** Word count revealed so far while this entry streams; null when not streaming. */
  streamingShown: number | null;
  onSkip: () => void;
  onSaved: (message: string) => void;
  onDismissed: () => void;
  onOpen: (outfitId: string) => void;
}

/**
 * One of Ovi's turns — editorial text on the glass (no bubble), streamed word by
 * word with a soft cursor glow at the insertion point, and any proposed look as
 * a real composed OutfitCard below. A tap on the streaming text completes it.
 */
function OviReply({
  entry,
  itemsById,
  variants,
  streamingShown,
  onSkip,
  onSaved,
  onDismissed,
  onOpen,
}: OviReplyProps) {
  const tokens = useMemo(() => streamTokens(entry.content), [entry.content]);
  const isStreaming = streamingShown !== null;
  const shownText = isStreaming ? tokens.slice(0, streamingShown).join('') : entry.content;

  return (
    <motion.div style={oviTurnStyle} variants={variants} initial="hidden" animate="visible">
      <Text
        variant="body"
        as="p"
        style={entry.pending ? pendingTextStyle : oviTextStyle}
        onClick={isStreaming ? onSkip : undefined}
      >
        {shownText}
        {isStreaming ? (
          <motion.span
            aria-hidden="true"
            style={cursorStyle}
            animate={{ opacity: [1, glow.caretDimOpacity, 1] }}
            transition={{
              duration: motionToken.stream.wordMs / 1000,
              repeat: Infinity,
              ease: motionToken.easing.bezier,
            }}
          />
        ) : null}
      </Text>
      <AnimatePresence>
        {entry.outfit ? (
          <OutfitCard
            outfit={entry.outfit}
            itemsById={itemsById}
            intent={entry.intent}
            weatherLead={
              entry.weather
                ? strings.ovi.weatherLine(entry.weather.tempC, entry.weather.condition)
                : null
            }
            onSaved={onSaved}
            onDismissed={onDismissed}
            onOpen={onOpen}
          />
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
