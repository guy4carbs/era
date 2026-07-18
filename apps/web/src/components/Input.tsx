'use client';

import { forwardRef, useId, type CSSProperties } from 'react';
import { typeRamp, boxShadows } from '@era/tokens';
import { Text, TextControlBoundary } from './Text';

type NativeInputProps = Omit<React.ComponentPropsWithoutRef<'input'>, 'style'>;

export interface InputProps extends NativeInputProps {
  label?: string;
  error?: string;
  style?: CSSProperties;
}

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};

const labelStyle: CSSProperties = {
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  fontWeight: 600,
  color: 'var(--color-text)',
};

const inputStyle: CSSProperties = {
  width: '100%',
  minHeight: 'var(--touch-target-min)',
  paddingInline: 'var(--space-3)',
  paddingBlock: 'var(--space-2)',
  borderRadius: 'var(--radius-input)',
  border: '1px solid var(--color-hairline)',
  boxShadow: boxShadows.e1,
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
};

const errorStyle: CSSProperties = {
  fontSize: typeRamp.footnote.rem,
  lineHeight: `${typeRamp.footnote.lineHeight}px`,
  color: 'var(--color-rust)',
};

/**
 * Labelled text input with inline error support. Focus ring comes from the
 * global `.era-input:focus-visible` rule (token accent). Errors recolour the
 * border and surface a rust message tied to the field via aria-describedby.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, id, style, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  return (
    <TextControlBoundary>
      <div style={fieldStyle}>
        {label ? (
          <Text
            variant="ui"
            as="label"
            size="footnote"
            htmlFor={inputId}
            style={labelStyle}
          >
            {label}
          </Text>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          className="era-input"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          style={{
            ...inputStyle,
            borderColor: error ? 'var(--color-rust)' : 'var(--color-hairline)',
            ...style,
          }}
          {...rest}
        />
        {error ? (
          <Text
            variant="caption"
            as="span"
            size="footnote"
            id={errorId}
            role="alert"
            style={errorStyle}
          >
            {error}
          </Text>
        ) : null}
      </div>
    </TextControlBoundary>
  );
});
