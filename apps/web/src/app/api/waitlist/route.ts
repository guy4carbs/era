/**
 * POST /api/waitlist   { email: string, ref?: string }
 *
 * Public, UNAUTHENTICATED waitlist signup. Because there is no session to lean
 * on, this handler carries its own abuse hardening: a request-body size cap, a
 * best-effort per-IP rate limit, and a same-origin check for browser POSTs.
 *
 * Responses (the contract the marketing form codes against):
 *   - 200 { referralCode: string, alreadyJoined: boolean }  joined (or re-joined)
 *   - 400 { error: 'invalid_email' }                        body/email invalid
 *   - 403 { error: 'forbidden' }                            cross-origin POST
 *   - 429 { error: 'rate_limited' }                         too many from this IP
 *   - 500 { error: 'server_error' }                         unexpected failure
 */
import { NextResponse } from 'next/server';

import { canInsertWaitlist } from '@era/core';
import { createDbClient } from '@era/db';

import { joinWaitlist, normalizeEmail } from '../../../lib/waitlist-server.ts';
import { notifyNewWaitlistSignup } from '../../../lib/waitlist-signup-notify.ts';

/** Server-only DB client for the best-effort suppression check on the signup email. */
const db = createDbClient(process.env.DATABASE_URL!);

/** Reject bodies larger than this (bytes) — the payload is a tiny JSON object. */
const MAX_BODY_BYTES = 2 * 1024;

/** Sliding-window rate limit: at most this many requests per IP per window. */
const RATE_LIMIT_MAX = 5;
/** Rate-limit window length in milliseconds. */
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * In-memory sliding window of recent request timestamps, keyed by client IP.
 *
 * NOTE: this is per-instance and best-effort only — it resets on redeploy and is
 * not shared across serverless instances. A durable, shared rate limit is
 * backlog; this raises the cost of trivial abuse without new infrastructure.
 */
const requestLog = new Map<string, number[]>();

/**
 * Extract the real client IP for rate-limiting on Railway.
 *
 * Railway fronts every service with a SINGLE trusted edge proxy (Envoy). That
 * proxy appends the client IP it observed on the actual TCP connection to the
 * RIGHT of `x-forwarded-for`, and also exposes it as the single-value
 * `x-envoy-external-address`. Anything a client puts in `x-forwarded-for` lands
 * to the LEFT of that appended hop — so the LEFTMOST entry is attacker-supplied
 * and MUST NOT key the limiter (rotating it per request would mint a fresh
 * bucket every time and defeat the limit). We therefore trust, in order:
 *   1. `x-envoy-external-address` — Envoy's non-forgeable client address, then
 *   2. the RIGHTMOST `x-forwarded-for` entry — the one hop Railway's edge adds.
 * `x-real-ip` is NOT set by Railway's edge, so it is client-forgeable and is
 * deliberately not trusted. Do not "simplify" this back to `split(',')[0]`.
 */
function clientIp(request: Request): string {
  const envoy = request.headers.get('x-envoy-external-address')?.trim();
  if (envoy) return envoy;
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded.split(',');
    return hops[hops.length - 1]!.trim();
  }
  return 'unknown';
}

/** Record a hit for `ip` and report whether it is now over the limit. */
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const recent = (requestLog.get(ip) ?? []).filter((t) => t > cutoff);
  recent.push(now);
  requestLog.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX;
}

/**
 * Same-origin guard for this public form POST. When the browser sends an
 * `Origin`, its host must match the request host; a mismatch is a cross-site
 * POST and is rejected. A missing Origin (non-browser clients) is allowed — the
 * rate limit still applies. No session/auth is required.
 */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const host = request.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  canInsertWaitlist();

  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  if (isRateLimited(clientIp(request))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  // Cheap pre-read guard: trust a declared oversized length before buffering.
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }

  // Hard guard: cap the actual bytes read in case content-length lied/was absent.
  const raw = await request.text().catch(() => '');
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }

  const root = body as Record<string, unknown>;
  const email = normalizeEmail(root.email);
  if (!email) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }
  const ref = typeof root.ref === 'string' ? root.ref : undefined;

  try {
    const result = await joinWaitlist({ email, ref });
    // Best-effort: confirmation email + audience add for a genuinely NEW signup
    // only. Gated on `alreadyJoined` and non-throwing, so it never turns a
    // successful join into a 500 nor re-sends on a duplicate submit.
    await notifyNewWaitlistSignup({ email, alreadyJoined: result.alreadyJoined, db, position: result.position });
    return NextResponse.json(result, { status: 200 });
  } catch {
    // Never leak database internals to the client.
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
