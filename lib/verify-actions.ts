import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { MemberStatus, Member } from "@/lib/types";

/**
 * One-Click Verification: instantly updates a pending member's status to
 * "New" or "Renewed". The DB trigger auto-generates the UID on insert (already
 * done), and the audit log trigger records the status change. This function is
 * the optimistic-UI-aware caller used by the Quick-Scan Matrix.
 *
 * Returns the updated member or an error.
 */
export async function quickVerifyMember(
  memberId: string,
  newStatus: "New" | "Renewed"
): Promise<{ member: Member | null; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("members")
    .update({ status: newStatus })
    .eq("id", memberId)
    .select("*")
    .single();
  if (error) return { member: null, error: error.message };
  return { member: data as Member, error: null };
}

/**
 * Revert a member back to Pending Verification (e.g., misplaced recommendation
 * letter).
 */
export async function revertToPending(
  memberId: string
): Promise<{ member: Member | null; error: string | null }> {
  return quickVerifyMember(memberId, "Pending Verification" as never);
}

export async function updateMemberStatus(
  memberId: string,
  status: MemberStatus
): Promise<{ member: Member | null; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("members")
    .update({ status })
    .eq("id", memberId)
    .select("*")
    .single();
  if (error) return { member: null, error: error.message };
  return { member: data as Member, error: null };
}
