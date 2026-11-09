import { Suspense } from "react";
import { LegacyRegistrationRedirect } from "@/app/admin/_components/legacy-registration-redirect";

export default function LegacyRenewalReviewLayout({ children: _children }: { children: React.ReactNode }) {
  return <Suspense fallback={<p className="text-sm text-[#6B5C62]">Opening Registration…</p>}>
    <LegacyRegistrationRedirect kind="renewalReview" />
  </Suspense>;
}
