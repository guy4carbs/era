import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { type CSSProperties } from 'react';
import { strings } from '@era/core/strings';
import { auth } from '../../lib/auth';
import { Container } from '../../components';
import { Hero, FeatureSection, Closer } from '../../components/site';

/**
 * The Era landing at `/`. Session-gated: a signed-in visitor is redirected
 * straight to `/feed`, so this marketing surface renders only for anonymous
 * traffic (the Lighthouse-90+ path). The gate reuses the same server session
 * helper the API routes use (`auth.api.getSession`).
 *
 * Everything below is server-rendered; interactivity and motion live in small
 * client islands (Hero glow, scroll reveals, the waitlist form) so the critical
 * render stays lean.
 */

// Vertical rhythm between the frosted feature panels.
const sectionsStackStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-12)',
  paddingBlock: 'var(--space-16)',
};

export default async function LandingPage() {
  // Session-gate is best-effort: if the auth/DB stack is momentarily unavailable,
  // the public landing must still render — never 500 the marketing front door.
  // An unresolvable session is treated as anonymous.
  let session: Awaited<ReturnType<typeof auth.api.getSession>> = null;
  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch {
    session = null;
  }
  if (session) {
    redirect('/feed');
  }

  return (
    <main>
      <Hero />
      <Container>
        <div style={sectionsStackStyle}>
          {strings.site.sections.map((section, index) => (
            <FeatureSection
              key={section.title}
              index={index}
              title={section.title}
              body={section.body}
            />
          ))}
        </div>
        <Closer />
      </Container>
    </main>
  );
}
