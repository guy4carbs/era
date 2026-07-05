/**
 * GET /api/admin/ai-spend
 *
 * The day's AI spend, so costs are visible from day one. Session-required and
 * NOT public: an allowlisted admin (email in `AI_SPEND_ADMIN_EMAILS`, a
 * comma-separated env list) sees the GLOBAL rollup across all users; any other
 * authed user sees ONLY their own spend. Non-admins are never shown other users'
 * data. When the allowlist is unset, no one is an admin — every caller sees just
 * their own row.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 200 { date, totalUsd, byRoute, count }
 */
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, requireUser } from '@era/core';
import { createDbClient } from '@era/db';

import { auth } from '../../../../lib/auth.ts';
import { dailySpend, utcDayStart } from '../../../../lib/ai-usage.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/**
 * The set of admin emails from `AI_SPEND_ADMIN_EMAILS` (comma-separated),
 * normalized to trimmed lowercase. Empty when the var is unset — so no caller is
 * an admin and everyone is scoped to their own spend.
 */
function adminEmails(): ReadonlySet<string> {
  const raw = process.env.AI_SPEND_ADMIN_EMAILS ?? '';
  return new Set(
    raw
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
  );
}

export async function GET(request: Request): Promise<NextResponse> {
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

  const email = sessionResult?.user.email?.trim().toLowerCase() ?? '';
  const isAdmin = email.length > 0 && adminEmails().has(email);

  // Admins see the global rollup; everyone else is scoped to their own spend.
  const spend = await dailySpend(db, isAdmin ? {} : { userId });
  const date = utcDayStart().toISOString().slice(0, 10);

  return NextResponse.json({ date, totalUsd: spend.totalUsd, byRoute: spend.byRoute, count: spend.count });
}
