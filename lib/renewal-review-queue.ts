import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { RenewalBatchStagingResult } from "@/lib/duplicate-check";

export type RenewalReviewStatus = "open" | "resolved" | "dismissed";
export type RenewalResolution =
  | "member_verified" | "ministry_assignment_verified" | "registry_record_corrected"
  | "csv_row_corrected" | "duplicate_row" | "no_action_required" | "other";

export type RenewalReviewCandidate = {
  id: string; uid: string; name: string; parish: string;
  matchType: string; similarity: number;
};

export type SavedRenewalReview = {
  id: string; submission_id: string; source_filename: string; source_position: number;
  first_name: string; last_name: string; parish: string; ministry: string;
  reason: string; candidates: RenewalReviewCandidate[];
  status: RenewalReviewStatus; resolution: RenewalResolution | null;
  resolution_notes: string | null; created_at: string; resolved_at: string | null;
};

const TABLE = "renewal_review_items";

async function authorizedReviewer() {
  const supabase = getSupabaseBrowserClient();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth.user) throw new Error("Sign in to access the renewal review queue.");
  const role = auth.user.app_metadata?.registry_role;
  if (role !== "admin" && role !== "renewal_reviewer")
    throw new Error("Renewal review access has not been provisioned for this account. A securely assigned reviewer role is required.");
  return auth.user;
}

/** Stores only review/unmatched cases; ready-to-renew memberships are not persisted here. */
export async function saveRenewalReviewCases(
  staged: RenewalBatchStagingResult,
  filename: string
): Promise<{ saved: number; alreadyOpen: number }> {
  const supabase = getSupabaseBrowserClient();
  const reviewer = await authorizedReviewer();
  const items = [
    ...staged.review.map((item) => ({
      first_name: item.incoming.first_name, last_name: item.incoming.last_name,
      parish: item.incoming.parish, ministry: item.normalizedMinistry,
      reason: item.reason,
      candidates: item.candidates.slice(0, 5).map((candidate) => ({
        id: candidate.member.id, uid: candidate.member.uid,
        name: `${candidate.member.first_name} ${candidate.member.last_name}`,
        parish: candidate.member.parish,
        matchType: candidate.matchType, similarity: candidate.similarity,
      })),
    })),
    ...staged.unmatched.map((item) => ({
      first_name: item.incoming.first_name, last_name: item.incoming.last_name,
      parish: item.incoming.parish, ministry: item.normalizedMinistry,
      reason: "unmatched",
      candidates: [] as RenewalReviewCandidate[],
    })),
  ];
  if (!items.length) return { saved: 0, alreadyOpen: 0 };
  const submission = crypto.randomUUID();
  const rows = items.map((item, index) => ({
    ...item, submission_id: submission, source_filename: filename.slice(0, 255),
    source_position: index + 1, created_by: reviewer.id,
  }));
  // One PostgREST request: no silent partial success or overwriting older review decisions.
  // A generated, unique open_case_key prevents duplicate unresolved exceptions
  // across repeated staging of the same roster. DO NOTHING preserves existing cases.
  const { data, error } = await supabase.from(TABLE)
    .upsert(rows, { onConflict: "open_case_key", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(
    error.code === "42P01" || error.code === "PGRST205"
      ? "The renewal review queue database is not installed yet. Your staged results were not saved."
      : "Review cases could not be saved. Check reviewer permissions and database configuration: " + error.message
  );
  const saved = data?.length ?? 0;
  return { saved, alreadyOpen: rows.length - saved };
}

export async function listRenewalReviews(status: RenewalReviewStatus | "all") {
  const supabase = getSupabaseBrowserClient();
  await authorizedReviewer();
  let query = supabase.from(TABLE).select(
    "id,submission_id,source_filename,source_position,first_name,last_name,parish,ministry,reason,candidates,status,resolution,resolution_notes,created_at,resolved_at"
  ).order("created_at", { ascending: false }).limit(500);
  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw new Error(error.code === "42P01" || error.code === "PGRST205"
    ? "The review queue has not been installed in Supabase yet."
    : error.message);
  return (data ?? []) as SavedRenewalReview[];
}

export async function resolveRenewalReview(
  item: SavedRenewalReview,
  status: "resolved" | "dismissed",
  resolution: RenewalResolution,
  notes: string
) {
  if (!resolution || notes.trim().length < 10)
    throw new Error("Choose a decision and enter at least 10 characters of review notes.");
  const supabase = getSupabaseBrowserClient();
  const reviewer = await authorizedReviewer();
  const { data, error } = await supabase.from(TABLE)
    .update({ status, resolution, resolution_notes: notes.trim(),
      resolved_by: reviewer.id, resolved_at: new Date().toISOString() })
    .eq("id", item.id).eq("status", "open").select("id").single();
  if (error || !data) throw new Error(error?.message ?? "This case has already been resolved by another reviewer.");
}

export type DuplicateComparison = {
  id: string; uid: string; first_name: string; last_name: string; parish: string;
  status: string; service_year: number; created_at: string; expiration_date: string | null;
  document_url: string | null; archived_documents: unknown[];
  assignments: { id: string; ministry: string; status: string; document_url: string | null; expiration_date: string | null; archived_document_count: number }[];
  renewal_history_count: number; audit_log_count: number;
  dependency_warning: string | null;
};

/** Read-only duplicate investigation. Does not remove, merge, or mark member records. */
export async function comparePossibleDuplicateMembers(item: SavedRenewalReview): Promise<DuplicateComparison[]> {
  await authorizedReviewer();
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from("members")
    .select("id,uid,first_name,last_name,parish,status,service_year,created_at,expiration_date,document_url,archived_documents")
    .eq("parish", item.parish)
    .ilike("first_name", item.first_name.trim())
    .ilike("last_name", item.last_name.trim())
    .limit(20);
  if (error) throw new Error("Unable to retrieve possible duplicate members: " + error.message);
  const members = data ?? [];
  const result: DuplicateComparison[] = [];
  for (const m of members) {
    const [assignments, history, audit] = await Promise.all([
      supabase.from("member_ministries").select("id,ministry,status,document_url,expiration_date,archived_documents").eq("member_id", m.id),
      supabase.from("recommendation_renewal_memberships").select("id", { count: "exact", head: true }).eq("member_id", m.id),
      supabase.from("audit_logs").select("id", { count: "exact", head: true }).eq("member_id", m.id),
    ]);
    const dependencyWarning = [assignments.error, history.error, audit.error]
      .filter(Boolean).map(e => e?.message).join("; ") || null;
    result.push({
      id: m.id, uid: m.uid, first_name: m.first_name, last_name: m.last_name,
      parish: m.parish, status: m.status, service_year: m.service_year,
      created_at: m.created_at, expiration_date: m.expiration_date,
      document_url: m.document_url,
      archived_documents: Array.isArray(m.archived_documents) ? m.archived_documents : [],
      assignments: (assignments.data ?? []).map(a => ({
        id: a.id, ministry: a.ministry, status: a.status,
        document_url: a.document_url, expiration_date: a.expiration_date,
        archived_document_count: Array.isArray(a.archived_documents) ? a.archived_documents.length : 0,
      })),
      renewal_history_count: history.count ?? 0,
      audit_log_count: audit.count ?? 0,
      dependency_warning: dependencyWarning,
    });
  }
  return result;
}
