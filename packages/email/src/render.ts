/**
 * renderEmail — turn a template element into the `{ html, text }` a send needs.
 *
 * Both halves come from `@react-email/render`: the HTML render for the inbox,
 * and a second pass with `plainText: true` for the multipart text alternative.
 * The app's transport (`apps/web/src/lib/send-email.ts`) takes exactly this
 * shape, so a caller renders once and hands the result over.
 */
import { render } from '@react-email/render';
import type { ReactElement } from 'react';

export interface RenderedEmail {
  readonly html: string;
  readonly text: string;
}

/** Render a template element to its HTML and plain-text alternative. */
export async function renderEmail(element: ReactElement): Promise<RenderedEmail> {
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);
  return { html, text };
}
