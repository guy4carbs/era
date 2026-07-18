'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence } from 'motion/react';
import { useSession } from '../../lib/auth-client';
import { OviChat } from './OviChat';
import type { CutoutInfo, ItemsById } from './types';

/** What a closet row from `GET /api/items` carries that the outfit card needs. */
interface ItemsApiRow extends CutoutInfo {
  id: string;
}

interface OviChatContextValue {
  isOpen: boolean;
  /** A focal item id when the chat was opened to style a specific piece. */
  itemContext: string | null;
  /** Resolves an outfit's item ids to their cutouts, shared by every surface. */
  itemsById: ItemsById;
  openChat: (opts?: { itemContext?: string }) => void;
  closeChat: () => void;
}

const OviChatContext = createContext<OviChatContextValue | null>(null);

/**
 * Owns whether Ovi's chat sheet is open and, once loaded, the shared cutout map
 * every Ovi surface resolves outfit item ids against. Mount once in the tab
 * shell: the FAB toggles the sheet through {@link useOviChat}, and the Feed
 * "Today" card reads the same cutout map so it never re-fetches the closet.
 */
export function OviChatProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [itemContext, setItemContext] = useState<string | null>(null);
  const [itemsById, setItemsById] = useState<ItemsById>(() => new Map());

  // Load the closet once a session exists, so both the chat and the Today card
  // can resolve real cutouts without each hitting /api/items themselves.
  useEffect(() => {
    if (isPending || !session) return;
    let active = true;
    void (async () => {
      try {
        const res = await fetch('/api/items');
        if (!res.ok) throw new Error('items fetch failed');
        const body = (await res.json()) as { items: ItemsApiRow[] };
        if (!active) return;
        const map = new Map<string, CutoutInfo>();
        for (const item of body.items) {
          map.set(item.id, {
            displayUrl: item.displayUrl,
            name: item.name,
            category: item.category,
          });
        }
        setItemsById(map);
      } catch {
        // Non-fatal: cards fall back to bare tiles when a cutout can't resolve.
      }
    })();
    return () => {
      active = false;
    };
  }, [isPending, session]);

  const openChat = useCallback((opts?: { itemContext?: string }) => {
    setItemContext(opts?.itemContext ?? null);
    setIsOpen(true);
  }, []);

  const closeChat = useCallback(() => {
    setIsOpen(false);
    setItemContext(null);
  }, []);

  const value = useMemo<OviChatContextValue>(
    () => ({ isOpen, itemContext, itemsById, openChat, closeChat }),
    [isOpen, itemContext, itemsById, openChat, closeChat],
  );

  return (
    <OviChatContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {isOpen ? (
          <OviChat itemContext={itemContext} itemsById={itemsById} onClose={closeChat} />
        ) : null}
      </AnimatePresence>
    </OviChatContext.Provider>
  );
}

/** Access Ovi's chat controls (open/close) and the shared cutout map. */
export function useOviChat(): OviChatContextValue {
  const ctx = useContext(OviChatContext);
  if (!ctx) throw new Error('useOviChat must be used within an OviChatProvider');
  return ctx;
}
