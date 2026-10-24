import {
  planDuplicateReview,
  type ReviewCandidate,
  type ReviewDecision,
  type ReviewIncoming,
  type ReviewPlan,
} from "./duplicate-review-plan";

/**
 * A pure preview model for the future persisted queue. It does not generate
 * identifiers, read Supabase, or apply changes to member records.
 */
export type ReviewQueueCase = {
  id: string;
  incoming: ReviewIncoming;
  candidate: ReviewCandidate | null;
  createdAt: string;
  status: "open" | "resolved" | "dismissed";
  resolution?: {
    decision: ReviewDecision;
    notes: string;
    reviewedAt: string;
    plan: ReviewPlan;
  };
};

export type QueueTransition =
  | { ok: true; updated: ReviewQueueCase }
  | { ok: false; error: string };

export function summarizeReviewQueue(cases: readonly ReviewQueueCase[]) {
  return {
    open: cases.filter((item) => item.status === "open").length,
    resolved: cases.filter((item) => item.status === "resolved").length,
    dismissed: cases.filter((item) => item.status === "dismissed").length,
    total: cases.length,
  };
}

export function filterReviewQueue(
  cases: readonly ReviewQueueCase[],
  status: ReviewQueueCase["status"] | "all",
  search = ""
): ReviewQueueCase[] {
  const tokens = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return cases
    .filter((item) => status === "all" || item.status === status)
    .filter((item) => {
      if (tokens.length === 0) return true;
      const value = [
        item.id,
        item.incoming.parish,
        ...item.incoming.ministries,
        item.candidate?.uid ?? "",
        item.candidate?.parish ?? "",
      ].join(" ").toLocaleLowerCase();
      return tokens.every((token) => value.includes(token));
    })
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

export function previewQueueDecision(
  item: ReviewQueueCase,
  decision: ReviewDecision,
  notes: string,
  reviewedAt: string
): QueueTransition {
  if (item.status !== "open") {
    return { ok: false, error: "Only open cases can be reviewed." };
  }
  if (!reviewedAt || Number.isNaN(Date.parse(reviewedAt))) {
    return { ok: false, error: "A valid review timestamp is required." };
  }

  const result = planDuplicateReview({
    decision,
    incoming: item.incoming,
    existing: item.candidate,
    notes,
  });
  if (!result.valid) return { ok: false, error: result.error };

  return {
    ok: true,
    updated: {
      ...item,
      status: decision === "discard" ? "dismissed" : "resolved",
      resolution: {
        decision,
        notes: notes.trim(),
        reviewedAt,
        plan: result.plan,
      },
    },
  };
}
