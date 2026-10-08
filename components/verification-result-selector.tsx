"use client";

import { useMemo } from "react";
import {
  VerificationDepthCarousel,
} from "@/components/verification-depth-carousel";
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
            compact={results.length > 1}
            onViewDetails={index === activeIndex ? onViewDetails : undefined}
          />
        ),
      })),
    [activeIndex, results]
  );

  if (results.length === 0) return null;

  if (results.length === 1) {
    return (
      <div className="mx-auto w-full max-w-[560px] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_58px_-34px_rgba(52,9,20,0.42)]">
        <VerificationMemberCard
          member={results[0]}
          active
          compact
          onViewDetails={onViewDetails}
        />
      </div>
    );
  }

  return (
    <VerificationDepthCarousel
      items={items}
      activeIndex={activeIndex}
      onChange={onChange}
      hideControls={hideControls}
    />
  );
}