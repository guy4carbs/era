import type { MDXComponents } from 'mdx/types';
import type { ReactNode } from 'react';

import { proseCss } from './src/components/site/prose';

/**
 * Root MDX component map — required by the App Router for `@next/mdx`. Every MDX
 * module compiled by the loader (the SEO journal posts under
 * `src/content/journal`) reads its element mapping from here.
 *
 * Rather than style each element inline, we wrap the compiled body in the shared
 * `.era-prose` reading column (the same editorial stylesheet the legal pages use,
 * extracted to `components/site/prose.ts`) so a journal post renders in the exact
 * quiet, token-driven prose look. The `wrapper` injects the scoped `<style>` once
 * and nests the body under `.era-prose > article`, which the CSS targets. Server
 * component — no client boundary, no runtime cost.
 *
 * The post page owns the title/author/related chrome; this handles only the MDX
 * body, so element defaults (h2, h3, p, ul, a, …) are left to the scoped CSS.
 */
function ProseWrapper({ children }: { children: ReactNode }) {
  return (
    <div className="era-prose">
      <style>{proseCss}</style>
      <article>{children}</article>
    </div>
  );
}

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    wrapper: ProseWrapper,
    ...components,
  };
}
