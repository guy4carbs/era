import { type JSX } from 'react';

export interface JsonLdProps {
  /** One schema node, or an array of nodes rendered as a single graph. */
  data: Record<string, unknown> | Record<string, unknown>[];
}

/**
 * Emits a `<script type="application/ld+json">` for the given schema.org
 * node(s). Server Component — the serialized JSON is injected at render with no
 * client cost.
 *
 * The data is first-party (typed builders in {@link schemas.ts}), but the
 * serialized string is still hardened against a `</script>` breakout: every `<`
 * is escaped to its `<` unicode form, the standard JSON-LD injection guard.
 * JSON is valid with the escape, and no HTML parser can see a closing tag inside
 * the block.
 */
export function JsonLd({ data }: JsonLdProps): JSX.Element {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
