/** Offline-only document requirements; never approves a member or uploads a file. */
export type RecommendationRequirement =
  | { kind: "individual"; ministries: readonly string[]; documentName: string | null }
  | { kind: "bulk"; ministries: readonly string[]; parishes: readonly string[]; documentName: string | null };
export type DocumentCheck = { valid: boolean; errors: string[]; documentName: string | null };
export function checkRecommendationLetter(input: RecommendationRequirement): DocumentCheck {
  const errors: string[] = [];
  if (!input.ministries.length || input.ministries.some(m => !m.trim()))
    errors.push("At least one ministry must be identified.");
  if (input.kind === "bulk") {
    const uniqueParishes = Array.from(new Set(input.parishes.map(p => p.trim().toLowerCase()).filter(Boolean)));
    if (uniqueParishes.length !== 1 || input.parishes.length === 0 || input.parishes.some(p => !p.trim()))
      errors.push("A shared recommendation letter must belong to one parish only.");
  }
  const documentName = input.documentName?.trim() || null;
  if (!documentName) errors.push("A recommendation letter is required for verification.");
  else if (!/\.(pdf|png|jpg|jpeg)$/i.test(documentName))
    errors.push("Recommendation letter must be a PDF, PNG, or JPEG.");
  return { valid: errors.length === 0, errors, documentName };
}
