"use client";

/**
 * Staging-only, zero-write portal for temporary finance administrator testers.
 * This component intentionally imports no financial RPCs or table readers.
 * Operational staging roles retain their separate tightly permissioned screens.
 */
import { useState } from "react";
import Link from "next/link";
import { ArrowsLeftRight as ArrowLeftRight, ClipboardCheck as BookOpenCheck, Layers as Database, Eye, Lock, LogOut, ShieldCheck } from "@/components/phosphor-icons";
import { ebGaramond } from "@/app/fonts";
import PortalShell, { type PortalNavGroup } from "@/components/financial-stewardship/demo-portal-shell";

type Mode = "cowl" | "curia";
type Section = "inventory" | "collections" | "remittances";

const LABELS: Record<Section, string> = {
  inventory: "Official Receipt Inventory",
  collections: "Collections and Receipts",
  remittances: "Remittances & Curia",
};

const DESCRIPTIONS: Record<Section, string> = {
  inventory: "Receipt series, physical booklet custody and preprinted serial accountability.",
  collections: "Collection methods, verification stages and official receipt issuance.",
  remittances: "COWL remittance preparation and independent Curia treasury acknowledgment.",
};

const METRICS: Record<Section, [string, string][]> = {
  inventory: [
    ["Registered booklets", "Curia-approved receipt stock"],
    ["Printed serial numbers", "Official numbers held in custody"],
    ["Unused", "Available for authorized issue"],
    ["Exceptions", "Voided or missing serials"],
  ],
  collections: [
    ["QR payment claims", "Unverified payer evidence"],
    ["OTC collections", "Counted funds accepted by COWL"],
    ["Verified funds", "Independently checked credits"],
    ["Official receipts", "Actual authorized paper serials"],
  ],
  remittances: [
    ["Awaiting remittance", "Verified COWL collections"],
    ["Submitted to Curia", "Actual handover records"],
    ["Curia acknowledged", "Independently confirmed receipt"],
    ["Exceptions", "Items requiring reconciliation"],
  ],
};

export default function StagingReadOnlyViewer({
  mode, email, roles, onSignOut,
}: {
  mode: Mode;
  email: string;
  roles: readonly string[];
  onSignOut: () => Promise<void>;
}) {
  const [section, setSection] = useState<Section>("inventory");
  const sections: Section[] = mode === "curia"
    ? ["inventory", "remittances"]
    : ["inventory", "collections", "remittances"];
  const title = mode === "curia" ? "Curia Portal" : "COWL Portal";
  const otherMode: Mode = mode === "curia" ? "cowl" : "curia";
  const otherViewer = otherMode === "cowl"
    ? "cowl_financial_workspace_viewer"
    : "curia_financial_workspace_viewer";
  const otherAllowed = roles.includes(otherViewer);
  const home = mode === "curia" ? "/demo/finance/curia" : "/demo/finance/cowl";
  const groups: PortalNavGroup[] = [{
    name: "Financial Stewardship",
    items: [
      ...sections.map(key => ({
        id: key,
        label: LABELS[key],
        icon: key === "inventory" ? BookOpenCheck : key === "collections" ? Database : ArrowLeftRight,
        active: key === section,
        onSelect: () => setSection(key),
      })),
      ...(otherAllowed ? [{
        id: "switch",
        label: "Switch workspace",
        icon: ArrowLeftRight,
        href: "/demo/finance",
      }] : []),
    ],
  }];

  return <PortalShell
    title={title}
    subtitle="Financial Stewardship · Read-only Test"
    homeHref={home}
    navigationLabel="Financial staging read-only navigation"
    groups={groups}
    footer={<div className="space-y-2">
      <p className="truncate text-xs text-white/85" title={email}>{email}</p>
      <p className="text-xs font-semibold text-white/90">TEST VIEWER · NO TRANSACTIONS</p>
      <button type="button" onClick={() => void onSignOut()}
        className="inline-flex min-h-11 items-center gap-2 text-sm text-white hover:underline">
        <LogOut size={16} aria-hidden="true"/> Sign out
      </button>
    </div>}
    compactFooter={<button type="button" aria-label="Sign out of staging" title="Sign out of staging"
      onClick={() => void onSignOut()} className="grid h-11 w-11 place-items-center text-white hover:bg-white/15">
      <LogOut size={20} aria-hidden="true"/>
    </button>}
  >
    <div className="finance-content">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[color:var(--registry-crimson)]">Financial Stewardship</p>
        <h1 className={ebGaramond.className + " mt-2 finance-page-title"}>
          {LABELS[section]}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed sm:text-base text-[color:var(--registry-muted)]">{DESCRIPTIONS[section]}</p>
      </header>
      <section role="status" className="flex items-start gap-3 border-l-4 border-[color:var(--registry-crimson)] bg-[color:var(--finance-soft-rose)] p-4 text-sm leading-6 text-[color:var(--registry-ink)]">
        <Lock size={19} className="mt-0.5 shrink-0" aria-hidden="true"/>
        <p>
          <strong>Read-only demonstration access.</strong>{" "}
          Your account may review this workspace design, but does not have collection, receipt issuance,
          bank verification, or Curia confirmation privileges. The figures below are unavailable, not zero.
        </p>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={LABELS[section] + " overview"}>
        {METRICS[section].map(([label, description]) => <article
          key={label} className="finance-panel finance-metric flex min-h-[148px] flex-col">
          <p className="text-sm font-semibold text-[color:var(--registry-ink)]">{label}</p>
          <p className={ebGaramond.className + " mt-2 text-[40px] leading-none text-[color:var(--registry-muted)]"}
            aria-label="Data unavailable">—</p>
          <p className="mt-auto pt-2 text-xs leading-5 text-[color:var(--registry-muted)]">{description}</p>
        </article>)}
      </section>
      <section className="border border-[color:var(--registry-hairline)] bg-white p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <Eye size={24} className="mt-1 shrink-0 text-[color:var(--registry-crimson)]" aria-hidden="true"/>
          <div>
            <h2 className={ebGaramond.className + " text-[30px]"}>{LABELS[section]} overview</h2>
            <p className="mt-2 text-sm leading-6 text-[color:var(--registry-muted)]">
              This account can review the workspace layout. No financial ledger or document data is available to this role.
            </p>
          </div>
        </div>
        <div className="mt-5 border border-dashed border-[color:var(--registry-hairline)] bg-[color:var(--registry-page)] p-5 text-sm leading-6 text-[color:var(--registry-muted)]">
          <div className="flex items-center gap-2 font-semibold text-[color:var(--registry-ink)]">
            <ShieldCheck size={19} className="text-[color:var(--registry-crimson)]" aria-hidden="true"/>
            No financial operations are enabled for this test role
          </div>
          <p className="mt-2">When real financial authorization is separately approved, the operational
            workflows will continue to use server-checked staff grants, audit records, and separation of duties.</p>
        </div>
      </section>
      <footer className="border-t border-[color:var(--registry-hairline)] pt-4 text-xs text-[color:var(--registry-muted)]">
        COWL-DOK · Isolated financial testing only. No payments, issuing, collection posting or remittances.
        <Link className="ml-2 font-semibold text-[color:var(--registry-crimson)] underline" href="/demo/finance">Back to unified sign-in</Link>
      </footer>
    </div>
  </PortalShell>;
}
