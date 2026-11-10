import type { Metadata } from "next";
import LiveFinancialStewardship from "@/components/financial-stewardship/live-read-only-portal";

export const metadata: Metadata = {
  title: "Collections and Receipts — Curia Financial Stewardship",
  robots: { index: false, follow: false },
};

export default function CuriaFinancialPage() {
  return <LiveFinancialStewardship workspace="curia" section="collections" />;
}
