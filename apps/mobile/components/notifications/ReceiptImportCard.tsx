/**
 * ReceiptImportCard — the in-app "your receipt landed" card.
 *
 * The async counterpart to the paste-flow's inline toast: when pieces forwarded
 * to the personal receipt address arrive as closet drafts, this quiet card says
 * so and taps through to the closet to review them. One tappable surface, no
 * dismiss and no urgency — the whole card IS the affordance (the list owns the
 * haptic, mark-read, and navigation). The server pre-composes `payload.message`
 * from {@link strings.settings.receiptAddress.newDrafts}, so the card renders it
 * verbatim rather than re-deriving the count copy.
 */
import { layout, radii, rnShadow, spacing } from '@era/tokens';
import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/Text';
import { useTheme } from '@/lib/theme';

import type { InAppNotification, ReceiptImportPayload } from './api';

interface ReceiptImportCardProps {
  readonly notification: InAppNotification<ReceiptImportPayload>;
  /** Open the closet to review the drafts (list owns haptic + mark-read + nav). */
  readonly onOpen: (notification: InAppNotification<ReceiptImportPayload>) => void;
}

export function ReceiptImportCard({ notification, onOpen }: ReceiptImportCardProps) {
  const { colors, resolved } = useTheme();
  const { message } = notification.payload;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={message}
      onPress={() => onOpen(notification)}
      style={[
        styles.card,
        rnShadow('e2', resolved),
        {
          backgroundColor: colors.surface,
          borderColor: colors.hairline,
          borderRadius: radii.card,
        },
      ]}
    >
      <Text variant="body" color={colors.text} style={{ flex: 1 }}>
        {message}
      </Text>
      <Text variant="body" color={colors.secondary} aria-hidden>
        ›
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: layout.touchTarget.ios,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    padding: layout.itemCard.padding,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
  },
});
