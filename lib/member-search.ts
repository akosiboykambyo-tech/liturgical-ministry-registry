/**
 * Match name words across first and last name in any order, as in public
 * verification. Keep single-term parish and UID lookups for admin use.
 *
 * Returns a PostgREST boolean expression for supabase.or(...).
 */
export function memberSearchExpression(input: string): string | null {
  const tokens = input
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}'-]/gu, ""))
    .filter(Boolean);

  if (tokens.length === 0) return null;

  const escapeLike = (value: string) => value.replace(/[%_\\]/g, "\\$&");
  const termClauses = tokens.map((token) => {
    const safe = escapeLike(token);
    return `or(first_name.ilike.%${safe}%,last_name.ilike.%${safe}%)`;
  });

  if (tokens.length === 1) {
    const safe = escapeLike(tokens[0]);
    return `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,parish.ilike.%${safe}%,uid.ilike.%${safe}%`;
  }

  return `and(${termClauses.join(",")})`;
}
