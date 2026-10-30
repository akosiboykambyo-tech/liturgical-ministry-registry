/**
 * Season grid domain rules. No direct registry mutation is permitted here.
 * Proposed persistence and guarded transaction SQL live under supabase/proposals.
 */
export type BatchState = "Not sent" | "Sent" | "In progress" | "Submitted" | "Needs review" | "Reviewed";
export type BatchDoor = "phone" | "paper" | "helper" | "csv";
export type RosterClaim = "No response" | "Renewing" | "Not renewing" | "Transferred" | "Deceased";
export type RowOutcome = "pending" | "renewed" | "not_renewing" | "case_resolved" | "deferred";
export type CaseState = "open" | "deferred" | "confirmed" | "rejected";
export type InactiveReason = "Left ministry" | "Transferred out" | "Deceased" | "Other";

export type BatchSummaryRow = {
  id: string;
  claim: RosterClaim;
  outcome: RowOutcome;
  held: boolean;
};

export type BatchProgress = {
  total: number;
  approved: number;
  held: number;
  deferred: number;
  pending: number;
  final: number;
  canBeReviewed: boolean;
  display: string;
};

/** No response is a claim, never a disposition. Follow-up is not a final outcome. */
export function progressForBatch(rows: BatchSummaryRow[]): BatchProgress {
  const total = rows.length;
  const approved = rows.filter(r => r.outcome === "renewed").length;
  const held = rows.filter(r => r.held && r.outcome === "pending").length;
  const deferred = rows.filter(r => r.outcome === "deferred").length;
  const final = rows.filter(r => r.outcome !== "pending").length;
  const pending = total - final;
  const canBeReviewed = total > 0 && pending === 0;
  return {
    total, approved, held, deferred, pending, final, canBeReviewed,
    display: canBeReviewed
      ? `Reviewed${deferred ? `, ${deferred} deferred` : ""}`
      : `${approved} of ${total} approved, ${held} held`,
  };
}

export function canApproveBatch(letterReviewed: boolean, overrideReason: string, isOwner: boolean): boolean {
  return isOwner && (letterReviewed || overrideReason.trim().length >= 10);
}

/** End dates are inclusive. A shortened end date cannot extend expired coverage. */
export function shortenedCoverageEnd(
  existingEnd: string | null,
  effectiveDate: string,
  shorten: boolean
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) throw new Error("Invalid effective date.");
  if (!shorten || !existingEnd) return existingEnd;
  return existingEnd > effectiveDate ? effectiveDate : existingEnd;
}

export type AssignmentView = {
  status: "Pending Verification" | "New" | "Renewed" | "Inactive";
  expiration_date: string | null;
};

/** Explicit Inactive and Pending Verification take precedence over coverage. */
export function assignmentPublicLabel(item: AssignmentView, today: string) {
  if (item.status === "Inactive") return "Not currently active";
  if (item.status === "Pending Verification") return "Pending review";
  if (!item.expiration_date) return "Pending review";
  return item.expiration_date < today ? "Registration ended" : "Registered";
}

export function safeRepresentativeClaim(value: unknown): value is RosterClaim {
  return value === "No response" || value === "Renewing" || value === "Not renewing" ||
    value === "Transferred" || value === "Deceased";
}

/** Never auto-classify uncertain, inactive or sensitive rows as clean renewals. */
export function eligibleForBulkApprove(row: {
  claim: RosterClaim;
  outcome: RowOutcome;
  held: boolean;
  adminStatus: string;
  duplicateUnresolved?: boolean;
}): boolean {
  return row.claim === "Renewing" && row.outcome === "pending" &&
    !row.held && !row.duplicateUnresolved &&
    (row.adminStatus === "New" || row.adminStatus === "Renewed");
}
