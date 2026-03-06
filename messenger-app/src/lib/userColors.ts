/**
 * Telegram Web-style user colors.
 * 8 fixed colors assigned deterministically based on user ID hash.
 */

const USER_COLORS = [
  '#e17076', // Red
  '#7bc862', // Green
  '#e5ca77', // Yellow
  '#65aadd', // Blue
  '#a695e7', // Purple
  '#6ec9cb', // Cyan
  '#ee7aae', // Pink
  '#faa774', // Orange
] as const;

/** djb2 string hash → non-negative integer */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0x7fffffff;
  }
  return hash;
}

/**
 * Returns one of 8 Telegram-style colors for a given user identifier.
 * Deterministic: same input → same color.
 */
export function getUserColor(userIdOrName: string): string {
  if (!userIdOrName) return USER_COLORS[0];
  return USER_COLORS[hashString(userIdOrName) % USER_COLORS.length];
}

export { USER_COLORS };
