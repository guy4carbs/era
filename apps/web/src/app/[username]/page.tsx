import { cache, type CSSProperties, type JSX } from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { strings } from '@era/core/strings';
import { createDbClient, profiles } from '@era/db';

import { auth } from '../../lib/auth';
import { serverStorageClient } from '../../lib/storage-server';
import {
  loadPublicProfile,
  type PublicProfilePrivate,
  type PublicProfileResult,
} from '../../lib/public-profile-server';
import { isThinProfile, profileName, profileTitle } from '../../lib/profile-presenter';
import { siteUrl } from '../../lib/site-url';
import { isValidUsername } from '../../lib/username';
import { Container } from '../../components';
import { Avatar, CopyLinkButton, FollowButton, ProfileView } from '../../components/profile';
import { JsonLd, profilePageSchema } from '../../components/seo';
import { typeRamp } from '@era/tokens';

/**
 * `/{username}` — the public profile, Era's shareable Layer-3 SEO surface. A
 * top-level dynamic segment: Next resolves static routes first, and the loader
 * maps reserved (app-route) names to `not_found`, so there are no collisions with
 * `/settings`, `/closet`, etc.
 *
 * Server-rendered and viewer-aware (the session is resolved server-side to decide
 * follow state / owner affordances). The loader's discriminated result drives
 * three renderings — not-found (404), a minimal private card, or the full public
 * profile — and the robots/canonical/JSON-LD signals below.
 *
 * INDEXING (state × thin → robots):
 *   - not_found            → 404 via `notFound()` (not-found.tsx is noindex).
 *   - private              → renders + shareable, `noindex,nofollow`, NO canonical.
 *   - public + thin (<5)   → renders + shareable, `noindex,nofollow`, NO canonical.
 *   - public + non-thin    → indexable: canonical + ProfilePage JSON-LD + sitemap.
 * Canonical is deliberately omitted on every noindex page — Google advises against
 * pairing `noindex` with a canonical, and it keeps private/thin consistent.
 */

const db = createDbClient(process.env.DATABASE_URL!);

/** The viewer's user id (null = anonymous), resolved once per request. */
const resolveViewerId = cache(async (): Promise<string | null> => {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    return session?.user.id ?? null;
  } catch {
    // A momentary auth/DB hiccup renders the page as an anonymous viewer.
    return null;
  }
});

/** The viewer's own username — used only to detect owner-self views. */
const resolveViewerUsername = cache(async (viewerId: string | null): Promise<string | null> => {
  if (viewerId === null) {
    return null;
  }
  try {
    const [row] = await db
      .select({ username: profiles.username })
      .from(profiles)
      .where(eq(profiles.userId, viewerId))
      .limit(1);
    return row?.username ?? null;
  } catch {
    return null;
  }
});

/**
 * The profile read model. Cached per-request by (username, viewerId) so
 * `generateMetadata` and the page — which resolve the SAME viewerId — share a
 * single database load rather than querying twice.
 */
const getProfile = cache(
  (username: string, viewerId: string | null): Promise<PublicProfileResult> =>
    loadPublicProfile(db, serverStorageClient(), username, viewerId),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const noindex = { index: false, follow: false } as const;

  // Format-invalid slugs never resolve to a profile — the page 404s them.
  if (!isValidUsername(username)) {
    return { robots: noindex };
  }

  const viewerId = await resolveViewerId();
  const result = await getProfile(username, viewerId);

  if (result.state === 'not_found') {
    return { robots: noindex };
  }

  const title = profileTitle(result.profile);
  const name = profileName(result.profile);
  const canonical = `${siteUrl()}/${username}`;

  if (result.state === 'private') {
    // Shareable but never indexed; no canonical on a noindex page.
    return {
      title,
      description: strings.profile.privateBody,
      robots: noindex,
      openGraph: { type: 'profile', title, description: strings.profile.privateBody, url: canonical },
    };
  }

  const description = strings.profile.metaDescription(name, result.publicItemCount);
  const openGraph = { type: 'profile', title, description, url: canonical } as const;

  if (isThinProfile(result.publicItemCount)) {
    return { title, description, robots: noindex, openGraph };
  }

  // Indexable: self-canonical, default (indexable) robots, OG. The file-based
  // opengraph-image is merged automatically (we don't set openGraph.images).
  return { title, description, alternates: { canonical }, openGraph };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<JSX.Element> {
  const { username } = await params;
  if (!isValidUsername(username)) {
    notFound();
  }

  const viewerId = await resolveViewerId();
  const result = await getProfile(username, viewerId);
  if (result.state === 'not_found') {
    notFound();
  }

  const viewerUsername = await resolveViewerUsername(viewerId);
  const isOwner = viewerUsername !== null && viewerUsername === username;
  const signedIn = viewerId !== null;
  const canonicalUrl = `${siteUrl()}/${username}`;

  if (result.state === 'private') {
    return (
      <PrivateCard data={result} isOwner={isOwner} signedIn={signedIn} canonicalUrl={canonicalUrl} />
    );
  }

  return (
    <Container>
      {isThinProfile(result.publicItemCount) ? null : (
        <JsonLd
          data={profilePageSchema({
            username,
            displayName: result.profile.displayName,
            avatarUrl: result.profile.avatarUrl,
            followerCount: result.followerCount,
            createdAt: result.profile.createdAt,
          })}
        />
      )}
      <ProfileView
        data={result}
        isOwner={isOwner}
        signedIn={signedIn}
        canonicalUrl={canonicalUrl}
      />
    </Container>
  );
}

/**
 * The private-account card: existence is confirmed, content withheld. A visitor
 * can still follow (bumps the count only). The profile IS shareable even while
 * private, so the owner previewing their own gets the same copy-link affordance
 * as on a public profile (its own `ownProfileHint` leads it) rather than a follow
 * button they'd only be told they can't use.
 */
function PrivateCard({
  data,
  isOwner,
  signedIn,
  canonicalUrl,
}: {
  data: PublicProfilePrivate;
  isOwner: boolean;
  signedIn: boolean;
  canonicalUrl: string;
}): JSX.Element {
  const name = profileName(data.profile);
  return (
    <Container>
      <main style={privateWrapStyle}>
        <Avatar src={data.profile.avatarUrl} name={name} size={72} />
        <h1 style={privateNameStyle}>{name}</h1>
        <p style={privateHandleStyle}>@{data.profile.username}</p>
        <p style={privateHeadingStyle}>{strings.profile.privateHeading(name)}</p>
        <p style={privateBodyStyle}>{strings.profile.privateBody}</p>
        {isOwner ? (
          <CopyLinkButton url={canonicalUrl} align="center" />
        ) : (
          <FollowButton
            username={data.profile.username}
            name={name}
            signedIn={signedIn}
            initialFollowing={data.isFollowing}
            initialFollowerCount={data.followerCount}
          />
        )}
      </main>
    </Container>
  );
}

const privateWrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  gap: 'var(--space-3)',
  maxWidth: 'var(--feed-col, 480px)',
  marginInline: 'auto',
  paddingBlock: 'var(--space-16)',
};

const privateNameStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.title2.rem,
  lineHeight: `${typeRamp.title2.lineHeight}px`,
  fontWeight: 700,
  color: 'var(--color-text)',
};

const privateHandleStyle: CSSProperties = {
  margin: 0,
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
  color: 'var(--color-secondary-strong)',
};

const privateHeadingStyle: CSSProperties = {
  margin: 0,
  marginTop: 'var(--space-2)',
  fontSize: typeRamp.body.rem,
  lineHeight: `${typeRamp.body.lineHeight}px`,
  fontWeight: 600,
  color: 'var(--color-text)',
};

const privateBodyStyle: CSSProperties = {
  margin: 0,
  maxWidth: '36ch',
  fontSize: typeRamp.subhead.rem,
  lineHeight: `${typeRamp.subhead.lineHeight}px`,
  color: 'var(--color-secondary)',
};
