/**
 * Pure, deterministic workflow boundary functions.
 *
 * Never call these a substitute for database row locks, authorization checks,
 * audit inserts, or transaction-scoped approval in the production backend.
 */
import { eligibleForBulkApprove, type RosterClaim, type RowOutcome } from "./season-workflow";

export type ClaimDraft = {
  rowId: string;
  claim: RosterClaim;
  transferScope?: "ministry" | "parish" | null;
  destination?: string;
};

export type ReviewRow = {
  id: string;
  claim: RosterClaim;
  outcome: RowOutcome;
  held: boolean;
  adminStatus: string;
  duplicateUnresolved?: boolean;
};

export type ReviewCase = {
  kind: "transfer" | "deceased" | "reactivation" | "duplicate";
  rosterId: string;
  status: "open";
  sensitive: boolean;
};

export function submitRepresentativeClaim(
  row: ReviewRow,
  next: ClaimDraft,
  confirmedSensitiveStep: boolean
): { row: ReviewRow; caseToOpen: ReviewCase | null } {
  if (row.id !== next.rowId) throw new Error("Mismatched batch member.");
  if (row.outcome !== "pending") throw new Error("Finalized rows cannot be overwritten.");
  const sensitive = next.claim === "Transferred" || next.claim === "Deceased";
  if (sensitive && !confirmedSensitiveStep) {
    throw new Error("Sensitive response requires confirmation.");
  }
  if (next.claim === "Transferred" &&
      next.transferScope != null &&
      next.transferScope !== "ministry" && next.transferScope !== "parish") {
    throw new Error("Invalid transfer scope.");
  }
  if (next.destination && next.destination.length > 200) {
    throw new Error("Destination is too long.");
  }
  const reactivation = next.claim === "Renewing" && row.adminStatus === "Inactive";
  const kind = reactivation ? "reactivation" :
    next.claim === "Transferred" ? "transfer" :
    next.claim === "Deceased" ? "deceased" : null;
  return {
    row: { ...row, claim: next.claim, held: kind !== null || Boolean(row.duplicateUnresolved) },
    caseToOpen: kind ? {
      kind, rosterId: row.id, status: "open", sensitive: kind === "deceased" ||
        (kind === "reactivation" && row.adminStatus === "Inactive"),
    } : null,
  };
}

export function selectBulkApprovalRows(
  rows: ReadonlyArray<ReviewRow>,
  letterReviewed: boolean,
  isOwner: boolean,
  overrideReason = ""
): string[] {
  if (!isOwner || (!letterReviewed && overrideReason.trim().length < 10)) return [];
  return rows.filter(eligibleForBulkApprove).map(row => row.id);
}

export function mayCloseBatch(rows: ReadonlyArray<ReviewRow>,
  deferredCases: ReadonlyArray<{ reason: string; reviewBy: string | null }>): boolean {
  if (!rows.length || rows.some(row => row.outcome === "pending")) return false;
  return deferredCases.every(c => c.reason.trim().length >= 10 && /^\d{4}-\d{2}-\d{2}$/.test(c.reviewBy || ""));
}

/** A parish receipt must not include private review cases or sensitive reasons. */
export type ParishReceiptRow = {
  displayName: string;
  outcome: RowOutcome;
};
export function parishReceipt(input: {
  batchId: string; parish: string; ministry: string; serviceYear: number;
  reviewedAt: string; version: number; rows: ParishReceiptRow[];
}) {
  if (!input.reviewedAt || input.version < 1 || !Number.isInteger(input.version)) {
    throw new Error("Receipt requires a reviewed batch and version.");
  }
  if (input.rows.some(row => row.outcome === "pending")) {
    throw new Error("No parish receipt before all rows are dispositioned.");
  }
  return {
    reference: input.batchId,
    parish: input.parish,
    ministry: input.ministry,
    serviceYear: input.serviceYear,
    reviewedAt: input.reviewedAt,
    version: input.version,
    results: input.rows.map(row => ({
      name: row.displayName,
      outcome: row.outcome === "renewed" ? "Renewed" :
        row.outcome === "not_renewing" ? "Not renewing" :
        row.outcome === "deferred" ? "Office follow-up" : "Processed by the office",
    })),
  };
}
