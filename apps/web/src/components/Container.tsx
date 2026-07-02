import { type CSSProperties, type ReactNode } from 'react';

export interface ContainerProps {
  children: ReactNode;
  style?: CSSProperties;
}

/**
 * Centred content column capped at the token `layout.contentMaxWidth` (1200).
 * Width + inline padding come from the generated `.era-container` rule so the
 * cap and gutter stay token-driven.
 */
export function Container({ children, style }: ContainerProps) {
  return (
    <div className="era-container" style={style}>
      {children}
    </div>
  );
}
