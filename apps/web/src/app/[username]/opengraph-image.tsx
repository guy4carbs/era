import { ImageResponse } from 'next/og';

import { createDbClient } from '@era/db';
import { loadPublicProfile } from '../../lib/public-profile-server';
import { serverStorageClient } from '../../lib/storage-server';
import { profileName } from '../../lib/profile-presenter';

/**
 * The share-card image for `/{username}`, composed with `next/og` (built in — no
 * new dependency). Runs in the Node runtime because it reaches the profile loader
 * (Drizzle/pg). Next wires this file into the page's OpenGraph/Twitter metadata
 * automatically.
 *
 * It composes up to six of the profile's public cutouts on the brand card with
 * the wordmark, display name, and piece count. Cutouts live on the public R2
 * base; each is pre-fetched to a data URL with a short timeout so one slow/broken
 * asset can't fail the whole image (Satori would otherwise throw on a bad `<img>`
 * URL) — any that don't resolve are simply dropped. A private profile, a missing
 * profile, or a total fetch failure degrades to a clean text-only Era card.
 */
export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'A closet on Era';

const db = createDbClient(process.env.DATABASE_URL!);

const COLORS = {
  bg: '#1C1B19',
  surface: '#26241F',
  text: '#F5F1E8',
  muted: '#B5AC9C',
  accent: '#C9BEA9',
  hairline: '#3A3833',
} as const;

const MAX_TILES = 6;
const FETCH_TIMEOUT_MS = 2500;

/** Fetch an image URL into a data URL, or null on any failure/timeout/non-image. */
async function fetchDataUrl(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? 'image/png';
    if (!type.startsWith('image/')) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return `data:${type};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<ImageResponse> {
  const { username } = await params;

  let name = 'Era';
  let pieceLine = '';
  let tiles: string[] = [];

  try {
    const result = await loadPublicProfile(db, serverStorageClient(), username, null);
    if (result.state !== 'not_found') {
      name = profileName(result.profile);
    }
    if (result.state === 'public') {
      const count = result.publicItemCount;
      pieceLine = count === 1 ? '1 piece' : `${count} pieces`;
      const urls = result.items
        .map((item) => item.imageUrl)
        .filter((url): url is string => url !== null)
        .slice(0, MAX_TILES);
      const settled = await Promise.all(urls.map(fetchDataUrl));
      tiles = settled.filter((url): url is string => url !== null);
    }
  } catch {
    // Fall through to the text-only Era card.
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px',
          background: COLORS.bg,
          color: COLORS.text,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 30,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: COLORS.accent,
          }}
        >
          Era
        </div>

        {tiles.length > 0 ? (
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            {tiles.map((src, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '150px',
                  height: '188px',
                  padding: '12px',
                  borderRadius: '18px',
                  background: COLORS.surface,
                  border: `1px solid ${COLORS.hairline}`,
                }}
              >
                {/* Satori render target, not the browser DOM — next/image can't run here. */}
                <img
                  src={src}
                  alt=""
                  width={126}
                  height={164}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>
            ))}
          </div>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 66, fontWeight: 700 }}>{name}</div>
          {pieceLine ? (
            <div style={{ display: 'flex', fontSize: 30, marginTop: '12px', color: COLORS.muted }}>
              {pieceLine}
            </div>
          ) : null}
        </div>
      </div>
    ),
    size,
  );
}
