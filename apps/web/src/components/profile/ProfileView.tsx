import { type CSSProperties, type JSX, type ReactNode } from 'react';
import Image from 'next/image';
import { strings } from '@era/core/strings';
import { boxShadows, layout } from '@era/tokens';
import type { PublicProfilePublic } from '../../lib/public-profile-server';
import { coverAlt, itemAlt, profileName } from '../../lib/profile-presenter';
import { Text } from '../Text';
import { Avatar } from './Avatar';
import { FollowButton } from './FollowButton';
import { CopyLinkButton } from './CopyLinkButton';

export interface ProfileViewProps {
  /** The loader's public read model for this profile. */
  data: PublicProfilePublic;
  /** True when the viewer is the profile owner (their own username). */
  isOwner: boolean;
  /** Whether a session is present — gates the Follow button vs. the sign-in prompt. */
  signedIn: boolean;
  /** The absolute canonical profile URL — handed to the owner's copy-link control. */
  canonicalUrl: string;
}

// Two responsive grids, built from the token breakpoints (media queries can't read
// CSS vars). Cutouts mirror the in-app closet (2→5 up); covers run one column
// wider apart (2→4). Scoped class names keep the rules local to this surface.
const gridCss = [
  `.era-profile-cutouts{display:grid;gap:${layout.grid.gutter}px;grid-template-columns:repeat(2,minmax(0,1fr))}`,
  `@media(min-width:${layout.breakpoints.md}px){.era-profile-cutouts{grid-template-columns:repeat(3,minmax(0,1fr))}}`,
  `@media(min-width:${layout.breakpoints.lg}px){.era-profile-cutouts{grid-template-columns:repeat(4,minmax(0,1fr))}}`,
  `@media(min-width:${layout.breakpoints.xl}px){.era-profile-cutouts{grid-template-columns:repeat(5,minmax(0,1fr))}}`,
  `.era-profile-covers{display:grid;gap:${layout.grid.gutter}px;grid-template-columns:repeat(2,minmax(0,1fr))}`,
  `@media(min-width:${layout.breakpoints.md}px){.era-profile-covers{grid-template-columns:repeat(3,minmax(0,1fr))}}`,
  `@media(min-width:${layout.breakpoints.lg}px){.era-profile-covers{grid-template-columns:repeat(4,minmax(0,1fr))}}`,
].join('\n');

// next/image needs a sizes hint to pick a source width; mirror the grid columns.
const CUTOUT_SIZES = '(min-width:1280px) 18vw, (min-width:1024px) 22vw, (min-width:768px) 30vw, 45vw';
const COVER_SIZES = '(min-width:1024px) 22vw, (min-width:768px) 30vw, 45vw';

/**
 * The public profile: an identity header (avatar, name, @handle, follow/share)
 * over three collapsing sections — Closet cutouts, Eras, and Outfits. Server
 * component: only the follow control and the owner's copy-link are client
 * islands. Empty sections collapse; when no pieces are public the Closet section
 * shows the warm empty state (owner-aware) in place of the grid. All imagery is
 * `next/image` with mandatory, tag-composed alt text per the SEO conventions.
 */
export function ProfileView({ data, isOwner, signedIn, canonicalUrl }: ProfileViewProps): JSX.Element {
  const name = profileName(data.profile);
  const hasItems = data.items.length > 0;

  return (
    <main style={pageStyle}>
      <style>{gridCss}</style>

      <header style={headerStyle}>
        <Avatar src={data.profile.avatarUrl} name={name} size={72} />
        <div style={identityStyle}>
          <Text variant="largeTitle" as="h1" size="title1" weight={700} style={nameStyle}>
            {name}
          </Text>
          <Text variant="caption" as="p" size="subhead" style={handleStyle}>
            @{data.profile.username}
          </Text>
          {isOwner ? (
            <div style={ownerBlockStyle}>
              <Text variant="ui" as="p" size="subhead" weight={600} style={countsStyle}>
                <span>{strings.profile.followerCount(data.followerCount)}</span>
                <span aria-hidden="true" style={dotStyle}>
                  ·
                </span>
                <span>{strings.profile.followingCount(data.followingCount)}</span>
              </Text>
              <CopyLinkButton url={canonicalUrl} />
            </div>
          ) : (
            <FollowButton
              username={data.profile.username}
              name={name}
              signedIn={signedIn}
              initialFollowing={data.isFollowing}
              initialFollowerCount={data.followerCount}
              followingCount={data.followingCount}
            />
          )}
        </div>
      </header>

      <Section title={strings.profile.sections.closet}>
        {hasItems ? (
          <div className="era-profile-cutouts">
            {data.items.map((item) => (
              <CutoutTile key={item.id} alt={itemAlt(item)} imageUrl={item.imageUrl} name={item.name} />
            ))}
          </div>
        ) : (
          <Text variant="body" as="p" style={emptyStyle}>
            {isOwner ? strings.profile.emptyPublicOwn : strings.profile.emptyPublic(name)}
          </Text>
        )}
      </Section>

      {data.eras.length > 0 ? (
        <Section title={strings.profile.sections.eras}>
          <div className="era-profile-covers">
            {data.eras.map((era) => (
              <CoverCard
                key={era.id}
                coverUrl={era.coverUrl}
                title={era.title}
                alt={coverAlt(name, era.title, 'an era')}
              />
            ))}
          </div>
        </Section>
      ) : null}

      {data.outfits.length > 0 ? (
        <Section title={strings.profile.sections.outfits}>
          <div className="era-profile-covers">
            {data.outfits.map((outfit) => (
              <CoverCard
                key={outfit.id}
                coverUrl={outfit.coverUrl}
                title={outfit.name}
                alt={coverAlt(name, outfit.name, 'an outfit')}
              />
            ))}
          </div>
        </Section>
      ) : null}
    </main>
  );
}

/** A titled section — a small uppercase heading over its content. */
function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section style={sectionStyle}>
      <Text variant="caption" as="h2" size="footnote" weight={700} style={sectionHeadingStyle}>
        {title}
      </Text>
      {children}
    </section>
  );
}

/** One closet cutout on the 4:5 gallery card. A null image renders a calm frame. */
function CutoutTile({
  imageUrl,
  alt,
  name,
}: {
  imageUrl: string | null;
  alt: string;
  name: string;
}): JSX.Element {
  return (
    <figure style={tileFigureStyle}>
      <div style={cutoutFrameStyle}>
        {imageUrl ? (
          <Image src={imageUrl} alt={alt} fill sizes={CUTOUT_SIZES} style={cutoutImageStyle} />
        ) : (
          <span aria-hidden="true" style={placeholderStyle} />
        )}
      </div>
      <Text variant="caption" as="figcaption" size="footnote" style={captionStyle}>
        {name}
      </Text>
    </figure>
  );
}

/** One era/outfit cover card — a 4:5 cover with its title below. */
function CoverCard({
  coverUrl,
  title,
  alt,
}: {
  coverUrl: string | null;
  title: string | null;
  alt: string;
}): JSX.Element {
  return (
    <figure style={tileFigureStyle}>
      <div style={coverFrameStyle}>
        {coverUrl ? (
          <Image src={coverUrl} alt={alt} fill sizes={COVER_SIZES} style={coverImageStyle} />
        ) : (
          <span aria-hidden="true" style={placeholderStyle} />
        )}
      </div>
      {title ? (
        <Text variant="caption" as="figcaption" size="footnote" style={captionStyle}>
          {title}
        </Text>
      ) : null}
    </figure>
  );
}

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-12)',
  paddingBlock: 'var(--space-8)',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-4)',
  alignItems: 'flex-start',
};

const identityStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  minWidth: 0,
};

const nameStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-text)',
};

const handleStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-secondary-strong)',
};

const ownerBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  alignItems: 'flex-start',
  marginTop: 'var(--space-1)',
};

const countsStyle: CSSProperties = {
  margin: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  color: 'var(--color-text)',
};

const dotStyle: CSSProperties = { color: 'var(--color-secondary-strong)' };

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

const sectionHeadingStyle: CSSProperties = {
  margin: 0,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--color-secondary-strong)',
};

const emptyStyle: CSSProperties = {
  margin: 0,
  paddingBlock: 'var(--space-8)',
  color: 'var(--color-secondary)',
  textAlign: 'center',
};

const tileFigureStyle: CSSProperties = {
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  minWidth: 0,
};

const frameBase: CSSProperties = {
  position: 'relative',
  aspectRatio: layout.itemCard.aspectRatio,
  background: 'var(--color-surface)',
  borderRadius: 'var(--radius-card)',
  overflow: 'hidden',
  boxShadow: boxShadows.e2,
};

const cutoutFrameStyle: CSSProperties = frameBase;

const coverFrameStyle: CSSProperties = frameBase;

// Cutouts sit inside the card padding (the `fill` image's own box), contained so
// the whole garment shows; covers bleed to the edges (object-fit: cover).
const cutoutImageStyle: CSSProperties = {
  objectFit: 'contain',
  padding: 'var(--item-card-padding)',
};

const coverImageStyle: CSSProperties = {
  objectFit: 'cover',
};

const placeholderStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'color-mix(in srgb, var(--color-hairline) 40%, transparent)',
};

const captionStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
