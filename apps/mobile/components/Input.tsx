/**
 * Input — single-line text field.
 *
 * Hairline border that shifts to the accent colour on focus; error state uses
 * the semantic danger (rust) colour. Min height honours the iOS touch target.
 */
import { layout, radii, spacing, typeRamp } from '@era/tokens';
import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

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
            fontSize: typeRamp.body.pt,
          },
        ]}
      />
      {error ? (
        <Text
          style={[
            styles.error,
            {
              color: colors.danger,
              fontSize: typeRamp.footnote.pt,
              lineHeight: typeRamp.footnote.lineHeight,
            },
          ]}
        >
          {error}
        </Text>
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
