import type { Metadata } from "next";
import LiveFinancialStewardship from "@/components/financial-stewardship/live-read-only-portal";

export const metadata: Metadata = {
  title: "Official Receipt Inventory — Financial Stewardship",
  robots: { index: false, follow: false },
};

export default function FinancialStewardshipInventoryPage() {
  return <LiveFinancialStewardship section="inventory" />;
}
