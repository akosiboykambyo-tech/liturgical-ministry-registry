"use client";

import StagingReceiptCustody from "@/components/financial-stewardship/staging-receipt-custody";
import LegacyCuriaDemo from "@/components/financial-stewardship/legacy-curia-demo";

/** Phase 4.3: only the isolated test-preview branch renders the operational portal.
 * Production retains the previous portal until a separately authorized release.
 */
export default function CuriaPage() {
  const testStaging = process.env.NEXT_PUBLIC_FS_STAGING_URL ===
    "https://rtptybxugjhvpfjvcvgw.supabase.co";
  return testStaging
    ? <StagingReceiptCustody mode="curia" />
    : <LegacyCuriaDemo />;
}
