import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { registryAdminWrite } from "@/lib/registry-admin-writes";
import type { MemberStatus, Member } from "@/lib/types";

/**
 * Legacy quick-scan compatibility. Verification is now per-ministry and must
 * have a real assigned private letter. Never mutate member.status directly.
 */
export async function quickVerifyMember(
  memberId: string,
  newStatus: "New" | "Renewed"
): Promise<{ member: Member | null; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data: assignments, error: readError } = await supabase
    .from("member_ministries")
    .select("id,status,document_url")
    .eq("member_id", memberId);
  if (readError) return { member: null, error: readError.message };
  const eligibleStatus = newStatus === "New"
    ? ["Pending Verification"] : ["New", "Renewed"];
  const eligible = (assignments ?? []).filter((a) => eligibleStatus.includes(a.status));
  if (eligible.length === 0)
    return { member: null, error: "No eligible ministry assignments for this action." };
  if (eligible.some((a) => !a.document_url))
    return { member: null, error: "Attach a recommendation letter to every selected ministry before verification." };

  const { error } = await supabase.rpc("registry_verify_ministries_v1", {
    p_member_id: memberId,
    p_membership_ids: eligible.map((assignment) => assignment.id),
    p_status: newStatus,
  });
  if (error) return { member: null, error: error.message };
  const { data, error: memberError } = await supabase
    .from("members")
    .select("*")
    .eq("id", memberId)
    .single();
  return { member: (data as Member) ?? null, error: memberError?.message ?? null };
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
  if (status === "New" || status === "Renewed")
    return quickVerifyMember(memberId, status);
  try {
    const member = await registryAdminWrite<Member>("set_status", {
      member_id: memberId, status,
    });
    return { member, error: null };
  } catch (error) {
    return { member: null, error: error instanceof Error ? error.message : "Status change rejected" };
  }
}
