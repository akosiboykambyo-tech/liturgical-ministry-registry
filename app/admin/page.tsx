"use client";

import LegacyAdminLogin from "@/components/financial-stewardship/legacy-admin-login";
import { StagingPortalLogin, isFinancialStaging } from "@/components/financial-stewardship/staging-portal-login";

/** The test-only feature Preview gets the unified COWL-DOK login.
 * Production retains its existing registry admin authentication.
 */
export default function AdminLoginPage() {
  return isFinancialStaging() ? <StagingPortalLogin/> : <LegacyAdminLogin/>;
}
