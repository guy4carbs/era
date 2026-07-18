/**
 * Input — single-line text field.
 *
 * Hairline border that shifts to the accent colour on focus; error state uses
 * the semantic danger (rust) colour. Min height honours the iOS touch target.
 */
import { layout, mobileSansFamily, radii, roleSizePx, typeRoles, spacing } from '@era/tokens';
import { useState } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { Text, TextControlBoundary } from '@/components/Text';
import { useTheme } from '@/lib/theme';

interface InputProps extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  readonly error?: string;
  readonly containerStyle?: StyleProp<ViewStyle>;
}

export function Input({ error, containerStyle, onFocus, onBlur, ...rest }: InputProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? colors.danger
    : focused
      ? colors.accent
      : colors.hairline;

  return (
    <View style={containerStyle}>
      <TextInput
        {...rest}
        placeholderTextColor={colors.secondary}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          styles.input,
          {
            minHeight: layout.touchTarget.ios,
            paddingHorizontal: layout.itemCard.padding,
            borderRadius: radii.input,
            borderColor,
            backgroundColor: colors.surface,
            color: colors.text,
            // The field text is body-sized sans; TextInput isn't a <Text> node so
            // it can't route through the primitive — mirror the role by hand.
            // eslint-disable-next-line no-restricted-syntax -- TextInput mirrors the body role; not a <Text> node
            fontFamily: mobileSansFamily(typeRoles.body.weight),
            fontSize: roleSizePx('body'),
          },
        ]}
      />
      {error ? (
        <TextControlBoundary>
          <Text variant="ui" size="footnote" color={colors.danger} style={styles.error}>
            {error}
          </Text>
        </TextControlBoundary>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
  },
  error: {
    marginTop: spacing.s1,
  },
});
