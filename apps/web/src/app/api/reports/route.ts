/**
 * Report a post or a profile — the UGC moderation intake the App Store requires.
 *
 *   POST /api/reports  { postId? | username?, reason, detail? }  →  { reported: true }
 *
 * Exactly one target: a `postId` (report the post AND, denormalized, its creator)
 * or a `username` (report the profile). `reason` is one of the four enum buckets;
 * `detail` is optional free text (≤500 chars). The reported user is ALWAYS
 * resolved server-side — a client can't spoof who it's reporting — and a BLOCK
 * does not shield its owner from being reported (you can report someone you've
 * blocked, and being blocked doesn't stop a report against you).
 *
 * DORMANT behind `ERA_FEED_ENABLED` (404 while off). Rate-limited to
 * `MAX_REPORTS_PER_DAY`.
 *
 * Responses:
 *   - 404 { error: 'not_found' }        feed dormant
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 403 { error: 'forbidden' }        cross-origin request
 *   - 400 { error: 'invalid' }          bad shape / reason / detail / not exactly one target
 *   - 400 { error: 'unknown' }          target resolves to no post/account
 *   - 400 { error: 'self' }             you cannot report yourself
 *   - 429 { error: 'daily_limit' }      report cap reached
 *   - 200 { reported: true }
 */
import { NextResponse } from 'next/server';

import { isReportReason } from '@era/core/feed';
import { createDbClient } from '@era/db';

import { auth } from '../../../lib/auth.ts';
import { isFeedEnabledServer } from '../../../lib/feed-server.ts';
import { optionalText } from '../../../lib/outfit-server.ts';
import {
  REPORT_DETAIL_MAX,
  checkReportLimit,
  createReport,
  resolveReportTarget,
} from '../../../lib/reports-server.ts';
import { isSameOrigin } from '../../../lib/shop-query.ts';
import { isValidUsername } from '../../../lib/username.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** reason + a bounded detail + a username is small — cap the body. */
const MAX_BODY_BYTES = 4 * 1024;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return null;
  }
  const rawBody = await request.text().catch(() => '');
  if (rawBody.length > MAX_BODY_BYTES) {
    return null;
  }
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  return body as Record<string, unknown>;
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isFeedEnabledServer()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const session = await auth.api.getSession({ headers: request.headers });
  const reporterId = session?.user.id;
  if (!reporterId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await readBody(request);
  if (body === null || !isReportReason(body.reason)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  // Optional free-text detail: absent/undefined → null; a present value must be a
  // non-empty string within the cap (optionalText enforces exactly that).
  const detailResult = optionalText(body, 'detail', REPORT_DETAIL_MAX);
  if (!detailResult.ok) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const detail = detailResult.value ?? null;

  // Exactly one target — a postId XOR a username, each well-formed.
  const hasPostId = 'postId' in body && body.postId !== undefined;
  const hasUsername = 'username' in body && body.username !== undefined;
  if (hasPostId === hasUsername) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  if (hasPostId && (typeof body.postId !== 'string' || !UUID_RE.test(body.postId))) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  if (hasUsername && !isValidUsername(body.username)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const target = await resolveReportTarget(db, {
    postId: hasPostId ? (body.postId as string) : undefined,
    username: hasUsername ? (body.username as string) : undefined,
  });
  if (target === null) {
    return NextResponse.json({ error: 'unknown' }, { status: 400 });
  }
  if (target.reportedUserId === reporterId) {
    return NextResponse.json({ error: 'self' }, { status: 400 });
  }

  const limit = await checkReportLimit(db, reporterId);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'daily_limit' }, { status: 429 });
  }

  await createReport(db, {
    reporterId,
    reportedUserId: target.reportedUserId,
    postId: target.postId,
    reason: body.reason,
    detail,
  });
  return NextResponse.json({ reported: true }, { status: 200 });
}
