/**
 * MoreMenuSheet — the per-post safety menu Apple's UGC rules require on EVERY
 * post: report and block. All design-system chrome (GlassSheet, Chip, Input,
 * Button) — never `Alert.alert`, so the copy and voice stay Era's.
 *
 * Three views: the root (choose Report or Block), the report form (a single
 * reason chip from `REPORT_REASONS` + an optional ≤500-char detail → files the
 * report), and the block confirm (the one calm line about what a block does). On a
 * successful report the parent hides the post in place; on a successful block it
 * drops the creator's posts. Both are the point where the sheet hands control back
 * to {@link FeedProvider}; a failure surfaces inline and leaves the sheet open.
 */
import { REPORT_REASONS, type ReportReason } from '@era/core/feed';
import { strings } from '@era/core/strings';
import { spacing, typeRamp } from '@era/tokens';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { GlassSheet } from '@/components/GlassSheet';
import { Input } from '@/components/Input';
import { LimitReachedError } from '@/lib/rate-limit';
import { useTheme } from '@/lib/theme';

import type { FeedPostPayload } from '@era/core/feed';
import { block, report } from './api';

const DETAIL_MAX = 500;

type MenuView = 'root' | 'report' | 'block';

interface MoreMenuSheetProps {
  readonly post: FeedPostPayload | null;
  readonly onClose: () => void;
  readonly onReported: (postId: string) => void;
  readonly onBlocked: (username: string, currentPostId: string) => void;
}

export function MoreMenuSheet({ post, onClose, onReported, onBlocked }: MoreMenuSheetProps) {
  const { colors } = useTheme();
  const [view, setView] = useState<MenuView>('root');
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset to a clean root each time the sheet opens on a (new) post.
  useEffect(() => {
    if (post) {
      setView('root');
      setReason(null);
      setDetail('');
      setBusy(false);
      setError(null);
    }
  }, [post?.id]);

  if (!post) {
    return <GlassSheet open={false} onClose={onClose} />;
  }

  const creatorName = post.creator.displayName ?? post.creator.username;

  const errorLine = (e: unknown): string =>
    e instanceof LimitReachedError ? (e.serverMessage ?? strings.errors.generic) : strings.errors.generic;

  const submitReport = () => {
    if (!reason || busy) return;
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        await report({ postId: post.id, reason, detail: detail.trim() });
        onReported(post.id);
      } catch (e) {
        setError(errorLine(e));
        setBusy(false);
      }
    })();
  };

  const confirmBlock = () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        await block(post.creator.username);
        onBlocked(post.creator.username, post.id);
      } catch (e) {
        setError(errorLine(e));
        setBusy(false);
      }
    })();
  };

  return (
    <GlassSheet open={post !== null} onClose={onClose}>
      {view === 'root' ? (
        <View style={styles.rootActions}>
          <Button
            label={strings.feed.reportTitle}
            variant="secondary"
            onPress={() => setView('report')}
          />
          <Button
            label={strings.feed.blockTitle(creatorName)}
            variant="danger"
            onPress={() => setView('block')}
          />
        </View>
      ) : null}

      {view === 'report' ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={header(colors.text)}>
            {strings.feed.reportTitle}
          </Text>
          <View style={styles.chips}>
            {REPORT_REASONS.map((value) => (
              <Chip
                key={value}
                label={strings.feed.reportReasons[value]}
                selected={reason === value}
                accessibilityRole="radio"
                onToggle={() => setReason(value)}
              />
            ))}
          </View>
          <Input
            placeholder={strings.feed.reportDetailPlaceholder}
            value={detail}
            onChangeText={setDetail}
            maxLength={DETAIL_MAX}
            multiline
            editable={!busy}
          />
          {error ? <Text style={errorStyle(colors.danger)}>{error}</Text> : null}
          <Button
            label={strings.feed.reportSubmit}
            onPress={submitReport}
            disabled={reason === null || busy}
          />
        </View>
      ) : null}

      {view === 'block' ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={header(colors.text)}>
            {strings.feed.blockTitle(creatorName)}
          </Text>
          <Text
            style={{
              color: colors.secondaryStrong,
              fontSize: typeRamp.body.pt,
              lineHeight: typeRamp.body.lineHeight,
            }}
          >
            {strings.feed.blockBody}
          </Text>
          {error ? <Text style={errorStyle(colors.danger)}>{error}</Text> : null}
          <Button label={strings.feed.blockCta} variant="danger" onPress={confirmBlock} disabled={busy} />
        </View>
      ) : null}
    </GlassSheet>
  );
}

function header(color: string) {
  return {
    color,
    fontSize: typeRamp.title3.pt,
    lineHeight: typeRamp.title3.lineHeight,
    fontWeight: '600' as const,
  };
}

function errorStyle(color: string) {
  return {
    color,
    fontSize: typeRamp.footnote.pt,
    lineHeight: typeRamp.footnote.lineHeight,
  };
}

const styles = StyleSheet.create({
  rootActions: {
    gap: spacing.s3,
    paddingTop: spacing.s2,
  },
  section: {
    gap: spacing.s4,
    paddingTop: spacing.s2,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s2,
  },
});
