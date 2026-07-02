/**
 * Style-profile derivation — the mobile call into the server endpoint.
 *
 *   POST ${EXPO_PUBLIC_API_URL}/api/derive-style-profile  { answers } -> { profile, source }
 *
 * The request must carry the signed-in session. Better Auth's Expo plugin
 * persists the session cookie in SecureStore and patches the client's own
 * fetch (`authClient.$fetch`) to inject that cookie and the configured baseURL,
 * so calling through `$fetch` is what attaches credentials — a bare `fetch`
 * would go out anonymous and 401. If `$fetch` is unavailable we fall back to a
 * plain fetch that reads the cookie via the plugin-exposed `getCookie()`.
 *
 * On any failure the caller derives the profile locally with
 * `deterministicProfile`, so the reveal always has something honest to show.
 */
import { authClient } from '@/lib/auth-client';

import { toQuizAnswers, type QuizAnswerMap, type StyleProfileResult } from './contract';

/** Where the profile came from — mirrors the server's `source` field. */
export type ProfileSource = 'llm' | 'deterministic';

/** The endpoint's success payload. */
export interface DeriveResult {
  readonly profile: StyleProfileResult;
  readonly source: ProfileSource;
}

const ENDPOINT = '/api/derive-style-profile';

/** The subset of the auth client we call, named structurally to stay strict. */
interface AuthFetchClient {
  readonly $fetch?: <T>(
    path: string,
    options: { method: string; body: unknown },
  ) => Promise<{ data: T | null; error: { message?: string } | null }>;
  readonly getCookie?: () => string;
}

/**
 * Derive the style profile on the server, authenticated as the current user.
 * Throws on any non-success so the caller can fall back to the local profile.
 */
export async function deriveStyleProfile(answers: QuizAnswerMap): Promise<DeriveResult> {
  const client = authClient as unknown as AuthFetchClient;
  const body = { answers: toQuizAnswers(answers) };

  if (typeof client.$fetch === 'function') {
    const { data, error } = await client.$fetch<DeriveResult>(ENDPOINT, {
      method: 'POST',
      body,
    });
    if (error || !data) {
      throw new Error(error?.message ?? 'derive-style-profile failed');
    }
    return data;
  }

  // Fallback: bare fetch with the plugin-stored cookie attached by hand.
  const baseURL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
  const cookie = client.getCookie?.() ?? '';
  const response = await fetch(`${baseURL}${ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`derive-style-profile failed: ${response.status}`);
  }
  return (await response.json()) as DeriveResult;
}
