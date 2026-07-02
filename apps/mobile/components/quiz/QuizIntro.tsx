/**
 * QuizIntro — the pre-quiz framing card.
 *
 * Sets the ask plainly (twelve taps, under two minutes, skippable) and offers
 * the one primary action to begin. The skip affordance lives in the flow's
 * header, so the intro keeps a single, unpushy call to action.
 */
import { spacing, typeRamp } from '@era/tokens';
import { StyleSheet, Text, View } from 'react-native';

import { strings } from '@era/core/strings';

import { Button } from '@/components/Button';
import { useTheme } from '@/lib/theme';

interface QuizIntroProps {
  readonly onBegin: () => void;
}

export function QuizIntro({ onBegin }: QuizIntroProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.copy}>
        <Text
          accessibilityRole="header"
          style={[
            styles.title,
            { color: colors.text, fontSize: typeRamp.title1.pt, lineHeight: typeRamp.title1.lineHeight },
          ]}
        >
          {strings.quiz.introTitle}
        </Text>
        <Text
          style={[
            styles.body,
            { color: colors.secondaryStrong, fontSize: typeRamp.body.pt, lineHeight: typeRamp.body.lineHeight },
          ]}
        >
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
  title: {
    fontWeight: '700',
  },
  body: {
    fontWeight: '400',
  },
});
