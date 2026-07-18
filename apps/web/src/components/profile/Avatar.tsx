import { type CSSProperties, type JSX } from 'react';
import { Text } from '../Text';

export interface AvatarProps {
  /** The avatar image URL, or null to fall back to the monogram. */
  src: string | null;
  /** The profile's display name (or username) — seeds the monogram initial. */
  name: string;
  /** Square edge in px. */
  size: number;
}

/**
 * A profile avatar: the uploaded/provider image when present, otherwise a calm
 * monogram (first initial on a tinted disc). A plain `<img>` rather than
 * `next/image` on purpose — avatar URLs can be third-party (OAuth provider) hosts
 * that aren't in the image optimizer allow-list, so this must render whatever URL
 * the profile carries without a config change. The image is decorative here (the
 * name always renders as adjacent text), so its `alt` is empty and the monogram
 * is `aria-hidden`.
 *
 * Server component — no interactivity.
 */
export function Avatar({ src, name, size }: AvatarProps): JSX.Element {
  const box: CSSProperties = {
    width: size,
    height: size,
    borderRadius: 'var(--radius-full)',
    flexShrink: 0,
    objectFit: 'cover',
    background: 'color-mix(in srgb, var(--color-hairline) 50%, transparent)',
  };

  if (src) {
    // Plain <img>, not next/image: avatar URLs can be third-party OAuth-provider
    // hosts that aren't in the image optimizer allow-list.
    return <img src={src} alt="" width={size} height={size} style={box} />;
  }

  const initial = name.trim().charAt(0).toUpperCase() || '·';
  const monoSize = Math.round(size * 0.42);
  return (
    <Text
      variant="ui"
      size={monoSize}
      weight={600}
      as="span"
      aria-hidden="true"
      style={{
        ...box,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-secondary-strong)',
        userSelect: 'none',
      }}
    >
      {initial}
    </Text>
  );
}
