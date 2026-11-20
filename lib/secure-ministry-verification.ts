"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { attachRecommendationLetter } from "@/lib/registry-letter-attachments";
import { expirationOneYearAfter } from "@/lib/registration-validity";
import { todayInManila } from "@/lib/verification-public-status";

export type SecureVerificationResult = {
  member_id: string;
  updated_assignments: number;
  member_status: "Pending Verification" | "New" | "Renewed" | "Inactive";
  expires_on: string;
  effective_on: string;
};

// Deployment gate: absent or incorrect values MUST keep the legacy view.
export const secureMinistryVerificationEnabled =
  process.env.NEXT_PUBLIC_SECURE_MINISTRY_VERIFICATION === "enabled";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Never fall back to an unscoped member.status update on RPC failures. */
export async function verifySelectedMinistries(
  memberId: string, membershipIds: string[], effectiveDate: string, reason: string
): Promise<SecureVerificationResult> {
  if (!secureMinistryVerificationEnabled) {
    throw new Error("Secure ministry verification is disabled for this environment.");
  }
  if (!UUID.test(memberId) || membershipIds.length === 0 ||
      membershipIds.length > 100 || membershipIds.some(id => !UUID.test(id)) ||
      new Set(membershipIds).size !== membershipIds.length) {
    throw new Error("Choose valid, distinct ministry assignments for one member.");
  }
  const today = todayInManila();
  let expectedExpiry: string;
  try {
    expectedExpiry = expirationOneYearAfter(effectiveDate);
  } catch {
    throw new Error("Enter a valid ministry verification effective date.");
  }
  if (effectiveDate > today || effectiveDate < "1900-01-01") {
    throw new Error("The effective date cannot be in the future.");
  }
  const recordedReason = reason.trim();
  if (recordedReason.length > 500 ||
      (effectiveDate < today && recordedReason.length < 12)) {
    throw new Error("Retrospective verification requires an audit reason of 12–500 characters.");
  }
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("registry_verify_ministries_v3", {
    p_member_id: memberId,
    p_membership_ids: membershipIds,
    p_status: "New",
    p_effective_date: effectiveDate,
    p_reason: recordedReason || null,
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
      typeof result.expires_on !== "string" ||
      result.expires_on !== expectedExpiry ||
      result.effective_on !== effectiveDate) {
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
  // The shared v2 RPC verifies the exact assignment(s), private object,
  // administrator, and no-overwrite guarantee.
  await attachRecommendationLetter([membershipId], file);
}

/** Authorize document inspection through private Supabase Storage. The URL is
 * short-lived; it never changes membership status or exposes a public bucket. */
export async function getPendingMinistryLetterReviewUrl(
  documentPath: string
): Promise<string> {
  if (!secureMinistryVerificationEnabled) {
    throw new Error("Secure ministry document review is disabled.");
  }
  if (!documentPath || documentPath.length > 512 ||
      documentPath.startsWith("/") || documentPath.includes("..") ||
      documentPath.includes("://")) {
    throw new Error("Invalid private recommendation-letter path.");
  }
  const { data, error } = await getSupabaseBrowserClient().storage
    .from("member-documents")
    .createSignedUrl(documentPath, 300);
  if (error || !data?.signedUrl) {
    throw new Error("Private recommendation letter cannot be opened. Confirm your administrator access and Storage permissions.");
  }
  return data.signedUrl;
}
