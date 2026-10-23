import { classifyIdentityMatch, type IdentityDetails, type IdentityMatchKind } from "./registration-matching";

/** Offline payload shared by individual and CSV intake; does not persist a case. */
export type RegistrationSource = { kind: "individual"; reference: string } |
  { kind: "bulk"; reference: string; row: number };
export type CandidateIdentity = IdentityDetails & { memberId: string };
export type ReviewCaseDraft = {
  source: RegistrationSource;
  incoming: IdentityDetails & { ministries: string[] };
  candidateMemberIds: string[];
  reasons: IdentityMatchKind[];
  needsReview: boolean;
};
export function draftDuplicateReview(input: {
  source: RegistrationSource;
  incoming: IdentityDetails & { ministries: string[] };
  candidates: readonly CandidateIdentity[];
}): ReviewCaseDraft {
  if (!input.source.reference.trim() ||
    (input.source.kind === "bulk" && (!Number.isInteger(input.source.row) || input.source.row < 1))) {
    throw new Error("An intake source and valid row reference are required.");
  }
  if (!input.incoming.first_name.trim() || !input.incoming.last_name.trim() ||
      !input.incoming.parish.trim() || input.incoming.ministries.length === 0 ||
      input.incoming.ministries.some((m) => !m.trim())) {
    throw new Error("Complete incoming identity and ministries are required.");
  }
  const ids: string[] = [];
  const reasons: IdentityMatchKind[] = [];
  for (const candidate of input.candidates) {
    const reason = classifyIdentityMatch(input.incoming, candidate);
    if (!reason) continue;
    if (!candidate.memberId.trim()) throw new Error("Matched candidate must have an ID.");
    if (!ids.includes(candidate.memberId)) ids.push(candidate.memberId);
    if (!reasons.includes(reason)) reasons.push(reason);
  }
  return {
    source: input.source,
    incoming: input.incoming,
    candidateMemberIds: ids,
    reasons,
    needsReview: ids.length > 0,
  };
}
