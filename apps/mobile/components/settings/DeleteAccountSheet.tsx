/**
 * DeleteAccountSheet — the typed-confirmation gate for account deletion.
 *
 * A frosted sheet that spells out the irreversibility, then requires the user
 * to TYPE their exact account email before the destructive button enables
 * (case-insensitive, trimmed). On confirm it calls the pinned delete contract
 * and branches on the outcome:
 *   - deleted      -> brief "deleted" state, then hand off to `onDeleted`
 *   - unauthorized -> session already gone; hand off to `onUnauthorized`
 *   - mismatch     -> inline "doesn't match" under the field, stay open
 *   - failed       -> inline retry copy, stay open, do NOT sign out
 *
 * The parent owns what "leaving" means (sign out + navigate to sign-in); this
 * sheet owns only the confirmation UX and the request.
 */
import { strings } from '@era/core/strings';
import { spacing, typeRamp } from '@era/tokens';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { GlassSheet } from '@/components/GlassSheet';
import { Input } from '@/components/Input';
import { useTheme } from '@/lib/theme';

import { deleteAccount } from './api';

type Status = 'idle' | 'deleting' | 'deleted';
type ErrorKind = 'none' | 'mismatch' | 'failed';

interface DeleteAccountSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The signed-in account's email — the typed value must match this. */
  readonly accountEmail: string;
  /** Called after the server confirms deletion (parent signs out + navigates). */
  readonly onDeleted: (storageObjectsDeleted: number) => void;
  /** Called when the session is already gone (401) — treat as signed-out. */
  readonly onUnauthorized: () => void;
}

export function DeleteAccountSheet({
  open,
  onClose,
  accountEmail,
  onDeleted,
  onUnauthorized,
}: DeleteAccountSheetProps) {
  const { colors } = useTheme();
  const [typed, setTyped] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorKind, setErrorKind] = useState<ErrorKind>('none');

  const matches = typed.trim().toLowerCase() === accountEmail.trim().toLowerCase();
  const busy = status === 'deleting';
  const canConfirm = matches && status === 'idle';

  // While an erase is in flight there's no safe way to back out — lock the
  // scrim-close and Cancel until the request resolves (mirrors web).
  const handleClose = busy ? () => {} : onClose;

  async function confirmDelete() {
    if (!canConfirm) return;
    setStatus('deleting');
    setErrorKind('none');
    const result = await deleteAccount(typed);
    switch (result.status) {
      case 'deleted':
        setStatus('deleted');
        onDeleted(result.storageObjectsDeleted);
        return;
      case 'unauthorized':
        onUnauthorized();
        return;
      case 'mismatch':
        setErrorKind('mismatch');
        setStatus('idle');
        return;
      case 'failed':
        setErrorKind('failed');
        setStatus('idle');
        return;
    }
  }

  return (
    <GlassSheet open={open} onClose={handleClose}>
      {status === 'deleted' ? (
        <View style={styles.body}>
          <Text
            accessibilityLiveRegion="polite"
            style={{
              color: colors.text,
              fontSize: typeRamp.title3.pt,
              lineHeight: typeRamp.title3.lineHeight,
              fontWeight: '600',
            }}
          >
            {strings.settings.deleted}
          </Text>
        </View>
      ) : (
        <View style={styles.body}>
          <Text
            accessibilityRole="header"
            style={{
              color: colors.text,
              fontSize: typeRamp.title3.pt,
              lineHeight: typeRamp.title3.lineHeight,
              fontWeight: '600',
            }}
          >
            {strings.settings.deleteTitle}
          </Text>

          <Text
            style={{
              color: colors.secondaryStrong,
              fontSize: typeRamp.body.pt,
              lineHeight: typeRamp.body.lineHeight,
            }}
          >
            {strings.settings.deleteBody}
          </Text>

          <Text
            style={{
              color: colors.secondary,
              fontSize: typeRamp.footnote.pt,
              lineHeight: typeRamp.footnote.lineHeight,
            }}
          >
            {strings.settings.deleteConfirmPrompt(accountEmail)}
          </Text>

          <Input
            value={typed}
            onChangeText={(next) => {
              setTyped(next);
              if (errorKind !== 'none') setErrorKind('none');
            }}
            placeholder={strings.settings.deleteConfirmPlaceholder}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            accessibilityLabel={strings.settings.deleteConfirmPlaceholder}
            error={errorKind === 'mismatch' ? strings.settings.deleteMismatch : undefined}
          />

          <Button
            label={busy ? strings.settings.deleting : strings.settings.deleteConfirmCta}
            variant="danger"
            disabled={!canConfirm}
            onPress={() => {
              void confirmDelete();
            }}
          />

          {errorKind === 'failed' ? (
            <Text
              accessibilityLiveRegion="polite"
              style={{
                color: colors.danger,
                fontSize: typeRamp.footnote.pt,
                lineHeight: typeRamp.footnote.lineHeight,
              }}
            >
              {strings.settings.deleteFailed}
            </Text>
          ) : null}

          <Button label={strings.common.cancel} variant="ghost" disabled={busy} onPress={onClose} />
        </View>
      )}
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.s3,
  },
});
