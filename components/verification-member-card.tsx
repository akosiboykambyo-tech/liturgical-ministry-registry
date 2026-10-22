"use client";

import { ebGaramond } from "@/app/fonts";
import type { MemberStatus } from "@/lib/types";
import {
  getCardPublicStatus,
  shortPublicMinistry,
} from "@/lib/verification-public-status";

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
  onViewDetails?: () => void;
};

export function VerificationMemberCard({
  member,
  active = false,
  onViewDetails,
}: VerificationMemberCardProps) {
  return (
    <article
      className={[
        "flex min-h-[250px] flex-col bg-[#FBF9F9] px-6 py-6 text-[#1E1114] sm:px-7",
        active ? "" : "",
      ].join(" ")}
    >
      <h3
        className={`${ebGaramond.className} text-[34px] font-medium leading-none tracking-[-0.02em] sm:text-[40px]`}
      >
        {member.first_name} {member.last_name}
      </h3>

      <p className="mt-4 text-[17px] font-semibold leading-7">
        {member.parish}
      </p>

      <p className="mt-2 text-[17px] leading-7 text-[#5F4A4F]">
        {member.member_ministries.length > 0
          ? member.member_ministries
              .map((membership) => shortPublicMinistry(membership.ministry))
              .join(" · ")
          : "No ministry registration listed"}
      </p>

      <p className="mt-5 text-[15px] font-semibold leading-6 text-[#0B5C5A]">
        {getCardPublicStatus(member.member_ministries)}
      </p>

      {onViewDetails && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onViewDetails();
          }}
          className="mt-auto min-h-12 w-full rounded-[3px] bg-[#970E24] px-5 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-[#7f0c1f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#970E24]/35 focus-visible:ring-offset-2 sm:w-fit"
        >
          View record
        </button>
      )}
    </article>
  );
}