"use client";

import { useMemo } from "react";
import { ebGaramond } from "@/app/fonts";
import { VerificationDepthCarousel } from "@/components/verification-depth-carousel";
import {
  VerificationMemberCard,
  type VerificationCardMember,
} from "@/components/verification-member-card";

type VerificationResultSelectorProps = {
  results: VerificationCardMember[];
  activeIndex: number;
  onChange: (index: number) => void;
  onViewDetails: () => void;
  hideControls?: boolean;
};

export function VerificationResultSelector({
  results,
  activeIndex,
  onChange,
  onViewDetails,
  hideControls = false,
}: VerificationResultSelectorProps) {
  const items = useMemo(
    () =>
      results.map((member, index) => ({
        id: member.id,
        label: `${member.first_name} ${member.last_name}`,
        content: (
          <VerificationMemberCard
            member={member}
            active={index === activeIndex}
            onViewDetails={index === activeIndex ? onViewDetails : undefined}
          />
        ),
      })),
    [activeIndex, onViewDetails, results]
  );

  if (results.length === 0) return null;

  if (results.length === 1) {
    return (
      <div className="mx-auto w-full max-w-[650px] overflow-hidden border border-[#E6DADC] bg-[#FBF9F9] shadow-[0_12px_24px_-20px_rgba(58,0,16,0.4)]">
        <VerificationMemberCard
          member={results[0]}
          active
          onViewDetails={onViewDetails}
        />
      </div>
    );
  }

  const next = results[activeIndex + 1] ?? null;

  return (
    <div>
      <VerificationDepthCarousel
        items={items}
        activeIndex={activeIndex}
        onChange={onChange}
        hideControls={hideControls}
      />

      {!hideControls && (
        <div className="mx-auto mt-3 max-w-[650px] text-center">
          <p
            className={`${ebGaramond.className} text-[25px] font-medium leading-none text-[#1E1114]`}
          >
            {activeIndex + 1} of {results.length}
          </p>
          {next && (
            <p className="mt-2 text-[14px] leading-6 text-[#5F4A4F]">
              Next: {next.first_name} {next.last_name}, {next.parish}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
