"use client";

import StagingReceiptCustody from "@/components/financial-stewardship/staging-receipt-custody";
import LegacyFinancialStewardshipDemo from "@/components/financial-stewardship/legacy-financial-stewardship-demo";

export default function FinancialStewardshipPage() {
  return process.env.NEXT_PUBLIC_FS_STAGING_URL ===
    "https://rtptybxugjhvpfjvcvgw.supabase.co"
    ? <StagingReceiptCustody mode="cowl" />
    : <LegacyFinancialStewardshipDemo />;
}
