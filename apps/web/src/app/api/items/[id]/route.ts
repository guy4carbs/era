/**
 * PATCH /api/items/[id]  { updates?: {...}, confirm?: boolean, archived?: boolean }
 *
 * Edit an item's tags and/or confirm them. Each field the caller actually
 * changes is (a) written to the row and (b) recorded as an append-only ai_events
 * row of kind tag_correction — one event per changed field — so the correction
 * signal is captured for later model tuning. confirm:true flips tags_confirmed
 * and is not itself a correction event.
 *
 * archived is a visibility toggle, not a tag edit: archived:true removes the item
 * from the closet gallery (archived:false restores it). It writes items.archived
 * and, like confirm, is never recorded as a tag_correction.
 *
 * This is a WRITE, so it goes through the @era/core authz path: we load the item
 * (404 when it doesn't exist), then ownerOnly (403 when the caller isn't the
 * owner) before mutating anything.
 *
 * name cannot be cleared (the column is NOT NULL); the other tag fields accept
 * null. category is validated against the item-category enum.
 *
 * Responses:
 *   - 401 { error: 'unauthenticated' }  no session
 *   - 400 { error: 'invalid' }          body failed validation
 *   - 403 { error: 'forbidden' }        caller is not the owner
 *   - 404 { error: 'not_found' }        no item with that id
 *   - 200 { item }                      the updated (or unchanged) row
 */
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { type AuthContext, AuthzError, ownerOnly, requireUser } from '@era/core';
import { type Item, type ItemCategory, aiEvents, createDbClient, itemCategory, items } from '@era/db';

import { auth } from '../../../../lib/auth.ts';

const db = createDbClient(process.env.DATABASE_URL!);

// Editable tag fields. name is non-nullable (NOT NULL column); the rest clear to null.
interface ItemUpdates {
  category?: ItemCategory;
  name?: string;
  brand?: string | null;
  colorPrimary?: string | null;
  colors?: string[] | null;
  pattern?: string | null;
}

interface ParsedBody {
  updates: ItemUpdates;
  confirm: boolean;
  archived?: boolean;
}

const UPDATABLE_FIELDS = ['category', 'name', 'brand', 'colorPrimary', 'colors', 'pattern'] as const;
const NULLABLE_FIELDS = new Set<string>(['brand', 'colorPrimary', 'pattern']);

// The closed set of pattern values (mirrors the classify tool + the process-item
// prompt). Anything else — including an empty string — is rejected; null clears.
const PATTERN_VALUES = new Set<string>(['solid', 'striped', 'checked', 'floral', 'graphic', 'animal', 'other']);

// Length caps for user-supplied tag strings (Sentinel LOW: bound stored text).
const NAME_MAX = 120;
const SHORT_TEXT_MAX = 64; // brand, colorPrimary, pattern
const COLORS_MAX = 8;
const COLOR_ITEM_MAX = 32;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/**
 * Validate the request body without zod (not a dependency of apps/web). Returns
 * the parsed shape, or null when anything is malformed or an unknown key appears.
 */
function parseBody(body: unknown): ParsedBody | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const root = body as Record<string, unknown>;
  for (const key of Object.keys(root)) {
    if (key !== 'updates' && key !== 'confirm' && key !== 'archived') {
      return null;
    }
  }

  let confirm = false;
  if ('confirm' in root && root.confirm !== undefined) {
    if (typeof root.confirm !== 'boolean') {
      return null;
    }
    confirm = root.confirm;
  }

  let archived: boolean | undefined;
  if ('archived' in root && root.archived !== undefined) {
    if (typeof root.archived !== 'boolean') {
      return null;
    }
    archived = root.archived;
  }

  const updates: ItemUpdates = {};
  if ('updates' in root && root.updates !== undefined) {
    if (typeof root.updates !== 'object' || root.updates === null) {
      return null;
    }
    const raw = root.updates as Record<string, unknown>;
    for (const key of Object.keys(raw)) {
      if (!(UPDATABLE_FIELDS as readonly string[]).includes(key)) {
        return null;
      }
    }
    if ('category' in raw) {
      if (typeof raw.category !== 'string' || !(itemCategory.enumValues as readonly string[]).includes(raw.category)) {
        return null;
      }
      updates.category = raw.category as ItemCategory;
    }
    if ('name' in raw) {
      if (typeof raw.name !== 'string' || raw.name.length === 0 || raw.name.length > NAME_MAX) {
        return null;
      }
      updates.name = raw.name;
    }
    if ('colors' in raw) {
      if (raw.colors !== null && !isStringArray(raw.colors)) {
        return null;
      }
      if (Array.isArray(raw.colors) && (raw.colors.length > COLORS_MAX || raw.colors.some((c) => c.length > COLOR_ITEM_MAX))) {
        return null;
      }
      updates.colors = raw.colors as string[] | null;
    }
    for (const field of NULLABLE_FIELDS) {
      if (field in raw) {
        const value = raw[field];
        if (value !== null && typeof value !== 'string') {
          return null;
        }
        if (typeof value === 'string') {
          if (value.length > SHORT_TEXT_MAX) {
            return null;
          }
          // pattern is a closed enum; brand/colorPrimary are free text (length-capped only).
          if (field === 'pattern' && !PATTERN_VALUES.has(value)) {
            return null;
          }
        }
        updates[field as 'brand' | 'colorPrimary' | 'pattern'] = value as string | null;
      }
    }
  }

  return { updates, confirm, archived };
}

// True when a candidate value differs from the item's current value.
function differs(field: string, current: unknown, next: unknown): boolean {
  if (field === 'colors') {
    return JSON.stringify(current ?? null) !== JSON.stringify(next ?? null);
  }
  return current !== next;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const sessionResult = await auth.api.getSession({ headers: request.headers });
  const ctx: AuthContext = { userId: sessionResult?.user.id ?? null };

  try {
    requireUser(ctx);
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    throw error;
  }

  const { id } = await params;

  const parsed = parseBody(await request.json().catch(() => null));
  if (!parsed) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const { updates, confirm, archived } = parsed;

  const [item] = await db.select().from(items).where(eq(items.id, id)).limit(1);
  if (!item) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  try {
    ownerOnly(ctx, item.userId);
  } catch (error) {
    if (error instanceof AuthzError) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    throw error;
  }

  const current = item as unknown as Record<string, unknown>;
  const setClause: Record<string, unknown> = {};
  const events: { userId: string; kind: 'tag_correction'; payload: unknown }[] = [];

  for (const [field, value] of Object.entries(updates)) {
    if (differs(field, current[field], value)) {
      setClause[field] = value;
      events.push({ userId: item.userId, kind: 'tag_correction', payload: { itemId: id, field, from: current[field] ?? null, to: value } });
    }
  }
  if (confirm && item.tagsConfirmed !== true) {
    setClause.tagsConfirmed = true;
  }
  // archived is a visibility flag, not a tag edit — no ai_events row.
  if (archived !== undefined && item.archived !== archived) {
    setClause.archived = archived;
  }

  let updated: Item = item;
  if (Object.keys(setClause).length > 0) {
    const [row] = await db
      .update(items)
      .set(setClause as Partial<typeof items.$inferInsert>)
      .where(eq(items.id, id))
      .returning();
    if (row) {
      updated = row;
    }
  }
  if (events.length > 0) {
    await db.insert(aiEvents).values(events);
  }

  return NextResponse.json({ item: updated });
}
