/**
 * POST /api/import-from-url  { url: string }
 *
 * Import a wardrobe item from a product page URL. The server fetches the page,
 * scrapes product metadata (JSON-LD / OpenGraph), downloads the product image,
 * stores it in the private items-raw bucket, and runs the shared item pipeline
 * (source `link`) so a photo import and a link import produce the same shape of
 * row. Scraped name / brand / price / currency seed the row as prefill; the
 * vision stage (if configured) still overrides name / brand.
 *
 * Every outbound fetch of a user-supplied URL goes through the SSRF gate in
 * lib/url-import.ts (https-only, no credentials/non-443 ports, all resolved
 * addresses must be public, redirects re-validated, wall timeout, capped body).
 * Errors are honest but never echo internal addresses or resolution results.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }        no session
 *   - 400 { error: 'invalid' }                missing/blank url or body
 *   - 403 { error: 'blocked_url' }            a fetch target failed an SSRF guard
 *   - 422 { error: 'not_product' }            page was not fetchable HTML
 *   - 422 { error: 'no_image', meta }         no product image found (client: linkFailed)
 *   - 422 { error: 'unfetchable' }            image missing / not an image / unsupported type
 *   - 502 { error: 'fetch_failed' }           page or image fetch failed at the network level
 *   - 500 { error: 'save_failed' }            storage or persistence failed
 *   - 200 { item, processed: { bg, vision }, meta }
 */
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, requestUploadUrl, requireUser } from '@era/core';

import { auth } from '../../../lib/auth.ts';
import { PipelineError, processItemPipeline } from '../../../lib/item-pipeline.ts';
import { serverStorageClient } from '../../../lib/storage-server.ts';
import { BlockedUrlError, FetchError, extractProductMeta, imageUploadTarget, readCapped, safeFetch } from '../../../lib/url-import.ts';

// Body caps: HTML markup is small; product images can be large but not unbounded.
const HTML_MAX_BYTES = 2 * 1024 * 1024; // 2MB
const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10MB
const HTML_TIMEOUT_MS = 12_000;
const IMAGE_TIMEOUT_MS = 10_000;
const STORE_TIMEOUT_MS = 10_000;

export async function POST(request: Request): Promise<NextResponse> {
  const sessionResult = await auth.api.getSession({ headers: request.headers });
  const ctx: AuthContext = { userId: sessionResult?.user.id ?? null };

  let userId: string;
  try {
    userId = requireUser(ctx);
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    throw error;
  }

  const body: unknown = await request.json().catch(() => null);
  const url = (body as { url?: unknown } | null)?.url;
  if (typeof url !== 'string' || url.length === 0) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  // 1. Fetch the product page HTML through the SSRF gate.
  let html: string;
  let pageUrl: URL;
  try {
    const { response, finalUrl } = await safeFetch(url, {
      accept: 'text/html,application/xhtml+xml',
      timeoutMs: HTML_TIMEOUT_MS,
    });
    pageUrl = finalUrl;
    if (!response.ok) {
      response.body?.cancel().catch(() => {});
      return NextResponse.json({ error: 'fetch_failed' }, { status: 502 });
    }
    if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('text/html')) {
      response.body?.cancel().catch(() => {});
      return NextResponse.json({ error: 'not_product' }, { status: 422 });
    }
    html = new TextDecoder().decode(await readCapped(response, HTML_MAX_BYTES));
  } catch (error) {
    if (error instanceof BlockedUrlError) {
      return NextResponse.json({ error: 'blocked_url' }, { status: 403 });
    }
    if (error instanceof FetchError) {
      return NextResponse.json({ error: 'fetch_failed' }, { status: 502 });
    }
    throw error;
  }

  // 2. Extract product metadata. No image → nothing to import.
  const meta = extractProductMeta(html);
  if (meta.imageUrl === undefined) {
    return NextResponse.json({ error: 'no_image', meta }, { status: 422 });
  }

  // 3. Fetch the product image through the SSRF gate; require an allowed type.
  let imageBytes: Uint8Array;
  let upload: { ext: string; contentType: string };
  try {
    const absoluteImageUrl = new URL(meta.imageUrl, pageUrl).toString();
    const { response } = await safeFetch(absoluteImageUrl, { accept: 'image/*', timeoutMs: IMAGE_TIMEOUT_MS });
    if (!response.ok) {
      response.body?.cancel().catch(() => {});
      return NextResponse.json({ error: 'unfetchable' }, { status: 422 });
    }
    const target = imageUploadTarget(response.headers.get('content-type') ?? '');
    if (target === null) {
      response.body?.cancel().catch(() => {});
      return NextResponse.json({ error: 'unfetchable' }, { status: 422 });
    }
    upload = target;
    imageBytes = await readCapped(response, IMAGE_MAX_BYTES);
  } catch (error) {
    if (error instanceof BlockedUrlError) {
      return NextResponse.json({ error: 'blocked_url' }, { status: 403 });
    }
    if (error instanceof FetchError) {
      // A relative/garbage imageUrl that fails to parse or fetch is the item's
      // problem, not a network outage — but be unspecific.
      return NextResponse.json({ error: 'unfetchable' }, { status: 422 });
    }
    throw error;
  }

  // 4. Store the image in items-raw via an owner-scoped presigned PUT.
  let rawKey: string;
  try {
    const { url: putUrl, key } = await requestUploadUrl(serverStorageClient(), ctx, {
      bucket: 'items-raw',
      ownerId: userId,
      ext: upload.ext,
      contentType: upload.contentType,
    });
    const put = await fetch(putUrl, {
      method: 'PUT',
      headers: { 'Content-Type': upload.contentType },
      body: imageBytes as BodyInit,
      signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
    });
    if (!put.ok) {
      throw new Error(`raw upload returned ${put.status}`);
    }
    rawKey = key;
  } catch (error) {
    console.error('[era-import] failed to store product image:', error);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }

  // 5. Run the shared pipeline with the bytes we already hold (no re-fetch).
  try {
    const result = await processItemPipeline(
      { ctx },
      {
        userId,
        rawKey,
        rawBytes: imageBytes,
        contentType: upload.contentType,
        source: 'link',
        prefill: {
          name: meta.name ?? null,
          brand: meta.brand ?? null,
          purchasePrice: meta.price ?? null,
          currency: meta.currency ?? null,
        },
      },
    );
    return NextResponse.json({ ...result, meta });
  } catch (error) {
    if (error instanceof PipelineError) {
      // rawBytes is supplied, so raw_unavailable cannot arise here; both map to 500.
      return NextResponse.json({ error: 'save_failed' }, { status: 500 });
    }
    throw error;
  }
}
