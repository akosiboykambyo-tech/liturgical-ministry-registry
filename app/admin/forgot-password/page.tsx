"use client";

import LegacyPage from "@/components/financial-stewardship/legacy-forgot-password";
import { StagingForgotPassword } from "@/components/financial-stewardship/staging-password-recovery";
import { isFinancialStaging } from "@/components/financial-stewardship/staging-portal-login";

export default function Page() {
  return isFinancialStaging() ? <StagingForgotPassword/> : <LegacyPage/>;
}
