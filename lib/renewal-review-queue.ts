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

/** Stores only review/unmatched cases; ready-to-renew memberships are not persisted here. */
export async function saveRenewalReviewCases(
  staged: RenewalBatchStagingResult,
  filename: string
): Promise<number> {
  const supabase = getSupabaseBrowserClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error("Sign in as an authorized renewal reviewer to save exceptions.");
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
  if (!items.length) return 0;
  const submission = crypto.randomUUID();
  const rows = items.map((item, index) => ({
    ...item, submission_id: submission, source_filename: filename.slice(0, 255),
    source_position: index + 1, created_by: auth.user.id,
  }));
  // One PostgREST request: no silent partial success or overwriting older review decisions.
  const { error } = await supabase.from(TABLE).insert(rows);
  if (error) throw new Error(
    error.code === "42P01" || error.code === "PGRST205"
      ? "The renewal review queue database is not installed yet. Your staged results were not saved."
      : "Review cases could not be saved. Check reviewer permissions and database configuration: " + error.message
  );
  return rows.length;
}

export async function listRenewalReviews(status: RenewalReviewStatus | "all") {
  const supabase = getSupabaseBrowserClient();
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
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error("An authenticated reviewer is required.");
  const { data, error } = await supabase.from(TABLE)
    .update({ status, resolution, resolution_notes: notes.trim(),
      resolved_by: auth.user.id, resolved_at: new Date().toISOString() })
    .eq("id", item.id).eq("status", "open").select("id").single();
  if (error || !data) throw new Error(error?.message ?? "This case has already been resolved by another reviewer.");
}
