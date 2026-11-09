"use client";

import StagingReceiptCustody from "@/components/financial-stewardship/staging-receipt-custody";
import LegacyFinancialStewardshipDemo from "@/components/financial-stewardship/legacy-financial-stewardship-demo";

/** Phase 4.3: the existing Financial Stewardship page now operates on the
 * isolated test ledger on the feature preview. No production Auth fallback.
 */
export default function FinancialStewardshipPage() {
  const testStaging = process.env.NEXT_PUBLIC_FS_STAGING_URL ===
    "https://rtptybxugjhvpfjvcvgw.supabase.co";
  return testStaging
    ? <StagingReceiptCustody mode="cowl" />
    : <LegacyFinancialStewardshipDemo />;
}
