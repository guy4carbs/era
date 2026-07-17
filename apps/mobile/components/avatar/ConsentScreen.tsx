/**
 * ConsentScreen — the informed opt-in that MUST precede any avatar photo leaving
 * the device. Renders `strings.tryon.consent` copy in full: the heading, then the
 * itemized facts (photos used once, processed by the try-on provider, originals
 * deleted right after, avatar stored privately + encrypted, deletable anytime) as
 * a plain scannable checklist. One primary affirmative action
 * (`strings.tryon.consentAgree`) and one quiet, equal-weight escape
 * (`strings.common.notNow`) — no dark patterns: the decline is a first-class ghost
 * button, not hidden, shrunk, or guilt-tripped, and nothing is pre-consented.
 *
 * This screen owns only the consent UX; the parent (`app/avatar.tsx`) owns what
 * "agree" and "not now" mean.
 */
import { strings } from '@era/core/strings';
import { spacing, typeRamp } from '@era/tokens';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { useTheme } from '@/lib/theme';

interface ConsentScreenProps {
  /** Called when the user affirmatively agrees to build the avatar. */
  readonly onAgree: () => void;
  /** Called when the user declines — a plain, no-penalty exit. */
  readonly onCancel: () => void;
}

export function ConsentScreen({ onAgree, onCancel }: ConsentScreenProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text
          accessibilityRole="header"
          style={{
            color: colors.text,
            fontSize: typeRamp.title1.pt,
            lineHeight: typeRamp.title1.lineHeight,
            fontWeight: '700',
          }}
        >
          {strings.tryon.consent.heading}
        </Text>

        <View style={styles.facts}>
          {strings.tryon.consent.body.map((line) => (
            <View key={line} style={styles.factRow}>
              <Text
                aria-hidden
                style={{
                  color: colors.accent,
                  fontSize: typeRamp.body.pt,
                  lineHeight: typeRamp.body.lineHeight,
                }}
              >
                {'•'}
              </Text>
              <Text
                style={{
                  color: colors.secondaryStrong,
                  fontSize: typeRamp.body.pt,
                  lineHeight: typeRamp.body.lineHeight,
                  flex: 1,
                }}
              >
                {line}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.actions}>
        <Button label={strings.tryon.consentAgree} variant="primary" haptic onPress={onAgree} />
        <Button label={strings.common.notNow} variant="secondary" onPress={onCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'space-between',
  },
  content: {
    padding: spacing.s6,
    gap: spacing.s6,
  },
  facts: {
    gap: spacing.s3,
  },
  factRow: {
    flexDirection: 'row',
    gap: spacing.s2,
    alignItems: 'flex-start',
  },
  actions: {
    paddingHorizontal: spacing.s6,
    paddingBottom: spacing.s6,
    gap: spacing.s3,
  },
});
