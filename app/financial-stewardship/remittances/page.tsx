import type { Metadata } from "next";
import LiveFinancialStewardship from "@/components/financial-stewardship/live-read-only-portal";

export const metadata: Metadata = {
  title: "Remittances & Curia — Financial Stewardship",
  robots: { index: false, follow: false },
};

export default function FinancialStewardshipRemittancesPage() {
  return <LiveFinancialStewardship section="remittances" />;
}
