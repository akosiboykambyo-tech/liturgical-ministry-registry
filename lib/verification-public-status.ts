import type { MemberStatus } from "@/lib/types";
import { getExpirationStatus } from "@/lib/constants";

export type PublicStatusMembership = {
  ministry: string;
  status: MemberStatus;
  expiration_date: string | null;
};

export type PublicStatusKind =
  | "registered"
  | "pending"
  | "ended"
  | "inactive";

export function formatPublicDate(value: string | null) {
  if (!value) return "—";

  return new Date(`${value}T00:00:00`).toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function isCurrentMembership(membership: PublicStatusMembership) {
  const expiration = getExpirationStatus(membership.expiration_date);

  return (
    (membership.status === "New" || membership.status === "Renewed") &&
    membership.expiration_date !== null && expiration !== "expired"
  );
}

export function getMembershipPublicStatus(
  membership: PublicStatusMembership
): {
  kind: PublicStatusKind;
  label: string;
  validity: string;
} {
  const expiration = getExpirationStatus(membership.expiration_date);

  // Explicit administrative decisions outrank expiry. A missing expiry is not proof of validity.
  if (membership.status === "Pending Verification") {
    return { kind: "pending", label: "Pending review", validity: "—" };
  }
  if (membership.status === "Inactive") {
    return { kind: "inactive", label: "Not currently active", validity: "—" };
  }
  if (!membership.expiration_date) {
    return { kind: "pending", label: "Pending review", validity: "—" };
  }
  if (expiration === "expired") {
    return {
      kind: "ended",
      label: `Registration ended ${formatPublicDate(membership.expiration_date)}`,
      validity: `Registration ended ${formatPublicDate(membership.expiration_date)}`,
    };
  }

  return {
    kind: "registered",
    label: "Registered",
    validity: membership.expiration_date
      ? `Valid until ${formatPublicDate(membership.expiration_date)}`
      : "—",
  };
}

export function getRecordPublicStatus(
  memberships: PublicStatusMembership[]
): {
  kind: PublicStatusKind;
  label: string;
  note: string;
} {
  if (memberships.length === 0) {
    return {
      kind: "inactive",
      label: "Not currently registered",
      note: "No active registration was found. If you expected one, ask the parish office.",
    };
  }

  const current = memberships.filter(isCurrentMembership);

  if (current.length === memberships.length) {
    return {
      kind: "registered",
      label: "Registered",
      note: "Registration is current for the listed ministry or ministries.",
    };
  }

  if (current.length > 0) {
    return {
      kind: "ended",
      label: `Registered for ${current.length} of ${memberships.length} ministries`,
      note: "Some ministry registrations are current and some are not.",
    };
  }

  if (
    memberships.some(
      (membership) => membership.status === "Pending Verification"
    )
  ) {
    return {
      kind: "pending",
      label: "Pending review",
      note: "The registration is being reviewed. It is not active yet.",
    };
  }

  return {
    kind: "inactive",
    label: "Not currently registered",
    note: "No active registration was found. If you expected one, ask the parish office.",
  };
}

export function getCardPublicStatus(memberships: PublicStatusMembership[]) {
  const record = getRecordPublicStatus(memberships);
  const current = memberships.filter(isCurrentMembership);

  if (record.kind !== "registered" || current.length === 0) {
    return record.label;
  }

  const dates = Array.from(
    new Set(
      current
        .map((membership) => membership.expiration_date)
        .filter((value): value is string => Boolean(value))
    )
  );

  if (current.length === 1 && dates.length === 1) {
    return `Registered · Valid until ${formatPublicDate(dates[0])}`;
  }

  if (dates.length === 1) {
    return `Registered · Valid until ${formatPublicDate(dates[0])}`;
  }

  return `Registered · ${current.length} current ${
    current.length === 1 ? "ministry" : "ministries"
  }`;
}

export function shortPublicMinistry(name: string) {
  return name
    .replace(/^Ministry of\s+/i, "")
    .replace(/^Extraordinary Ministers of\s+/i, "")
    .trim();
}
