/**
 * Waitlist server helpers — referral-code minting, input sanitizing, and the
 * idempotent join against the `waitlist` table.
 *
 * The pure helpers (`generateReferralCode`, `sanitizeRef`, `normalizeEmail`) are
 * exported for unit testing without a live database. `joinWaitlist` is the only
 * function that touches Neon; the route validates the email first, but the
 * helpers re-validate defensively — nothing here trusts its caller.
 */
import { randomBytes } from 'node:crypto';

import { and, eq, lt, or, sql } from 'drizzle-orm';

import { createDbClient, waitlist } from '@era/db';

/**
 * Crockford base32 alphabet — no I/L/O/U to avoid ambiguity. Exactly 32 symbols,
 * so a random byte masked to 5 bits (`& 31`) maps uniformly onto it (256 = 8×32,
 * so there is no modulo bias).
 */
const REFERRAL_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Generated referral codes are 8 characters of {@link REFERRAL_ALPHABET}. */
const REFERRAL_CODE_LENGTH = 8;

/** A referral code as accepted from a caller: 8 Crockford base32 chars. */
const REFERRAL_CODE_RE = /^[0-9A-HJKMNP-TV-Z]{8}$/;

/** Local-part + domain, both non-empty and space/@-free, with a dotted domain. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** RFC-practical upper bound on an email address length. */
const EMAIL_MAX = 254;

const db = createDbClient(process.env.DATABASE_URL!);

/**
 * Mint a fresh 8-char Crockford base32 referral code using CSPRNG bytes.
 */
export function generateReferralCode(): string {
  const bytes = randomBytes(REFERRAL_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i += 1) {
    code += REFERRAL_ALPHABET[bytes[i]! & 31];
  }
  return code;
}

/**
 * Sanitize a caller-supplied referral code. Anything that is not exactly a
 * well-formed 8-char Crockford code becomes `null` — a malformed `ref` is
 * silently dropped, never stored.
 */
export function sanitizeRef(ref: unknown): string | null {
  return typeof ref === 'string' && REFERRAL_CODE_RE.test(ref) ? ref : null;
}

/**
 * Normalize and validate an email at the boundary: trim, lowercase, bound the
 * length, and require a plausible `local@domain.tld` shape. Returns the cleaned
 * address, or `null` when the input is not a usable email.
 */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const email = input.trim().toLowerCase();
  if (email.length === 0 || email.length > EMAIL_MAX) return null;
  return EMAIL_RE.test(email) ? email : null;
}

export interface JoinWaitlistInput {
  readonly email: string;
  readonly ref?: string | undefined;
}

export interface JoinWaitlistResult {
  readonly referralCode: string;
  readonly alreadyJoined: boolean;
  /**
   * The joiner's 1-based place in line — the count of rows at or before this
   * row in `(createdAt, id)` order (see {@link positionOf}). Present for both a
   * fresh join and a re-join: an already-joined email still has a place, and the
   * gift shows it the same way.
   */
  readonly position: number;
}

/**
 * The joiner's 1-based place in line: COUNT of waitlist rows whose
 * `(createdAt, id)` is at or before this row's. Ordering by `createdAt` then
 * breaking ties on `id` makes the rank deterministic even for rows minted inside
 * the same millisecond (or sharing a `defaultNow()` transaction timestamp) — the
 * same total order the export and the gift card read from.
 *
 * SCALE BACKLOG: this is an unindexed sequential count over the whole table.
 * The waitlist is small (pre-launch capture), so it is deliberately fine here; a
 * composite `(created_at, id)` index + migration is the documented next step if
 * the list ever grows enough for the count to cost.
 */
async function positionOf(createdAt: Date, id: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(waitlist)
    .where(
      or(
        lt(waitlist.createdAt, createdAt),
        and(eq(waitlist.createdAt, createdAt), sql`${waitlist.id} <= ${id}`),
      ),
    );
  // A row always counts itself, so this is ≥ 1; guard the empty-result path.
  return rows[0]?.count ?? 1;
}

/**
 * Idempotently add an email to the waitlist. Re-signing up is a success, not an
 * error: on a unique-email conflict the existing row's referral code is returned
 * with `alreadyJoined: true`. A malformed `ref` is stored as `null`. Either way
 * the result carries the joiner's `position` in line (see {@link positionOf}).
 *
 * Throws only for a genuinely invalid email (the route rejects those first) or a
 * database failure — the route maps the latter to a generic 500.
 */
export async function joinWaitlist({ email, ref }: JoinWaitlistInput): Promise<JoinWaitlistResult> {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error('invalid_email');

  const referredBy = sanitizeRef(ref);
  const referralCode = generateReferralCode();

  const inserted = await db
    .insert(waitlist)
    .values({ email: normalized, referralCode, referredBy })
    .onConflictDoNothing({ target: waitlist.email })
    .returning({
      referralCode: waitlist.referralCode,
      createdAt: waitlist.createdAt,
      id: waitlist.id,
    });

  const insertedRow = inserted[0];
  if (insertedRow?.referralCode) {
    const position = await positionOf(insertedRow.createdAt, insertedRow.id);
    return { referralCode: insertedRow.referralCode, alreadyJoined: false, position };
  }

  // Conflict on the unique email — return the referral code + place already on file.
  const existing = await db
    .select({
      referralCode: waitlist.referralCode,
      createdAt: waitlist.createdAt,
      id: waitlist.id,
    })
    .from(waitlist)
    .where(eq(waitlist.email, normalized))
    .limit(1);

  const existingRow = existing[0];
  const position = existingRow
    ? await positionOf(existingRow.createdAt, existingRow.id)
    : 1;
  return {
    referralCode: existingRow?.referralCode ?? referralCode,
    alreadyJoined: true,
    position,
  };
}
