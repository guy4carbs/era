'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { motion as motionToken, typeRamp } from '@era/tokens';
import { strings } from '@era/core/strings';
import type { OviIntent } from '@era/core/ovi';
import { pressProps, transitionFor, useStagger, viewTransition } from '../../lib/motion';
import { track } from '../../lib/analytics';
import { GlassSheet } from '../GlassSheet';
import { Chip } from '../Chip';
import { Input } from '../Input';
import { Button } from '../Button';
import { Text } from '../Text';
import { OutfitCard } from './OutfitCard';
import { OviToast, OVI_TOAST_MS } from './OviToast';
import { sendOviChat } from './ovi-actions';
import type { ChatEntry, ItemsById } from './types';

export interface OviChatProps {
  /** A focal item id when the sheet was opened to style a specific piece. */
  itemContext: string | null;
  /** Shared cutout lookup for resolving proposed outfits. */
  itemsById: ItemsById;
  onClose: () => void;
}

/** Cap the transcript we send, matching the server's own bound. */
const MAX_HISTORY = 20;

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'color-mix(in srgb, var(--color-ink) 45%, transparent)',
  zIndex: 45,
};

const rootStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: 0,
  paddingTop: 'var(--space-2)',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
  paddingBottom: 'var(--space-3)',
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
  background: 'color-mix(in srgb, var(--color-accent) 16%, transparent)',
  border: '1px solid var(--color-accent)',
  color: 'var(--color-text)',
};

const oviBubbleStyle: CSSProperties = {
  alignSelf: 'flex-start',
  maxWidth: '90%',
  paddingInline: 'var(--space-3)',
  paddingBlock: 'var(--space-2)',
  borderRadius: 'var(--radius-card)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-hairline)',
  color: 'var(--color-text)',
  boxShadow: 'var(--shadow-e1)',
};

const oviTurnStyle: CSSProperties = {
  alignSelf: 'stretch',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const pendingColorStyle: CSSProperties = { color: 'var(--color-secondary-strong)' };

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

/** A fresh id for a transcript entry. */
function entryId(): string {
  return crypto.randomUUID();
}

/**
 * The surface where Ovi actually speaks. A frosted full-height sheet with a
 * scrolling transcript (user right, Ovi left in a soft card), the four intent
 * quick-starts, and a text input. When a reply carries a look, its OutfitCard
 * renders inline in Ovi's turn — the payoff, built from the wearer's own
 * cutouts, with Save / Not today. Opens over a tap-to-dismiss backdrop.
 */
export function OviChat({ itemContext, itemsById, onClose }: OviChatProps) {
  const reduced = useReducedMotion();
  const router = useRouter();
  const stagger = useStagger(reduced);

  const [messages, setMessages] = useState<ChatEntry[]>(() => [
    { id: entryId(), role: 'assistant', content: strings.ovi.chatOpener },
  ]);
  const [input, setInput] = useState('');
  const [pendingIntent, setPendingIntent] = useState<OviIntent | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the newest turn in view as the transcript grows.
  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages]);

  // Auto-dismiss the toast, matching the shared timing.
  useEffect(() => {
    if (!toast) return;
    const handle = setTimeout(() => setToast(null), OVI_TOAST_MS);
    return () => clearTimeout(handle);
  }, [toast]);

  // Escape closes the sheet, as expected of a modal dialog.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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

      const res = await sendOviChat({
        messages: outgoing,
        intent,
        itemContext: intent === 'style_item' ? itemContext : undefined,
      });

      setBusy(false);
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
    },
    [busy, messages, itemContext],
  );

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const intent: OviIntent = pendingIntent ?? 'chat';
    void send(input, intent);
    setInput('');
    setPendingIntent(null);
  }

  /** "Style me for…" arms the intent and hands the sentence to the user to finish. */
  function armStyleFor() {
    setPendingIntent('style_for');
    setInput(strings.ovi.intentChips.styleFor.replace('…', ' '));
    inputRef.current?.focus();
  }

  function dismissOutfit(entryId: string) {
    setToast(strings.ovi.rejected);
    setMessages((prev) =>
      prev.map((entry) => (entry.id === entryId ? { ...entry, outfit: null } : entry)),
    );
  }

  function openSavedOutfit(outfitId: string) {
    viewTransition(() => router.push(`/design/canvas?outfit=${outfitId}`));
    onClose();
  }

  return (
    <>
      <motion.div
        style={backdropStyle}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={transitionFor(motionToken.springs.gentle, reduced)}
        onClick={onClose}
      />
      <GlassSheet labelledBy="ovi-chat-title">
        <div style={rootStyle}>
          <header style={headerStyle}>
            <Text variant="title" size="title3" weight={700} as="h2" id="ovi-chat-title">
              {strings.ovi.fabLabel}
            </Text>
            <motion.button type="button" style={closeStyle} aria-label={strings.common.cancel} onClick={onClose} {...pressProps(reduced)}>
              <span aria-hidden="true">×</span>
            </motion.button>
          </header>

          <div ref={listRef} style={listStyle}>
            {messages.map((entry) =>
              entry.role === 'user' ? (
                // Each message rises + fades in as it enters (variant.visible as
                // initial/animate — messages append incrementally, so no container
                // orchestration; reduced motion collapses to the flat fade).
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
                <motion.div
                  key={entry.id}
                  style={oviTurnStyle}
                  variants={stagger.item}
                  initial="hidden"
                  animate="visible"
                >
                  <Text
                    variant="body"
                    as="p"
                    style={{
                      ...oviBubbleStyle,
                      margin: 0,
                      ...(entry.pending ? pendingColorStyle : null),
                    }}
                  >
                    {entry.content}
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
                        onSaved={setToast}
                        onDismissed={() => dismissOutfit(entry.id)}
                        onOpen={openSavedOutfit}
                      />
                    ) : null}
                  </AnimatePresence>
                </motion.div>
              ),
            )}
          </div>

          <footer style={footerStyle}>
            <div style={chipsRowStyle}>
              <Chip disabled={busy} onClick={() => void send(strings.ovi.intentChips.today, 'today')}>
                {strings.ovi.intentChips.today}
              </Chip>
              <Chip disabled={busy} selected={pendingIntent === 'style_for'} onClick={armStyleFor}>
                {strings.ovi.intentChips.styleFor}
              </Chip>
              {itemContext ? (
                <Chip
                  disabled={busy}
                  onClick={() => void send(strings.ovi.intentChips.styleItem, 'style_item')}
                >
                  {strings.ovi.intentChips.styleItem}
                </Chip>
              ) : null}
              <Chip
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
      </GlassSheet>

      <AnimatePresence>{toast ? <OviToast message={toast} /> : null}</AnimatePresence>
    </>
  );
}
