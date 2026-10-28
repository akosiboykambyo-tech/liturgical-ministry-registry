"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type SecureVerificationResult = {
  member_id: string;
  updated_assignments: number;
  member_status: "Pending Verification" | "New" | "Renewed" | "Inactive";
  expires_on: string;
};

// Deployment gate: absent or incorrect values MUST keep the legacy view.
export const secureMinistryVerificationEnabled =
  process.env.NEXT_PUBLIC_SECURE_MINISTRY_VERIFICATION === "enabled";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Never fall back to an unscoped member.status update on RPC failures. */
export async function verifySelectedMinistries(
  memberId: string, membershipIds: string[]
): Promise<SecureVerificationResult> {
  if (!secureMinistryVerificationEnabled) {
    throw new Error("Secure ministry verification is disabled for this environment.");
  }
  if (!UUID.test(memberId) || membershipIds.length === 0 ||
      membershipIds.length > 100 || membershipIds.some(id => !UUID.test(id)) ||
      new Set(membershipIds).size !== membershipIds.length) {
    throw new Error("Choose valid, distinct ministry assignments for one member.");
  }
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("registry_verify_ministries_v1", {
    p_member_id: memberId,
    p_membership_ids: membershipIds,
    p_status: "New",
  });
  if (error) {
    if (error.code === "42883" || error.code === "PGRST202") {
      throw new Error("Secure verification has not been installed in this environment. No assignment was changed.");
    }
    throw new Error(`Verification was rejected by the database: ${error.message}`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Verification response could not be confirmed; reload the registry before retrying.");
  }
  const result = data as Partial<SecureVerificationResult>;
  if (result.member_id !== memberId ||
      result.updated_assignments !== membershipIds.length ||
      !["Pending Verification", "New", "Renewed", "Inactive"].includes(result.member_status ?? "") ||
      typeof result.expires_on !== "string") {
    throw new Error("Verification returned an unexpected result. Reload and inspect the registry before retrying.");
  }
  return result as SecureVerificationResult;
}

export async function attachPendingMinistryLetter(
  memberId: string, membershipId: string, file: File
): Promise<void> {
  if (!secureMinistryVerificationEnabled) {
    throw new Error("Secure recommendation letter intake is disabled.");
  }
  if (!UUID.test(memberId) || !UUID.test(membershipId)) {
    throw new Error("A valid member and ministry assignment must be selected.");
  }
  const extensions: Record<string, string> = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
  };
  const extension = extensions[file.type];
  if (!extension || file.size < 1 || file.size > 5 * 1024 * 1024) {
    throw new Error("Upload a nonempty PDF, PNG or JPEG recommendation letter up to 5 MB.");
  }
  const path = `verification/${memberId}/${membershipId}/${crypto.randomUUID()}.${extension}`;
  const storage = getSupabaseBrowserClient().storage.from("member-documents");
  const uploaded = await storage.upload(path, file, {
    upsert: false, contentType: file.type,
  });
  if (uploaded.error) {
    throw new Error(`Private document upload failed: ${uploaded.error.message}`);
  }
  const { data, error } = await getSupabaseBrowserClient().rpc(
    "registry_attach_ministry_letter_v1", {
      p_member_id: memberId,
      p_membership_id: membershipId,
      p_document_path: path,
    }
  );
  if (error || !data || typeof data !== "object" || Array.isArray(data) ||
      data.attached !== true || data.member_id !== memberId ||
      data.membership_id !== membershipId) {
    // The RPC might have COMMITTED even if its HTTP response is missing or
    // malformed. Do NOT delete the uploaded object based on ambiguous results:
    // it could already be referenced by the membership record.
    throw new Error(
      "Letter attachment could not be confirmed. The uploaded private file was retained. " +
      "Reload the registry and check the assignment before retrying or requesting cleanup."
    );
  }
}
