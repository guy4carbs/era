/**
 * POST /api/email/preferences  (form-encoded: email, token, action)
 *
 * The write half of the preferences page. No session — authorized by the signed
 * token bound to the address (same gate as the unsubscribe route). `action` is
 * `subscribe` (remove the manual suppression) or `unsubscribe` (add it). On
 * success we 303-redirect BACK to the preferences page carrying the same signed
 * link plus `?saved=1`, so the page re-renders the new state with a quiet
 * confirmation. An invalid token → 400 plain message; no DB write.
 *
 * Logic lives in `lib/email-preferences.ts` (unit-tested with injected seams);
 * this route only reads the form body and maps the result to a response.
 */
import { NextResponse } from 'next/server';

import { createDbClient } from '@era/db';

import { addSuppression, isManuallySuppressed, removeSuppression } from '../../../../lib/email-suppression.ts';
import { updatePreferences, type PreferencesAction } from '../../../../lib/email-preferences.ts';
import { buildPreferencesUrl } from '../../../../lib/email-links.ts';

const db = createDbClient(process.env.DATABASE_URL!);

const INVALID_MESSAGE = "This preferences link isn't valid. It may have expired or been altered.";

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData().catch(() => null);
  const email = typeof form?.get('email') === 'string' ? (form.get('email') as string) : null;
  const token = typeof form?.get('token') === 'string' ? (form.get('token') as string) : null;
  const rawAction = form?.get('action');
  const action: PreferencesAction = rawAction === 'subscribe' ? 'subscribe' : 'unsubscribe';

  const result = await updatePreferences(email, token, action, {
    isManuallyUnsubscribed: (addr) => isManuallySuppressed(db, addr),
    subscribe: (addr) => removeSuppression(db, addr),
    unsubscribe: (addr) => addSuppression(db, addr, 'manual'),
  });

  if (result.kind === 'invalid') {
    return new NextResponse(INVALID_MESSAGE, {
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  // Re-render the page with the fresh state. buildPreferencesUrl re-signs the link
  // for this address; append the quiet ?saved=1 confirmation flag.
  const back = `${buildPreferencesUrl(email!)}&saved=1`;
  return NextResponse.redirect(back, 303);
}
