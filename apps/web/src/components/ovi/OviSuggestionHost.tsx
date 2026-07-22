'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { strings } from '@era/core/strings';
import type { OviIntent, OviSuggestion as OviSuggestionData } from '@era/core/ovi';
import { OviSuggestion, isSuggestionDismissed } from './OviSuggestion';
import { useOviChat, type OviChatSeed } from './OviChatProvider';

export interface OviSuggestionHostProps {
  /** The composed suggestion for this surface, or null when Ovi has nothing honest to say. */
  suggestion: OviSuggestionData | null;
}

/**
 * The canonical ask a suggestion opens Ovi PRE-SEEDED with — the intent chip's
 * own wording, spoken on the user's behalf. This is the "pre-arm the input with
 * the intent chip's ask and auto-send" reading of "pre-seeded": tapping the strip
 * lands the user directly in Ovi's answer rather than an empty box.
 */
function seedFor(suggestion: OviSuggestionData): OviChatSeed {
  const message = askForIntent(suggestion.intent);
  return { intent: suggestion.intent, message };
}

function askForIntent(intent: OviIntent): string {
  switch (intent) {
    case 'style_item':
      return strings.ovi.intentChips.styleItem;
    case 'whats_missing':
      return strings.ovi.intentChips.whatsMissing;
    case 'style_for':
    case 'chat':
    case 'today':
    default:
      return strings.ovi.intentChips.today;
  }
}

/**
 * The single owner of a surface's ambient strip: enforces the "max ONE per screen"
 * and "stays dismissed" rules so each screen just hands it a suggestion.
 *
 * It filters the passed suggestion against the persisted dismissed-key set (SSR-
 * safe, read after mount so the server and first client paint agree), renders at
 * most one {@link OviSuggestion}, and on tap/action opens Ovi pre-seeded with the
 * suggestion's ask — carrying `itemContext` for an item suggestion so the panel's
 * "style this piece" path resolves the right piece. Both the tap and the × remove
 * the strip; the × additionally persists the dismissal (handled in the strip).
 */
export function OviSuggestionHost({ suggestion }: OviSuggestionHostProps) {
  const { openChat } = useOviChat();
  // Locally hidden once dismissed/opened this mount; the persisted set (checked
  // below) keeps it hidden across mounts.
  const [dismissedLocal, setDismissedLocal] = useState(false);
  // Read the persisted dismissed set after mount only — an SSR read would diverge
  // from the server's (empty) render and hydrate-mismatch. Until this resolves we
  // withhold the strip, so it can only ever appear for a not-yet-dismissed key.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const visible =
    hydrated && !dismissedLocal && suggestion !== null && !isSuggestionDismissed(suggestion.key);

  function handleOpen(s: OviSuggestionData) {
    setDismissedLocal(true);
    openChat({
      itemContext: s.itemId ?? undefined,
      seed: seedFor(s),
    });
  }

  return (
    <AnimatePresence>
      {visible && suggestion ? (
        <OviSuggestion
          key={suggestion.key}
          suggestion={suggestion}
          onOpen={handleOpen}
          onDismiss={() => setDismissedLocal(true)}
        />
      ) : null}
    </AnimatePresence>
  );
}
