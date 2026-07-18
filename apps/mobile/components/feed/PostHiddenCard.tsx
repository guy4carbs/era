/**
 * PostHiddenCard — what a slot renders after its post is reported or blocked.
 *
 * The pager keeps the slot in place (indices stay stable), so instead of the
 * cover it shows a calm, full-screen acknowledgement on the app surface: the
 * `strings.feed.hiddenPost` marker plus the report-confirm reassurance. No retry,
 * no undo — a quiet dead-end the viewer swipes past.
 */
import { strings } from '@era/core/strings';
import { spacing } from '@era/tokens';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { useTheme } from '@/lib/theme';

interface PostHiddenCardProps {
  readonly height: number;
}

export function PostHiddenCard({ height }: PostHiddenCardProps) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={strings.feed.hiddenPost}
      style={[styles.card, { height, backgroundColor: colors.bg }]}
    >
      <Text variant="ui" size="title3" weight={600} color={colors.text}>
        {strings.feed.hiddenPost}
      </Text>
      <Text variant="body" size="subhead" color={colors.secondaryStrong} style={{ textAlign: 'center' }}>
        {strings.feed.reportConfirm}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s3,
    paddingHorizontal: spacing.s8,
  },
});
