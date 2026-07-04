/**
 * Client-side length caps for outfit + era text fields, mirroring the pinned
 * server contract in `lib/outfit-server.ts`. Duplicated here (as DATA, not design
 * tokens) so the canvas can bound inputs without importing the server module —
 * that module pulls in the R2 client and must never reach the browser bundle.
 */
export const OUTFIT_NAME_MAX = 120;
export const OUTFIT_OCCASION_MAX = 80;
export const ERA_TITLE_MAX = 80;
export const ERA_DESCRIPTION_MAX = 300;
