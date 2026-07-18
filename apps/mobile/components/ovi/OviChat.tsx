/**
 * OviChat — the frosted sheet where Ovi actually speaks.
 *
 * Opens from the Ovi FAB into a {@link GlassSheet}: a scrolling thread of user /
 * Ovi bubbles, four quick-intent chips, and a text input. Sending posts the
 * conversation to `/api/ovi-chat`; while Ovi thinks, a soft indicator holds her
 * place. A styling turn comes back with a look, rendered as an
 * {@link OutfitProposalCard} built from the user's real cutouts — Save persists
 * it (accept event + toast), Not today dismisses it (reject event + toast).
 *
 * The closet is fetched once per open to resolve a proposal's item ids to their
 * stored cutouts. The thread resets each time the sheet opens, so Ovi always
 * greets fresh. Bubbles and cards ease in gently and pin static under reduced
 * motion; sending, saving, and passing each carry the expected haptic.
 */
import { layout, motion as motionTokens, radii, spacing } from '@era/tokens';
import type { OviIntent, ProposedOutfit } from '@era/core/ovi';
import { strings } from '@era/core/strings';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { StaggerItem } from '@/components/StaggerItem';
import { Text } from '@/components/Text';
import { analytics, trackOnce } from '@/lib/analytics';
import { Chip } from '@/components/Chip';
import { GlassSheet } from '@/components/GlassSheet';
import { Press } from '@/components/Press';
import { Input } from '@/components/Input';
import { Toast } from '@/components/closet/Toast';
import { fetchItems } from '@/components/items/api';
import { useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

import { chatWithOvi, acceptOutfit, rejectOutfit, type OviChatMessage } from './api';
import { OutfitProposalCard, type ProposalStatus } from './OutfitProposalCard';

/** A rendered turn in the thread — text plus, for Ovi's styling turns, a look. */
interface ChatEntry {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  /** The look Ovi proposed on this turn (assistant styling turns only). */
  readonly outfit?: ProposedOutfit;
  /** Cutout URLs resolved from the outfit's item ids. */
  readonly images?: readonly string[];
  /** The intent that produced the look — echoed to the accept/reject event. */
  readonly intent?: OviIntent;
  /** The proposal card's lifecycle; `dismissed` hides a passed look. */
  status?: ProposalStatus;
  dismissed?: boolean;
  /** The saved outfit's id, set once accepted — makes the card tappable. */
  savedId?: string;
}

interface OviChatProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** A focal item id, when the chat is opened to style a specific piece. */
  readonly itemContext?: string;
}

let entryCounter = 0;
function nextId(): string {
  entryCounter += 1;
  return `ovi-${entryCounter}`;
}

/** Ovi's honest line when a turn can't reach the server — never a raw error. */
const CHAT_ERROR = "I lost my thread for a second — try me again.";

export function OviChat({ open, onClose, itemContext }: OviChatProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotionSafe();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);

  const [entries, setEntries] = useState<readonly ChatEntry[]>([]);
  const [draft, setDraft] = useState('');
  const [pendingIntent, setPendingIntent] = useState<OviIntent | null>(null);
  const [thinking, setThinking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // id -> resolved cutout URL, for turning a proposal's item ids into images.
  const imagesRef = useRef<Map<string, string>>(new Map());

  // Fresh thread on each open: seed Ovi's opener and load the closet's cutouts.
  useEffect(() => {
    if (!open) return;
    setEntries([{ id: nextId(), role: 'assistant', content: strings.ovi.chatOpener }]);
    setDraft('');
    setPendingIntent(null);
    setThinking(false);
    let active = true;
    void fetchItems()
      .then((items) => {
        if (!active) return;
        const map = new Map<string, string>();
        for (const item of items) {
          if (item.displayUrl) map.set(item.id, item.displayUrl);
        }
        imagesRef.current = map;
      })
      .catch(() => {
        // A missing closet just means an empty collage; the reply still lands.
      });
    return () => {
      active = false;
    };
  }, [open]);

  const resolveImages = useCallback((outfit: ProposedOutfit): string[] => {
    const map = imagesRef.current;
    const urls: string[] = [];
    for (const id of outfit.itemIds) {
      const url = map.get(id);
      if (url) urls.push(url);
    }
    return urls;
  }, []);

  const send = useCallback(
    (text: string, intent: OviIntent) => {
      const content = text.trim();
      if (content.length === 0 || thinking) return;
      // Funnel: the user sent a message to Ovi.
      analytics.track('ovi_message', { intent });
      void Haptics.selectionAsync();

      const userEntry: ChatEntry = { id: nextId(), role: 'user', content };
      // Snapshot the payload from the thread as it was, plus this user turn.
      let payload: OviChatMessage[] = [];
      setEntries((prev) => {
        const next = [...prev, userEntry];
        payload = next
          .filter((e) => e.content.length > 0)
          .slice(-20)
          .map((e) => ({ role: e.role, content: e.content }));
        return next;
      });
      setDraft('');
      setPendingIntent(null);
      setThinking(true);

      void chatWithOvi({
        messages: payload,
        intent,
        itemContext: intent === 'style_item' ? itemContext : undefined,
      })
        .then((result) => {
          const outfit = result.outfit ?? undefined;
          setEntries((prev) => [
            ...prev,
            {
              id: nextId(),
              role: 'assistant',
              content: result.reply,
              outfit,
              images: outfit ? resolveImages(outfit) : undefined,
              intent: outfit ? intent : undefined,
              status: outfit ? 'idle' : undefined,
            },
          ]);
        })
        .catch(() => {
          setEntries((prev) => [
            ...prev,
            { id: nextId(), role: 'assistant', content: CHAT_ERROR },
          ]);
        })
        .finally(() => setThinking(false));
    },
    [thinking, itemContext, resolveImages],
  );

  /** "Style me for…" arms the intent and prefills the sentence for the user to finish. */
  const armStyleFor = useCallback(() => {
    setPendingIntent('style_for');
    setDraft(strings.ovi.intentChips.styleFor.replace('…', ' '));
  }, []);

  const setStatus = useCallback((id: string, patch: Partial<ChatEntry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  /** Open a saved look on the canvas — the payoff after an accept. */
  const openSaved = useCallback(
    (outfitId: string) => {
      router.push(`/outfit-canvas?outfit=${outfitId}`);
      onClose();
    },
    [router, onClose],
  );

  const onSave = useCallback(
    (entry: ChatEntry) => {
      if (!entry.outfit) return;
      const { outfit } = entry;
      setStatus(entry.id, { status: 'saving' });
      void acceptOutfit({
        name: outfit.name,
        occasion: outfit.occasion,
        itemIds: outfit.itemIds,
        intent: entry.intent,
        rationale: outfit.rationale,
      })
        .then((saved) => {
          setStatus(entry.id, { status: 'saved', savedId: saved.id });
          setToast(strings.ovi.accepted);
          // Funnel: accepting a look persists an outfit too — count the first one
          // (best-effort once; dedupes with the canvas save).
          void trackOnce('first_outfit_saved');
        })
        .catch(() => {
          setStatus(entry.id, { status: 'idle' });
          setToast(CHAT_ERROR);
        });
    },
    [setStatus],
  );

  const onReject = useCallback(
    (entry: ChatEntry) => {
      if (!entry.outfit) return;
      const { outfit } = entry;
      void Haptics.selectionAsync();
      setStatus(entry.id, { dismissed: true });
      setToast(strings.ovi.rejected);
      void rejectOutfit({
        name: outfit.name,
        occasion: outfit.occasion,
        itemIds: outfit.itemIds,
        intent: entry.intent,
        rationale: outfit.rationale,
      }).catch(() => {
        // A dismissal is a pure signal; a failed event is not worth surfacing.
      });
    },
    [setStatus],
  );

  return (
    <GlassSheet open={open} onClose={onClose}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.thread}
          contentContainerStyle={styles.threadContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: !reduced })}
        >
          {entries.map((entry) => (
            <Bubble key={entry.id} entry={entry} onSave={onSave} onReject={onReject} onOpen={openSaved} />
          ))}
          {thinking ? (
            <Animated.View
              entering={reduced ? undefined : FadeIn.duration(motionTokens.durations.minMs)}
              style={styles.thinking}
            >
              <Text variant="oviAccent" size="subhead" color={colors.secondary}>
                {strings.ovi.thinking}
              </Text>
            </Animated.View>
          ) : null}
        </ScrollView>

        <View style={styles.chips}>
          <Chip label={strings.ovi.intentChips.today} onToggle={() => send(strings.ovi.intentChips.today, 'today')} />
          <Chip label={strings.ovi.intentChips.styleFor} selected={pendingIntent === 'style_for'} onToggle={armStyleFor} />
          {itemContext ? (
            <Chip label={strings.ovi.intentChips.styleItem} onToggle={() => send(strings.ovi.intentChips.styleItem, 'style_item')} />
          ) : null}
          <Chip label={strings.ovi.intentChips.whatsMissing} onToggle={() => send(strings.ovi.intentChips.whatsMissing, 'whats_missing')} />
        </View>

        <View style={styles.composer}>
          <Input
            containerStyle={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={strings.ovi.chatPlaceholder}
            returnKeyType="send"
            maxLength={2000}
            editable={!thinking}
            onSubmitEditing={() => send(draft, pendingIntent ?? 'chat')}
          />
          <Press
            accessibilityRole="button"
            accessibilityLabel="Send"
            disabled={thinking || draft.trim().length === 0}
            onPress={() => send(draft, pendingIntent ?? 'chat')}
            style={[
              styles.send,
              {
                backgroundColor: colors.accent,
                borderRadius: radii.input,
                opacity: thinking || draft.trim().length === 0 ? 0.5 : 1,
              },
            ]}
          >
            <Text variant="ui" size="title3" weight={600} color={colors.bg}>
              ↑
            </Text>
          </Press>
        </View>
      </KeyboardAvoidingView>

      <Toast message={toast} onHide={() => setToast(null)} bottom={spacing.s2} />
    </GlassSheet>
  );
}

/** One thread row: a text bubble, and for Ovi's styling turns, the look beneath. */
function Bubble({
  entry,
  onSave,
  onReject,
  onOpen,
}: {
  readonly entry: ChatEntry;
  readonly onSave: (entry: ChatEntry) => void;
  readonly onReject: (entry: ChatEntry) => void;
  readonly onOpen: (outfitId: string) => void;
}) {
  const { colors } = useTheme();
  const mine = entry.role === 'user';
  const showCard = entry.outfit && !entry.dismissed;

  return (
    // A new bubble rises + fades in via the token stagger entrance (§3: y 12→0 +
    // opacity on the gentle spring). Index 0 — chat appends one message at a
    // time, so a cascade delay would only lag the conversation; the entrance
    // choreography itself is the treatment. Reduced motion → 150ms fade.
    <StaggerItem index={0}>
      <Animated.View style={styles.turn}>
      <View
        style={[
          styles.bubble,
          mine ? styles.mine : styles.theirs,
          {
            backgroundColor: mine ? colors.accent : colors.surface,
            borderColor: colors.hairline,
            borderRadius: radii.card,
          },
        ]}
      >
        <Text variant="body" color={mine ? colors.bg : colors.text}>
          {entry.content}
        </Text>
      </View>

      {showCard && entry.outfit ? (
        <OutfitProposalCard
          outfit={entry.outfit}
          images={entry.images ?? []}
          status={entry.status ?? 'idle'}
          onSave={() => onSave(entry)}
          onReject={() => onReject(entry)}
          onOpen={entry.savedId ? () => onOpen(entry.savedId!) : undefined}
        />
      ) : null}
      </Animated.View>
    </StaggerItem>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: spacing.s3,
  },
  thread: {
    flex: 1,
  },
  threadContent: {
    gap: spacing.s3,
    paddingBottom: spacing.s2,
  },
  turn: {
    gap: spacing.s2,
  },
  bubble: {
    maxWidth: '86%',
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s3,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
  },
  mine: {
    alignSelf: 'flex-end',
  },
  theirs: {
    alignSelf: 'flex-start',
  },
  thinking: {
    alignSelf: 'flex-start',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s2,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  input: {
    flex: 1,
  },
  send: {
    width: layout.touchTarget.ios,
    height: layout.touchTarget.ios,
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
  },
});
