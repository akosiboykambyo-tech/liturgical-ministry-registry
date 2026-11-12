import type { Metadata } from "next";
import LiveFinancialStewardship from "@/components/financial-stewardship/live-read-only-portal";

export const metadata: Metadata = {
  title: "Receipt Management — Financial Stewardship",
  robots: { index: false, follow: false },
};

// Reuse the existing server-verified COWL collections access boundary.
// The new interface is explicitly preview-only, with no financial writes.
export default function FinancialStewardshipReceiptManagementPage() {
  return <LiveFinancialStewardship section="collections" workspace="cowl" />;
}
