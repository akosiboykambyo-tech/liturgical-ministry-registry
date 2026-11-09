import type { Metadata } from "next";
import { DemoShell } from "./_components/demo-ui";

export const metadata: Metadata = {
  title: "COWL-DOK Workflow Prototypes — Test Only",
  description: "Fictional interactive prototypes for registration, parish renewals and Curia reconciliation.",
  robots: { index: false, follow: false },
};

export default function PrototypeLayout({ children }: { children: React.ReactNode }) {
  return <DemoShell>{children}</DemoShell>;
}
