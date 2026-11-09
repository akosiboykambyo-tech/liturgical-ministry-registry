import type { Member, MemberMinistry } from "@/lib/types";
import { getExpirationStatus } from "@/lib/constants";

/** Matches the existing Member Records certificate status/expiry gate.
 * This batch preflight never alters member data, issuance counts or validity.
 */
export type BulkCertificateMember = Member & { member_ministries: MemberMinistry[] };
export type BulkCertificateEntry = {
  member: BulkCertificateMember;
  assignment: MemberMinistry;
};
export type BulkCertificateExclusion = {
  memberId: string;
  memberName: string;
  ministry: string;
  reason: string;
};
export type BulkCertificatePlan = {
  eligible: BulkCertificateEntry[];
  excluded: BulkCertificateExclusion[];
};

export const MAX_BULK_CERTIFICATES = 100;

export function buildBulkCertificatePlan(
  members: BulkCertificateMember[],
  ministryFilter: readonly string[]
): BulkCertificatePlan {
  if (ministryFilter.length === 0) return { eligible: [], excluded: [] };

  const requested = new Set(ministryFilter);
  const seen = new Set<string>();
  const eligible: BulkCertificateEntry[] = [];
  const excluded: BulkCertificateExclusion[] = [];

  for (const member of members) {
    const name = (member.first_name + " " + member.last_name).trim();
    const assignments = (member.member_ministries ?? []).filter((entry) =>
      requested.has(entry.ministry)
    );

    if (assignments.length === 0) {
      excluded.push({
        memberId: member.id,
        memberName: name,
        ministry: "—",
        reason: "No assignment matches the selected ministry filter.",
      });
      continue;
    }

    for (const assignment of assignments) {
      const key = member.id + "/" + assignment.id;
      if (seen.has(key)) continue;
      seen.add(key);

      const expiration = getExpirationStatus(assignment.expiration_date);
      let reason: string | null = null;

      if (!member.uid || member.uid === "PENDING") {
        reason = "Member does not have an issued registry UID.";
      } else if (!assignment.id || !assignment.member_id || assignment.member_id !== member.id) {
        reason = "Ministry assignment is missing or does not belong to this member.";
      } else if (assignment.status !== "New" && assignment.status !== "Renewed") {
        reason = "Ministry is " + assignment.status + "; verification is required.";
      } else if (expiration === "expired") {
        reason = "Ministry registration has expired.";
      } else if (expiration === "expiring_soon") {
        reason = "Ministry registration expires within 30 days.";
      }

      if (reason) {
        excluded.push({ memberId: member.id, memberName: name, ministry: assignment.ministry, reason });
      } else {
        eligible.push({ member, assignment });
      }
    }
  }

  return { eligible, excluded };
}

/** A changed live record requires another review before generating the PDF. */
export function certificatePlanFingerprint(plan: BulkCertificatePlan): string {
  return JSON.stringify({
    eligible: plan.eligible.map(({ member, assignment }) => [
      member.id, member.uid, member.first_name, member.last_name, member.parish,
      assignment.id, assignment.ministry, assignment.status, assignment.expiration_date,
    ]),
    excluded: plan.excluded.map(({ memberId, ministry, reason }) => [memberId, ministry, reason]),
  });
}
