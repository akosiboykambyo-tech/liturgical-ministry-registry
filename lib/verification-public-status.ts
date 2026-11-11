import type { MemberStatus } from "@/lib/types";

/**
 * The database uses date-only, inclusive annual registration expiry.
 * Always evaluate against the canonical Asia/Manila civil date, not a
 * public visitor's browser timezone.
 */
export type PublicStatusMembership = {
  ministry: string;
  status: MemberStatus;
  expiration_date: string | null;
};

export type PublicStatusKind =
  | "registered"
  | "pending"
  | "ended"
  | "inactive"
  | "unestablished";

export function todayInManila(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const find = (name: string) => parts.find((part) => part.type === name)?.value ?? "";
  return `${find("year")}-${find("month")}-${find("day")}`;
}

export function formatPublicDate(value: string | null) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function establishedExpiration(membership: PublicStatusMembership) {
  const value = membership.expiration_date;
  // Invalid/missing historic dates must never imply a valid registration.
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;
  return value;
}

export function isCurrentMembership(membership: PublicStatusMembership) {
  const expiration = establishedExpiration(membership);
  return (
    (membership.status === "New" || membership.status === "Renewed") &&
    expiration !== null &&
    expiration >= todayInManila()
  );
}

export function getMembershipPublicStatus(
  membership: PublicStatusMembership
): { kind: PublicStatusKind; label: string; validity: string } {
  // Approved status precedence: pending/inactive are never publicly expired,
  // even if their retained historical expiry is in the past.
  if (membership.status === "Pending Verification") {
    return { kind: "pending", label: "Pending review", validity: "—" };
  }
  if (membership.status === "Inactive") {
    return { kind: "inactive", label: "Not currently active", validity: "—" };
  }

  const expiration = establishedExpiration(membership);
  if (!expiration) {
    return {
      kind: "unestablished",
      label: "Validity not established",
      validity: "Validity not established",
    };
  }
  if (expiration < todayInManila()) {
    const label = `Registration ended ${formatPublicDate(expiration)}`;
    return { kind: "ended", label, validity: label };
  }
  return {
    kind: "registered",
    label: "Registered",
    validity: `Valid until ${formatPublicDate(expiration)}`,
  };
}

export function getRecordPublicStatus(
  memberships: PublicStatusMembership[]
): { kind: PublicStatusKind; label: string; note: string } {
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
  if (memberships.some((membership) => membership.status === "Pending Verification")) {
    return {
      kind: "pending",
      label: "Pending review",
      note: "The registration is being reviewed. It is not active yet.",
    };
  }
  if (memberships.some((membership) => getMembershipPublicStatus(membership).kind === "unestablished")) {
    return {
      kind: "unestablished",
      label: "Validity not established",
      note: "Registration validity must be reviewed by the registry administrator.",
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
  if (record.kind !== "registered" || current.length === 0) return record.label;

  const dates = Array.from(new Set(current.map((membership) => membership.expiration_date).filter((value): value is string => Boolean(value))));
  if (dates.length === 1) return `Registered · Valid until ${formatPublicDate(dates[0])}`;
  return `Registered · ${current.length} current ${current.length === 1 ? "ministry" : "ministries"}`;
}

export function shortPublicMinistry(name: string) {
  return name
    .replace(/^Ministry of\s+/i, "")
    .replace(/^Extraordinary Ministers of\s+/i, "")
    .trim();
}
