/**
 * AvatarSection — the Settings controls for a user's try-on avatar.
 *
 * Reads the avatar state on focus and renders one of:
 *   - none    → a "Create your avatar" row that opens onboarding (`/avatar`)
 *   - creating→ a patient status line (no action — a build is in flight)
 *   - ready   → the creation-date status line + a destructive "Delete avatar" row
 *   - failed  → a status line that routes back into onboarding to retry
 * When the surface is off server-side (or unreadable) the section renders nothing,
 * matching the app's dormant posture (no dead controls).
 *
 * Delete uses the DeleteAccountSheet confirm pattern MINUS the typed-email gate: a
 * frosted sheet spelling out the permanence, a destructive confirm, and a cancel.
 * On success the parent screen shows `strings.tryon.deleted(count)` via its toast.
 *
 * Only mounted by the Settings screen when the cosmetic try-on flag is on.
 */
import { strings } from '@era/core/strings';
import type { AvatarStatus } from '@era/core/tryon';
import { spacing, typeRamp } from '@era/tokens';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { GlassSheet } from '@/components/GlassSheet';
import { SettingRow } from '@/components/settings/SettingRow';
import { useTheme } from '@/lib/theme';

import { avatarCopy } from '@/components/avatar/copy';
import { deleteAvatar, fetchAvatar } from '@/components/avatar/api';

// The section's view state — `loading`/`hidden` bracket the four avatar statuses.
type AvatarView = 'loading' | 'hidden' | AvatarStatus;

interface AvatarSectionProps {
  /** Surface the post-delete confirmation (and any failure) on the screen's toast. */
  readonly onToast: (message: string) => void;
}

export function AvatarSection({ onToast }: AvatarSectionProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const [view, setView] = useState<AvatarView>('loading');
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const state = await fetchAvatar();
      setCreatedAt(state.createdAt ?? null);
      setView(state.status);
    } catch {
      // Off server-side (404) or unreadable — render nothing (dormant posture).
      setView('hidden');
    }
  }, []);

  // Refetch on focus so an avatar created in onboarding shows without a manual reload.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const handleDeleted = useCallback(
    (count: number) => {
      setDeleteOpen(false);
      setView('none');
      setCreatedAt(null);
      onToast(strings.tryon.deleted(count));
    },
    [onToast],
  );

  if (view === 'loading' || view === 'hidden') {
    return null;
  }

  return (
    <View style={styles.section}>
      <Text
        accessibilityRole="header"
        style={{
          color: colors.secondaryStrong,
          fontSize: typeRamp.footnote.pt,
          lineHeight: typeRamp.footnote.lineHeight,
          fontWeight: '600',
          textTransform: 'uppercase',
        }}
      >
        {avatarCopy.settingsTitle}
      </Text>

      {view === 'none' ? (
        <SettingRow label={avatarCopy.createRow} onPress={() => router.push('/avatar')} />
      ) : view === 'creating' ? (
        <StatusLine color={colors.secondaryStrong}>{avatarCopy.statusCreating}</StatusLine>
      ) : view === 'failed' ? (
        <SettingRow label={avatarCopy.statusFailed} onPress={() => router.push('/avatar')} />
      ) : (
        <>
          <StatusLine color={colors.secondaryStrong}>
            {avatarCopy.statusReady(createdAt ?? '')}
          </StatusLine>
          <SettingRow
            label={avatarCopy.deleteRow}
            destructive
            accessibilityHint={avatarCopy.deleteBody}
            onPress={() => setDeleteOpen(true)}
          />
        </>
      )}

      <DeleteAvatarSheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onDeleted={handleDeleted}
        onFailed={() => onToast(strings.tryon.failed)}
      />
    </View>
  );
}

/** A plain, non-tappable status line (creating / ready). */
function StatusLine({ color, children }: { readonly color: string; readonly children: string }) {
  return (
    <Text
      style={{
        color,
        fontSize: typeRamp.body.pt,
        lineHeight: typeRamp.body.lineHeight,
        paddingVertical: spacing.s2,
      }}
    >
      {children}
    </Text>
  );
}

interface DeleteAvatarSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Called with the verified count of storage objects removed. */
  readonly onDeleted: (storageObjectsDeleted: number) => void;
  /** Called when the delete request failed (parent surfaces a calm retry line). */
  readonly onFailed: () => void;
}

/**
 * The avatar delete confirm — the DeleteAccountSheet shape without the typed-email
 * gate (an avatar is a lower bar than the whole account, but still permanent, so it
 * keeps the plain irreversibility copy and the destructive-button lock).
 */
function DeleteAvatarSheet({ open, onClose, onDeleted, onFailed }: DeleteAvatarSheetProps) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);

  // No safe back-out mid-delete — lock the scrim-close and Cancel until it resolves.
  const handleClose = busy ? () => {} : onClose;

  const confirm = useCallback(async () => {
    setBusy(true);
    try {
      const result = await deleteAvatar();
      onDeleted(result.storageObjectsDeleted);
    } catch {
      onFailed();
    } finally {
      setBusy(false);
    }
  }, [onDeleted, onFailed]);

  return (
    <GlassSheet open={open} onClose={handleClose}>
      <View style={styles.sheetBody}>
        <Text
          accessibilityRole="header"
          style={{
            color: colors.text,
            fontSize: typeRamp.title3.pt,
            lineHeight: typeRamp.title3.lineHeight,
            fontWeight: '600',
          }}
        >
          {avatarCopy.deleteTitle}
        </Text>
        <Text
          style={{
            color: colors.secondaryStrong,
            fontSize: typeRamp.body.pt,
            lineHeight: typeRamp.body.lineHeight,
          }}
        >
          {avatarCopy.deleteBody}
        </Text>
        <Button
          label={avatarCopy.deleteConfirm}
          variant="danger"
          disabled={busy}
          onPress={() => void confirm()}
        />
        <Button label={strings.common.cancel} variant="ghost" disabled={busy} onPress={onClose} />
      </View>
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.s3,
  },
  sheetBody: {
    gap: spacing.s3,
  },
});
