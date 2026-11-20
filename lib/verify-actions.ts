import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { registryAdminWrite } from "@/lib/registry-admin-writes";
import type { Member, MemberStatus } from "@/lib/types";

/**
 * The legacy Quick Scan has no explicit ministry selection. It is not safe to
 * infer approvals from an aggregate member status. Use the secure Verification
 * workspace for a selected set of member_ministries IDs and a reviewed letter.
 */
export async function quickVerifyMember(
  _memberId: string,
  _newStatus: "New" | "Renewed"
): Promise<{ member: Member | null; error: string | null }> {
  return {
    member: null,
    error: "Member-wide approval is disabled. Open secure Verification and select the exact ministry assignments to approve.",
  };
}

export async function revertToPending(
  memberId: string
): Promise<{ member: Member | null; error: string | null }> {
  return updateMemberStatus(memberId, "Pending Verification");
}

export async function updateMemberStatus(
  memberId: string,
  status: MemberStatus
): Promise<{ member: Member | null; error: string | null }> {
  // New and Renewed require owner authorization and a private document-backed,
  // exact-assignment approval. Never fall back to a member-wide table UPDATE.
  if (status === "New" || status === "Renewed") {
    return quickVerifyMember(memberId, status);
  }
  try {
    const member = await registryAdminWrite<Member>("set_status", {
      member_id: memberId,
      status,
    });
    return { member, error: null };
  } catch (cause) {
    return {
      member: null,
      error: cause instanceof Error ? cause.message : "Secure status change rejected",
    };
  }
}
