/**
 * Username format rules, shared by the availability check and the update route
 * so both enforce exactly one definition.
 *
 * A valid username is 3–20 characters of lowercase letters, digits, and
 * underscores. This is a server-side boundary validation — never trust the
 * client to have checked.
 */
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/** True when `value` is a well-formed username. */
export function isValidUsername(value: unknown): value is string {
  return typeof value === 'string' && USERNAME_RE.test(value);
}
