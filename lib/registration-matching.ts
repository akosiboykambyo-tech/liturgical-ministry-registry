/**
 * Pure registration identity matching utilities.
 * No Supabase dependency: can be tested against synthetic records offline.
 */
export type IdentityMatchKind = "exact" | "same_name_different_parish" | "similar_name";

export type IdentityDetails = {
  first_name: string;
  last_name: string;
  parish: string;
};

function normalize(value: string): string {
  return value.toLocaleLowerCase().trim().replace(/\s+/g, " ");
}

function levenshteinDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const prior = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = prior;
    }
  }
  return previous[b.length];
}

export function similarityRatio(a: string, b: string): number {
  const first = normalize(a);
  const second = normalize(b);
  if (!first || !second) return 0;
  const longest = Math.max(first.length, second.length);
  return 1 - levenshteinDistance(first, second) / longest;
}

export function areNamesSimilar(a: string, b: string): boolean {
  const first = normalize(a);
  const second = normalize(b);
  if (first === second) return true;

  // Different numeric suffixes may distinguish two people.
  const firstDigits = first.match(/\d+/g)?.join("|") ?? "";
  const secondDigits = second.match(/\d+/g)?.join("|") ?? "";
  if (firstDigits !== secondDigits && (firstDigits || secondDigits)) return false;
  if (first.length <= 3 || second.length <= 3) return false;
  return similarityRatio(first, second) >= 0.8;
}

export function classifyIdentityMatch(
  incoming: IdentityDetails,
  existing: IdentityDetails
): IdentityMatchKind | null {
  const first = normalize(incoming.first_name);
  const last = normalize(incoming.last_name);
  const parish = normalize(incoming.parish);
  const existingFirst = normalize(existing.first_name);
  const existingLast = normalize(existing.last_name);
  const existingParish = normalize(existing.parish);
  if (!first || !last || !parish || !existingFirst || !existingLast || !existingParish) {
    return null;
  }
  if (first === existingFirst && last === existingLast) {
    return parish === existingParish ? "exact" : "same_name_different_parish";
  }
  return areNamesSimilar(first, existingFirst) && areNamesSimilar(last, existingLast)
    ? "similar_name"
    : null;
}
