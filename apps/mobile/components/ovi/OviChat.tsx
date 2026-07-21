/**
 * OviChat — the frosted sheet where Ovi actually speaks.
 *
 * Opens from the Ovi FAB into a {@link GlassSheet} sized to a 3/4-height glass
 * panel (`layout.oviPanel.sheetFraction`) — taller than the generic sheet, but
 * never full-screen: the top of the app always shows through, with no tinted
 * scrim behind it. The sheet rises on the gentle spring while a soft glow blooms
 * from the FAB corner. A quiet header carries the state-bound orb, Ovi's name in
 * the serif accent, and a close; below it a scrolling thread of user bubbles and
 * Ovi's editorial replies, four quick-intent chips, and a text input.
 *
 * Sending posts the conversation to `/api/ovi-chat`; while Ovi thinks a soft
 * indicator holds her place. The reply comes back as one blob and is revealed
 * CLIENT-side word by word (`motion.stream.wordMs`) with a soft cursor glow at
 * the insertion point — a tap skips to the full reply. The orb holds SPEAKING
 * for exactly the stream's duration. A styling turn comes back with a look,
 * rendered as an {@link OutfitProposalCard} built from the user's real cutouts —
 * Save persists it (accept event + toast), Not today dismisses it (reject event
 * + toast).
 *
 * The closet is fetched once per open to resolve a proposal's item ids to their
 * stored cutouts. The thread resets each time the sheet opens, so Ovi always
 * greets fresh. Bubbles and cards ease in gently and pin static under reduced
 * motion; sending, saving, and passing each carry the expected haptic.
 */
import { glass, glow, layout, motion as motionTokens, radii, spacing } from '@era/tokens';
import type { OviIntent, ProposedOutfit } from '@era/core/ovi';
import { strings } from '@era/core/strings';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { StaggerItem } from '@/components/StaggerItem';
import { Text } from '@/components/Text';
import { analytics, trackOnce } from '@/lib/analytics';
import { Chip } from '@/components/Chip';
import { GlassSheet } from '@/components/GlassSheet';
import { Press } from '@/components/Press';
import { Input } from '@/components/Input';
import { Toast } from '@/components/closet/Toast';
import { fetchItems } from '@/components/items/api';
import { tokenEasing, useReducedMotionSafe } from '@/lib/motion';
import { useTheme } from '@/lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { chatWithOvi, acceptOutfit, rejectOutfit, type OviChatMessage } from './api';
import { OutfitProposalCard, type ProposalStatus } from './OutfitProposalCard';
import { OviOrb } from './OviOrb';
import { useOviState } from './OviState';

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
  /**
   * Assistant turns reveal word-by-word: `streaming` is true while words are
   * still landing (drives the cursor glow + holds the card back until done).
   */
  streaming?: boolean;
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
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  // Ovi's shared living state — drives the panel orb here and the corner FAB.
  const ovi = useOviState();

  const [entries, setEntries] = useState<readonly ChatEntry[]>([]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // id -> resolved cutout URL, for turning a proposal's item ids into images.
  const imagesRef = useRef<Map<string, string>>(new Map());
  // The live word-stream timer chain — held in a ref so it survives re-renders
  // and can be cancelled (unmount, next send, or a skip tap).
  const streamTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearStream = useCallback(() => {
    if (streamTimer.current) {
      clearTimeout(streamTimer.current);
      streamTimer.current = null;
    }
  }, []);

  // Fresh thread on each open: seed Ovi's opener and load the closet's cutouts.
  useEffect(() => {
    if (!open) return;
    setEntries([{ id: nextId(), role: 'assistant', content: strings.ovi.chatOpener }]);
    setDraft('');
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
      // Leaving the panel settles Ovi so the corner orb never stays mid-thought,
      // and kills any in-flight word stream.
      clearStream();
      ovi.setThinking(false);
    };
  }, [open, clearStream]);

  const resolveImages = useCallback((outfit: ProposedOutfit): string[] => {
    const map = imagesRef.current;
    const urls: string[] = [];
    for (const id of outfit.itemIds) {
      const url = map.get(id);
      if (url) urls.push(url);
    }
    return urls;
  }, []);

  /**
   * Reveal an assistant reply word-by-word on the token cadence, driving the orb
   * to SPEAKING for the reveal's exact duration and dropping the cursor when the
   * last word lands. Under reduced motion the whole reply lands at once with a
   * brief speaking pulse. Returns after scheduling; the chain lives in the ref.
   */
  const streamReply = useCallback(
    (id: string, full: string) => {
      clearStream();
      ovi.startSpeaking();
      scrollRef.current?.scrollToEnd({ animated: !reduced });

      // Reduced motion: no typewriter — the full reply, a beat of speaking, done.
      if (reduced) {
        setEntries((prev) =>
          prev.map((e) => (e.id === id ? { ...e, content: full, streaming: false } : e)),
        );
        streamTimer.current = setTimeout(() => {
          streamTimer.current = null;
          ovi.stopSpeaking();
        }, motionTokens.durations.reducedFadeMs);
        return;
      }

      const words = full.split(/(\s+)/); // keep whitespace tokens so spacing is exact
      let shown = 0;
      const tick = () => {
        shown += 1;
        const partial = words.slice(0, shown).join('');
        const done = shown >= words.length;
        setEntries((prev) =>
          prev.map((e) => (e.id === id ? { ...e, content: partial, streaming: !done } : e)),
        );
        scrollRef.current?.scrollToEnd({ animated: false });
        if (done) {
          streamTimer.current = null;
          ovi.stopSpeaking();
          return;
        }
        streamTimer.current = setTimeout(tick, motionTokens.stream.wordMs);
      };
      streamTimer.current = setTimeout(tick, motionTokens.stream.wordMs);
    },
    [clearStream, ovi, reduced],
  );

  /** Skip a running reveal to the full reply — a tap anywhere on a live turn. */
  const skipStream = useCallback(
    (entry: ChatEntry, full: string) => {
      if (!entry.streaming) return;
      clearStream();
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, content: full, streaming: false } : e)),
      );
      ovi.stopSpeaking();
    },
    [clearStream, ovi],
  );

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
      setThinking(true);
      ovi.setThinking(true);

      void chatWithOvi({
        messages: payload,
        intent,
        itemContext: intent === 'style_item' ? itemContext : undefined,
      })
        .then((result) => {
          const outfit = result.outfit ?? undefined;
          const id = nextId();
          // The turn mounts EMPTY and streams in. streamReply calls startSpeaking
          // as the first word lands, so the orb crosses straight from thinking to
          // speaking — the shared THINKING state is only cleared here on error;
          // the finally below just re-enables the composer.
          setEntries((prev) => [
            ...prev,
            {
              id,
              role: 'assistant',
              content: '',
              outfit,
              images: outfit ? resolveImages(outfit) : undefined,
              intent: outfit ? intent : undefined,
              status: outfit ? 'idle' : undefined,
              streaming: true,
            },
          ]);
          streamReply(id, result.reply);
        })
        .catch(() => {
          setEntries((prev) => [
            ...prev,
            { id: nextId(), role: 'assistant', content: CHAT_ERROR },
          ]);
          ovi.setThinking(false);
        })
        .finally(() => setThinking(false));
    },
    [thinking, itemContext, resolveImages, streamReply, ovi],
  );

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
    <GlassSheet
      open={open}
      onClose={onClose}
      heightFraction={layout.oviPanel.sheetFraction}
      transparentScrim
      glowBloom
      bloomFromCorner
      dismissAffordance="none"
    >
      <KeyboardAvoidingView
        // The sheet is bottom-attached, so the composer must clear the home
        // indicator: the safe-area bottom inset plus one rhythm step of air.
        style={[styles.root, { paddingBottom: insets.bottom + spacing.s3 }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header: the 28px living orb bound to Ovi's state, her name in the serif
            accent, and a quiet close. The orb is decorative (the thread carries the
            accessible content); the name reads for screen readers. */}
        <View style={styles.header}>
          <View style={styles.headerLead}>
            {/* The living orb is decorative — the name beside it carries the header
                for screen readers, so the orb stays out of the a11y tree. */}
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <OviOrb state={ovi.state} size="headerPx" />
            </View>
            <Text variant="oviAccent" color={colors.text} accessibilityRole="header">
              Ovi
            </Text>
          </View>
          {/* Quiet close — mirrors the web panel: the `common.cancel` label and the
              same `×` glyph, at the secondary-strong colour. */}
          <Press
            accessibilityRole="button"
            accessibilityLabel={strings.common.cancel}
            onPress={onClose}
            style={styles.close}
          >
            <Text variant="ui" size="title3" color={colors.secondary}>
              ×
            </Text>
          </Press>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.thread}
          contentContainerStyle={styles.threadContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: !reduced })}
        >
          {entries.map((entry) => (
            <Turn
              key={entry.id}
              entry={entry}
              onSave={onSave}
              onReject={onReject}
              onOpen={openSaved}
              onSkip={skipStream}
            />
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
          <Chip glass label={strings.ovi.intentChips.today} onToggle={() => send(strings.ovi.intentChips.today, 'today')} />
          {itemContext ? (
            <Chip glass label={strings.ovi.intentChips.styleItem} onToggle={() => send(strings.ovi.intentChips.styleItem, 'style_item')} />
          ) : null}
          <Chip glass label={strings.ovi.intentChips.whatsMissing} onToggle={() => send(strings.ovi.intentChips.whatsMissing, 'whats_missing')} />
        </View>

        <View style={styles.composer}>
          <Input
            containerStyle={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={strings.ovi.chatPlaceholder}
            accessibilityLabel={strings.ovi.chatPlaceholder}
            returnKeyType="send"
            maxLength={2000}
            editable={!thinking}
            onSubmitEditing={() => send(draft, 'chat')}
          />
          <Press
            accessibilityRole="button"
            accessibilityLabel="Send"
            disabled={thinking || draft.trim().length === 0}
            onPress={() => send(draft, 'chat')}
            style={[
              styles.send,
              {
                backgroundColor: colors.accent,
                borderRadius: radii.input,
                opacity: thinking || draft.trim().length === 0 ? 0.5 : 1,
              },
            ]}
          >
            {/* The send affordance mirrors the web panel's primary button — the
                same `→` glyph on the accent fill. */}
            <Text variant="ui" size="title3" weight={600} color={colors.bg}>
              →
            </Text>
          </Press>
        </View>
      </KeyboardAvoidingView>

      <Toast message={toast} onHide={() => setToast(null)} bottom={spacing.s2} />
    </GlassSheet>
  );
}

/**
 * The streaming caret — a thin accent bar carrying the §3 glow at the insertion
 * point, so words look like they land under Ovi's light. Mirrors the web caret:
 * it blinks on the `stream.wordMs` cadence (opacity 1 → glow.caretDimOpacity → 1,
 * on the shared bezier). Reduced motion holds it steady at full opacity — no
 * blink — matching the web's reduced path.
 */
function StreamCaret() {
  const { colors, resolved } = useTheme();
  const reduced = useReducedMotionSafe();
  const blink = useSharedValue(1);

  useEffect(() => {
    if (reduced) {
      blink.value = 1;
      return;
    }
    // One 1 → dim → 1 cycle per wordMs, looping — the web caret's opacity keyframe
    // as a reversing timing loop (half the period each direction).
    blink.value = withRepeat(
      withTiming(glow.caretDimOpacity, {
        duration: motionTokens.stream.wordMs / 2,
        easing: tokenEasing,
      }),
      -1,
      true,
    );
  }, [reduced, blink]);

  const caretStyle = useAnimatedStyle(() => ({ opacity: blink.value }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.cursor,
        caretStyle,
        {
          backgroundColor: colors.accent,
          shadowColor: colors.accent,
          shadowRadius: glow.blurRadius,
          shadowOpacity: glow.opacity[resolved],
        },
      ]}
    />
  );
}

/**
 * One thread row. A user turn is a bubble on `surface`; an Ovi turn is a clean
 * editorial text block directly on the glass (no bubble chrome), with a soft
 * cursor glow at the insertion point while the reply is still streaming and, for
 * styling turns, the look beneath once the reveal completes. Tapping a streaming
 * Ovi turn skips to the full reply.
 */
function Turn({
  entry,
  onSave,
  onReject,
  onOpen,
  onSkip,
}: {
  readonly entry: ChatEntry;
  readonly onSave: (entry: ChatEntry) => void;
  readonly onReject: (entry: ChatEntry) => void;
  readonly onOpen: (outfitId: string) => void;
  readonly onSkip: (entry: ChatEntry, full: string) => void;
}) {
  const { colors } = useTheme();
  const mine = entry.role === 'user';
  // The card holds back until the reveal completes, so a look never appears above
  // its own half-streamed rationale.
  const showCard = entry.outfit && !entry.dismissed && !entry.streaming;

  if (mine) {
    return (
      <StaggerItem index={0}>
        <View
          style={[
            styles.bubble,
            styles.mine,
            {
              backgroundColor: colors.surface,
              borderColor: colors.hairline,
              borderRadius: radii.card,
            },
          ]}
        >
          <Text variant="body" color={colors.text}>
            {entry.content}
          </Text>
        </View>
      </StaggerItem>
    );
  }

  // Ovi: an editorial text block on the glass. While streaming, the whole block
  // is a tappable skip target and carries the cursor glow after the last word.
  const block = (
    <View style={styles.turn}>
      <View style={styles.oviText}>
        <Text variant="body" color={colors.text}>
          {entry.content}
        </Text>
        {entry.streaming ? <StreamCaret /> : null}
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
    </View>
  );

  return (
    <StaggerItem index={0}>
      {entry.streaming ? (
        <Pressable
          accessibilityLabel="Skip"
          accessibilityHint="Show the full reply"
          onPress={() => onSkip(entry, entry.content)}
        >
          {block}
        </Pressable>
      ) : (
        block
      )}
    </StaggerItem>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: spacing.s3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  close: {
    width: layout.touchTarget.ios,
    height: layout.touchTarget.ios,
    alignItems: 'center',
    justifyContent: 'center',
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
  // Ovi's reply: an editorial block on the glass — the text plus the trailing
  // cursor glow sit on one baseline row while streaming.
  oviText: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
  },
  // The soft insertion caret — a thin accent bar carrying the glow, matching the
  // web caret: 1px (the glass border width) × ~1em, `space-1` left margin, chip
  // radius. Colour + glow shadow are applied per-theme in StreamCaret.
  cursor: {
    width: glass.borderWidth,
    height: spacing.s3,
    marginLeft: spacing.s1,
    marginBottom: spacing.s1 / 2,
    borderRadius: radii.chip,
    shadowOffset: { width: 0, height: 0 },
  },
  bubble: {
    // Matches the web user bubble's 82% measure and its s3/s2 inline/block padding.
    maxWidth: '82%',
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s3,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
  },
  mine: {
    alignSelf: 'flex-end',
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
