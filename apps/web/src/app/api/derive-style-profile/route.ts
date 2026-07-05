/**
 * Style-quiz profiling endpoint.
 *
 *   POST /api/derive-style-profile  { answers: QuizAnswers }
 *   GET  /api/derive-style-profile
 *
 * The client sends only the raw quiz answers — the server computes the whole
 * profile. This keeps the contract small and the result trustworthy: nothing
 * the client asserts about its own archetype/palette is taken on faith.
 *
 * Derivation is deterministic first (`deterministicProfile`), then optionally
 * polished by Claude when a real ANTHROPIC_API_KEY is configured. The LLM path
 * is code-complete but dormant without a key, and any LLM failure falls back to
 * the deterministic result — the request never fails because the model did.
 *
 * Both a `style_profiles` upsert and an `ai_events` row are written together;
 * a DB failure is the only thing that turns into a 500.
 *
 * Responses (POST):
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 400 { error: 'invalid' }          answers failed schema validation
 *   - 500 { error: 'save_failed' }      persistence failed
 *   - 200 { profile, source }           source is 'llm' or 'deterministic'
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, requireUser } from '@era/core';
import {
  ARCHETYPES,
  QUIZ_STEPS,
  QuizAnswersSchema,
  StyleProfileResultSchema,
  deterministicProfile,
  scoreQuiz,
  type QuizAnswers,
  type StyleProfileResult,
} from '@era/core/quiz';
import { strings } from '@era/core/strings';
import { aiEvents, createDbClient, styleProfiles } from '@era/db';

import { auth } from '../../../lib/auth.ts';
import { checkDailyLimit, recordUsage } from '../../../lib/ai-usage.ts';

const db = createDbClient(process.env.DATABASE_URL!);

/** Which derivation produced the profile we returned. */
type ProfileSource = 'llm' | 'deterministic';

/** The scoring detail we hand to the model — archetype totals + winner. */
type QuizScoring = ReturnType<typeof scoreQuiz>;

/** The Claude model that polishes the profile — single-sourced for the spend log. */
const DERIVE_MODEL = 'claude-opus-4-8';

/** A successful LLM polish: the refined profile plus the call's token usage. */
interface LlmPolish {
  readonly profile: StyleProfileResult;
  readonly usage: { readonly model: string; readonly inputTokens: number; readonly outputTokens: number };
}

/**
 * True only for a real, operator-supplied Anthropic key. The committed
 * `.env.example` ships obvious placeholders (`change-me-…`, `sk-ant-xxxx…`);
 * treating those as configured would fire a request that can only fail, so we
 * reject them explicitly and stay on the deterministic path.
 */
function isRealCredential(value: string | undefined): value is string {
  if (!value) {
    return false;
  }
  return !value.startsWith('change-me') && !value.startsWith('sk-ant-xxxx');
}

/**
 * Resolve the caller into a user id, or a ready-to-return 401. Mirrors the
 * write-route authz pattern: session → AuthContext → requireUser.
 */
async function authenticate(request: Request): Promise<{ userId: string } | { response: NextResponse }> {
  const sessionResult = await auth.api.getSession({ headers: request.headers });
  const ctx: AuthContext = { userId: sessionResult?.user.id ?? null };
  try {
    return { userId: requireUser(ctx) };
  } catch (error) {
    if (error instanceof AuthzError) {
      return { response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
    }
    throw error;
  }
}

/**
 * Build the polishing prompt. We hand the model the quiz definition (so it can
 * read answer ids as human labels itself), the raw answers, the scoring totals,
 * the deterministic profile, and the archetype dictionary — then ask for a
 * refined final profile.
 */
function buildPrompt(answers: QuizAnswers, det: StyleProfileResult, scoring: QuizScoring): string {
  return [
    "You are Ovi, Era's AI stylist. A user just finished the style quiz. Turn the raw signals below into a warm, personal style profile.",
    '',
    'The quiz definition (steps, options, and their labels) — use it to read the answer ids below as human labels:',
    JSON.stringify(QUIZ_STEPS),
    '',
    "The user's answers (chosen option ids, keyed by step):",
    JSON.stringify(answers),
    '',
    'Deterministic scoring — per-archetype totals and the computed winner:',
    JSON.stringify(scoring),
    '',
    'The deterministic profile we would ship if you change nothing:',
    JSON.stringify(det),
    '',
    'The eight style archetypes and what each one means:',
    JSON.stringify(ARCHETYPES),
    '',
    'Produce the final style profile:',
    '- Keep the winning archetype as the primary unless another archetype is within 1 point of it in the totals; only then may you choose the better fit.',
    '- Set secondary to the next-strongest archetype.',
    '- Refine the palette into 3-6 tasteful hex colors that honor the palette answer the user chose.',
    '- Write 4-6 short style keywords.',
    "- Write an era_suggestion (title plus a one-to-two-sentence description) drawn from the user's chosen mood.",
    'Keep the whole profile tasteful and warm. No marketing-speak, no hype, no emoji.',
  ].join('\n');
}

/**
 * Ask Claude to polish the deterministic profile. Returns the refined profile
 * plus the call's token usage (for the spend log), or null on any failure (bad
 * parse, timeout, API error) so the caller can fall back to the deterministic
 * result. Errors are logged server-side only — never the key, never leaked to
 * the client.
 */
async function polishWithLlm(
  apiKey: string,
  answers: QuizAnswers,
  det: StyleProfileResult,
  scoring: QuizScoring,
): Promise<LlmPolish | null> {
  try {
    const client = new Anthropic({ apiKey, maxRetries: 1 });
    const response = await client.messages.parse(
      {
        model: DERIVE_MODEL,
        max_tokens: 2048,
        // StyleProfileResultSchema is a zod v3 schema (core pins zod ^3); the SDK
        // helper's types expect zod v4. Cast at this dormant-LLM boundary rather
        // than touch the frozen schema — the runtime schema is unchanged.
        output_config: { format: zodOutputFormat(StyleProfileResultSchema as never), effort: 'low' },
        messages: [{ role: 'user', content: buildPrompt(answers, det, scoring) }],
      },
      { timeout: 15_000 },
    );
    const profile = (response.parsed_output as StyleProfileResult | null) ?? null;
    if (!profile) {
      return null;
    }
    return {
      profile,
      usage: { model: DERIVE_MODEL, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    };
  } catch (error) {
    console.error('[era-quiz] LLM polish failed; falling back to deterministic profile:', error);
    return null;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const authResult = await authenticate(request);
  if ('response' in authResult) {
    return authResult.response;
  }
  const { userId } = authResult;

  const body: unknown = await request.json().catch(() => null);
  const parsed = QuizAnswersSchema.safeParse((body as { answers?: unknown } | null)?.answers);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const answers = parsed.data;

  // Per-user daily rate limit on profile derivation (rarely hit).
  const check = await checkDailyLimit(db, userId, 'derive-style-profile');
  if (!check.allowed) {
    return NextResponse.json({ error: 'daily_limit', message: strings.ovi.limitReachedProfile }, { status: 429 });
  }

  const det = deterministicProfile(answers);
  const scoring = scoreQuiz(answers);

  let result: StyleProfileResult = det;
  let source: ProfileSource = 'deterministic';

  let usage: LlmPolish['usage'] | null = null;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (isRealCredential(apiKey)) {
    const polished = await polishWithLlm(apiKey, answers, det, scoring);
    if (polished) {
      result = polished.profile;
      source = 'llm';
      usage = polished.usage;
    }
  }

  try {
    await db
      .insert(styleProfiles)
      .values({ userId, archetype: result.archetype, palette: result.palette, quizAnswers: { answers, result, source } })
      .onConflictDoUpdate({
        target: styleProfiles.userId,
        set: { archetype: result.archetype, palette: result.palette, quizAnswers: { answers, result, source } },
      });

    await db.insert(aiEvents).values({
      userId,
      kind: 'quiz',
      payload: { answers, deterministic: det, final: result, source },
    });
  } catch (error) {
    console.error('[era-quiz] failed to persist style profile:', error);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }

  // Log the call for the rate-limit counter and spend rollup. The LLM polish is
  // dormant without a real key, so the deterministic path logs a null-model $0
  // row; when Claude ran, its model + real token counts are recorded so the
  // spend is priced. Best-effort — never 500s here.
  await recordUsage(db, userId, 'derive-style-profile', {
    model: usage?.model ?? null,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
  });

  return NextResponse.json({ profile: result, source });
}

export async function GET(request: Request): Promise<NextResponse> {
  const authResult = await authenticate(request);
  if ('response' in authResult) {
    return authResult.response;
  }
  const { userId } = authResult;

  const rows = await db.select().from(styleProfiles).where(eq(styleProfiles.userId, userId)).limit(1);
  return NextResponse.json({ profile: rows[0] ?? null });
}
