"use client";

import { CheckCircle2, Church, ShieldCheck } from "lucide-react";
import type { MemberStatus } from "@/lib/types";

export type VerificationCardMembership = {
  id: string;
  ministry: string;
  status: MemberStatus;
  expiration_date: string | null;
};

export type VerificationCardMember = {
  id: string;
  first_name: string;
  last_name: string;
  parish: string;
  member_ministries: VerificationCardMembership[];
};

type VerificationMemberCardProps = {
  member: VerificationCardMember;
  active?: boolean;
  compact?: boolean;
  onViewDetails?: () => void;
};

function statusSummary(memberships: VerificationCardMembership[]) {
  const verified = memberships.filter(
    (membership) =>
      membership.status === "New" || membership.status === "Renewed"
  ).length;

  if (verified > 0) {
    return `${verified} active ${verified === 1 ? "ministry" : "ministries"}`;
  }

  if (memberships.some((membership) => membership.status === "Pending Verification")) {
    return "Verification pending";
  }

  if (memberships.length > 0) {
    return "No active ministry";
  }

  return "Membership record pending";
}

export function VerificationMemberCard({
  member,
  active = false,
  compact = false,
  onViewDetails,
}: VerificationMemberCardProps) {
  const ministries = member.member_ministries.slice(0, compact ? 2 : 3);
  const remaining = Math.max(0, member.member_ministries.length - ministries.length);

  return (
    <article
      className={[
        "flex min-h-[228px] flex-col bg-white",
        active ? "ring-1 ring-inset ring-[#970e24]/20" : "",
      ].join(" ")}
    >
      <div className="h-1.5 w-full bg-[#970e24]" />

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#970e24]">
              Registry member
            </p>
            <h3 className="mt-2 truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {member.first_name} {member.last_name}
            </h3>
            <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
              <Church className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{member.parish}</span>
            </p>
          </div>

          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#faedf0] text-[#970e24]">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {ministries.length > 0 ? (
            ministries.map((membership) => (
              <span
                key={membership.id}
                className="inline-flex max-w-full items-center rounded-full border border-[#e7c8cf] bg-[#fff8f9] px-2.5 py-1 text-xs font-medium text-[#730a1c]"
              >
                <span className="truncate">{membership.ministry}</span>
              </span>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">
              No ministry membership available
            </span>
          )}

          {remaining > 0 && (
            <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground">
              +{remaining} more
            </span>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/80 pt-4">
          <p className="text-xs font-medium text-muted-foreground">
            {statusSummary(member.member_ministries)}
          </p>

          <div className="flex items-center gap-2">
            {active && (
              <span className="hidden items-center gap-1.5 text-xs font-semibold text-[#970e24] sm:inline-flex">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Selected
              </span>
            )}

            {onViewDetails && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onViewDetails();
                }}
                className="inline-flex items-center rounded-md bg-[#970e24] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#730a1c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#970e24]/25 focus-visible:ring-offset-2"
              >
                View details
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
