/**
 * QuizIntro — the pre-quiz framing card.
 *
 * Sets the ask plainly (twelve taps, under two minutes, skippable) and offers
 * the one primary action to begin. The skip affordance lives in the flow's
 * header, so the intro keeps a single, unpushy call to action.
 */
import { spacing } from '@era/tokens';
import { StyleSheet, View } from 'react-native';

import { strings } from '@era/core/strings';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { useTheme } from '@/lib/theme';

interface QuizIntroProps {
  readonly onBegin: () => void;
}

export function QuizIntro({ onBegin }: QuizIntroProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.copy}>
        <Text accessibilityRole="header" variant="ui" size="title1" weight={700} color={colors.text}>
          {strings.quiz.introTitle}
        </Text>
        <Text variant="body" color={colors.secondaryStrong}>
          {strings.quiz.introBody}
        </Text>
      </View>
      <Button label={strings.common.continue} onPress={onBegin} haptic />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.s6,
    gap: spacing.s8,
  },
  copy: {
    gap: spacing.s4,
  },
});
