"use client";

import LegacyPage from "@/components/financial-stewardship/legacy-reset-password";
import { StagingSetNewPassword } from "@/components/financial-stewardship/staging-password-recovery";
import { isFinancialStaging } from "@/components/financial-stewardship/staging-portal-login";

export default function Page() {
  return isFinancialStaging() ? <StagingSetNewPassword/> : <LegacyPage/>;
}
