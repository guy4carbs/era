import { ShopBrowser } from '../../../components/shop';

/**
 * The Shop tab — full-screen, browsable, honest. All state, the search→rank
 * pipeline, filters, and the affiliate click-out live in the client
 * {@link ShopBrowser}; this page is the route entry that mounts it.
 */
export default function ShopPage() {
  return <ShopBrowser />;
}
