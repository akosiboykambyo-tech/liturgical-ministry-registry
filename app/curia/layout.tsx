import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Curia Portal — Demonstration",
  description: "Read-only Curia financial stewardship interface prototype with fictional remittance records.",
  robots: { index: false, follow: false },
};

export default function CuriaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
