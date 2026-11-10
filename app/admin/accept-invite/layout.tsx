import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Activate Your Staff Account — COWL-DOK",
  robots: { index: false, follow: false, noarchive: true },
};

export default function InvitationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
