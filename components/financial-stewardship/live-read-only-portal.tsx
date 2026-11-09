"use client";

/**
 * Phase 1: read-only Financial Stewardship design for the LIVE registry.
 *
 * No financial Supabase client, query, mutation, payment QR, receipt serial,
 * or test-project environment variable is imported anywhere in this module.
 * Financial features activate only in a separate audited release.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ebGaramond, inter } from "@/app/fonts";
import { useAuth } from "@/lib/auth-context";
import { CenteredAdminLoader } from "@/components/admin-centered-loader";
import {
  ArrowLeft, ArrowsLeftRight, Bank, ChevronLeft, ChevronRight,
  ClipboardList, FileBadge, Lock, LogOut, Menu, Receipt, ShieldCheck, Wallet, X,
} from "@/components/phosphor-icons";

export type FinancialPageSection = "inventory" | "collections" | "remittances";
type FinancialNavigation = {
  key: FinancialPageSection; label: string; href: string; icon: typeof Wallet;
};
const NAVIGATION: FinancialNavigation[] = [
  { key: "inventory", label: "Official Receipt Inventory", href: "/financial-stewardship", icon: Receipt },
  { key: "collections", label: "Collections and Receipts", href: "/financial-stewardship/collections", icon: Wallet },
  { key: "remittances", label: "Remittances & Curia", href: "/financial-stewardship/remittances", icon: ArrowsLeftRight },
];
const DESCRIPTIONS: Record<FinancialPageSection, string> = {
  inventory: "Manage the accountability framework for official receipt series, booklets, and preprinted serial numbers.",
  collections: "Separate QR payment evidence from counter collections and independent confirmation of funds received.",
  remittances: "Track the intended handover of verified collections and receipt copies for independent Curia acknowledgment.",
};
const SURFACE = "border border-[#E6DADC] bg-white";
const PANEL = SURFACE + " border-t-[3px] border-t-[#890022] p-5 sm:p-6";
const EMPTY = "border border-dashed border-[#DDCCD1] bg-[#FCFAFA] px-4 py-6 text-sm leading-6 text-[#5F4A4F]";

function DiocesanCoat({ size = 48 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="705 0 277 230" role="img"
    aria-label="Coat of arms of the Roman Catholic Diocese of Kalookan"
    className="shrink-0 overflow-hidden">
    <image href="/images/Asset_1.svg" x="0" y="0" width="1686.95" height="444.5"/>
  </svg>;
}

function Metric({ label, caption, icon: Icon }: {
  label: string; caption: string; icon: typeof Wallet;
}) {
  return <div className={SURFACE + " flex min-h-[178px] flex-col border-t-[3px] border-t-[#890022] p-5"}>
    <div className="flex items-start justify-between gap-2">
      <p className="text-sm font-semibold text-[#1E1114]">{label}</p>
      <Icon size={22} className="shrink-0 text-[#890022]" aria-hidden="true"/>
    </div>
    <p className={ebGaramond.className + " mt-3 text-[42px] leading-none text-[#5F4A4F]"} aria-label="Not available">—</p>
    <p className="mt-auto pt-3 text-xs leading-5 text-[#5F4A4F]">{caption}</p>
  </div>;
}

function PanelHeading({ title, description, icon: Icon }: {
  title: string; description: string; icon: typeof Wallet;
}) {
  return <header className="flex items-start gap-3">
    <Icon size={25} className="mt-1 shrink-0 text-[#890022]" aria-hidden="true"/>
    <div>
      <h2 className={ebGaramond.className + " text-[30px] font-medium leading-tight"}>{title}</h2>
      <p className="mt-1 text-sm leading-6 text-[#5F4A4F]">{description}</p>
    </div>
  </header>;
}

function InventoryContent() {
  return <div className="space-y-5">
    <section aria-label="Receipt inventory summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={Receipt} label="Registered receipt booklets" caption="Curia-authorized physical stock"/>
      <Metric icon={FileBadge} label="Preprinted serial numbers" caption="Exact official numbers, including leading zeros"/>
      <Metric icon={ShieldCheck} label="Available / unused" caption="Custody verified and available for issue"/>
      <Metric icon={ClipboardList} label="Issued / void / missing" caption="Accountable stock movements"/>
    </section>
    <section className={PANEL} aria-label="Receipt booklet inventory">
      <PanelHeading icon={Receipt} title="Shared booklet inventory"
        description="The authoritative receipt stock will appear here after Curia authorizes the inventory and production financial ledger."/>
      <div className={EMPTY + " mt-5"}>
        <p className="font-semibold text-[#35242B]">Financial inventory is not activated.</p>
        <p className="mt-1">No receipt-stock data is connected to this live interface. Figures above are intentionally unavailable, not zero.</p>
      </div>
    </section>
    <section className={SURFACE + " p-5 sm:p-6"}>
      <h3 className="text-sm font-semibold text-[#1E1114]">Proposed receipt custody controls</h3>
      <p className="mt-2 text-sm leading-6 text-[#5F4A4F]">
        Curia registers each original receipt series and physical booklet. The assigned Commission custodian separately acknowledges receipt.
        Issuance, voiding, and missing serial reports will require the authorized officer and an immutable audit trail.
      </p>
    </section>
  </div>;
}

const COLLECTION_STAGES = [
  { title: "Payment evidence", description: "A QR screenshot is a claim, not verified funds.", icon: FileBadge },
  { title: "Collection verification", description: "Verify QR against actual account credit or OTC against counted cash.", icon: ShieldCheck },
  { title: "Official receipt", description: "Issue a Curia-authorized preprinted serial only after verified collection.", icon: Receipt },
];

function CollectionsContent() {
  return <div className="space-y-5">
    <section aria-label="Collections summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={Wallet} label="QR collection claims" caption="Submitted proof awaiting independent matching"/>
      <Metric icon={Bank} label="OTC cash collections" caption="Authorized cashier and physical count"/>
      <Metric icon={ShieldCheck} label="Verified collections" caption="Actual receipt of funds confirmed"/>
      <Metric icon={Receipt} label="Official receipts issued" caption="Assigned and acknowledged paper serials"/>
    </section>
    <section className={PANEL}>
      <PanelHeading icon={Wallet} title="Collections register"
        description="One register will distinguish payment method, receiving account or cash custodian, verification, and allocation."/>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead className="border-y border-[#E6DADC] bg-[#FBF9F9] text-xs font-semibold uppercase tracking-wide text-[#5F4A4F]">
            <tr><th className="p-3">Collection reference</th><th className="p-3">Method</th>
              <th className="p-3">Receiving custody</th><th className="p-3">Verification</th><th className="p-3">Amount</th></tr>
          </thead>
          <tbody><tr><td colSpan={5} className="p-6 text-center text-sm leading-6 text-[#5F4A4F]">
            The production collections ledger is not connected. No financial records are displayed or recorded here.
          </td></tr></tbody>
        </table>
      </div>
    </section>
    <section className={PANEL}>
      <PanelHeading icon={ClipboardList} title="Collection verification sequence"
        description="The future workflow keeps evidence, actual receipt, and official paper documents separate."/>
      <ol className="mt-5 grid gap-3 md:grid-cols-3">
        {COLLECTION_STAGES.map((stage, index) => {
          const Icon = stage.icon;
          return <li key={stage.title} className={SURFACE + " bg-[#FBF9F9] p-4"}>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wide text-[#890022]">0{index + 1}</span>
              <Icon size={18} className="text-[#890022]" aria-hidden="true"/>
            </div>
            <h3 className="mt-3 text-sm font-semibold">{stage.title}</h3>
            <p className="mt-1 text-xs leading-5 text-[#5F4A4F]">{stage.description}</p>
          </li>;
        })}
      </ol>
    </section>
  </div>;
}

function RemittancesContent() {
  return <div className="space-y-5">
    <section aria-label="Curia remittance summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={Wallet} label="Awaiting remittance" caption="Verified Commission collections awaiting handoff"/>
      <Metric icon={ArrowsLeftRight} label="Submitted to Curia" caption="Funds and official duplicate receipt copies handed over"/>
      <Metric icon={Bank} label="Curia acknowledged" caption="Independent treasury confirmation"/>
      <Metric icon={ClipboardList} label="Discrepancies" caption="Unresolved cash, transfer, or document exceptions"/>
    </section>
    <section className={PANEL}>
      <PanelHeading icon={ArrowsLeftRight} title="Remittances and Curia reconciliation"
        description="Financial custody, the second transfer of funds, and Curia's independent acceptance must remain distinct records."/>
      <div className={EMPTY + " mt-5"}>
        <p className="font-semibold text-[#35242B]">Curia remittances are not activated.</p>
        <p className="mt-1">No production remittance batches, receipt-copy handoffs, or Curia confirmations are connected to this page.</p>
      </div>
    </section>
    <section className={SURFACE + " p-5 sm:p-6"}>
      <h3 className="text-sm font-semibold">Required separation of duties</h3>
      <p className="mt-2 text-sm leading-6 text-[#5F4A4F]">
        The Commission's recording of a verified collection does not equal Curia acknowledgment. Curia must independently confirm
        funds received and receipt copies, under a different authorized treasury identity. Registration approval is another separate decision.
      </p>
    </section>
  </div>;
}

export default function LiveFinancialStewardship({ section }: { section: FinancialPageSection }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const expanded = hoverOpen || focusOpen || pinnedOpen;
  const title = NAVIGATION.find(item => item.key === section)?.label ?? NAVIGATION[0].label;

  useEffect(() => {
    if (!loading && !user) router.replace("/admin");
  }, [loading, user, router]);

  useEffect(() => {
    if (!mobileOpen) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
      if (event.key !== "Tab") return;
      const sidebar = document.getElementById("finance-mobile-sidebar");
      const focusable = sidebar ? Array.from(sidebar.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled])'
      )) : [];
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    document.getElementById("finance-mobile-close")?.focus();
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = oldOverflow;
    };
  }, [mobileOpen]);

  if (loading) return <CenteredAdminLoader fullscreen label="Loading Financial Stewardship…"/>;
  if (!user) return null;

  const nav = (isExpanded: boolean, mobile: boolean) => <nav aria-label={mobile ? "Financial mobile navigation" : "Financial navigation"}
    className="min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-2.5 py-5">
    {NAVIGATION.map(item => {
      const Icon = item.icon, active = item.key === section;
      return <Link key={item.key} href={item.href} aria-current={active ? "page" : undefined}
        aria-label={item.label} title={!isExpanded ? item.label : undefined}
        onClick={() => { if (mobile) setMobileOpen(false); }}
        className={"flex min-h-12 items-center py-2.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white " +
          (isExpanded ? "gap-3 border-l-[3px] px-3 " : "justify-center border-l-0 px-0 ") +
          (active ? "border-white bg-white text-[#890022]" : "border-transparent text-white/90 hover:bg-white/15 hover:text-white")}>
        <Icon size={19} className="shrink-0" aria-hidden="true"/>
        <span aria-hidden={!isExpanded} className={isExpanded ? "min-w-0 truncate" : "sr-only"}>{item.label}</span>
      </Link>;
    })}
    <div className="mt-5 border-t border-white/20 pt-4">
      <Link href="/admin/dashboard" aria-label="Return to Registry" title={!isExpanded ? "Return to Registry" : undefined}
        onClick={() => { if (mobile) setMobileOpen(false); }}
        className={"flex min-h-11 items-center gap-3 px-3 text-sm text-white/90 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white " +
          (!isExpanded ? "justify-center px-0" : "")}>
        <ArrowLeft size={19} className="shrink-0" aria-hidden="true"/>
        {isExpanded && <span>Return to Registry</span>}
      </Link>
    </div>
  </nav>;

  const footer = (isExpanded: boolean) => <footer className="shrink-0 border-t border-white/25 px-3 py-3">
    {isExpanded && <div className="mb-2 px-2">
      <p className="truncate text-xs font-semibold" title={user.email ?? ""}>{user.email ?? "Registry administrator"}</p>
      <p className="mt-1 text-xs text-white/75">Financial interface · Read-only</p>
    </div>}
    <button type="button" title={!isExpanded ? "Sign Out" : undefined} aria-label="Sign Out"
      onClick={async () => { await signOut(); router.replace("/admin"); }}
      className={"flex min-h-11 w-full items-center gap-3 px-2.5 text-sm font-semibold text-white/90 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white " +
        (!isExpanded ? "justify-center" : "")}>
      <LogOut size={19} aria-hidden="true"/>{isExpanded && <span>Sign Out</span>}
    </button>
  </footer>;

  return <div className={inter.className + " min-h-[100dvh] bg-[#FBF9F9] text-[#1E1114]"}>
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#E6DADC] bg-white px-4 lg:hidden">
      <Link href="/financial-stewardship" className="flex min-w-0 items-center gap-2.5">
        <DiocesanCoat size={38}/>
        <span className="truncate text-sm font-semibold text-[#890022]">COWL Financial Stewardship</span>
      </Link>
      <button type="button" aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={mobileOpen} aria-controls="finance-mobile-sidebar"
        onClick={() => setMobileOpen(prev => !prev)}
        className="grid h-11 w-11 place-items-center border border-[#E6DADC] text-[#890022]">
        {mobileOpen ? <X size={20}/> : <Menu size={20}/>}
      </button>
    </header>
    <div className="flex min-h-[100dvh] items-stretch">
      <aside aria-label="Desktop Financial Stewardship sidebar"
        onMouseEnter={() => setHoverOpen(true)}
        onMouseLeave={() => setHoverOpen(false)}
        onFocusCapture={() => setFocusOpen(true)}
        onBlurCapture={event => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusOpen(false);
        }}
        className={"sticky top-0 hidden h-[100dvh] shrink-0 flex-col overflow-hidden bg-[#890022] text-white shadow-[2px_0_16px_rgba(67,12,28,0.10)] transition-[width] duration-300 ease-in-out motion-reduce:transition-none lg:flex " +
          (expanded ? "w-[270px]" : "w-[76px]")}>
        <div className={"flex min-h-[96px] shrink-0 items-center border-b border-white/20 " +
          (expanded ? "gap-3 px-4" : "justify-center px-2")}>
          <DiocesanCoat size={54}/>
          <div className={"min-w-0 overflow-hidden whitespace-nowrap transition-[opacity,max-width] duration-200 " +
            (expanded ? "max-w-[175px] opacity-100" : "max-w-0 opacity-0")}>
            <p className={ebGaramond.className + " text-[22px] font-medium leading-none"}>COWL Portal</p>
            <p className="mt-1 text-[12px] text-white/80">Financial Stewardship</p>
          </div>
        </div>
        <div className={"flex shrink-0 items-center py-2 " + (expanded ? "justify-end px-3" : "justify-center")}>
          <button type="button" onClick={() => setPinnedOpen(prev => !prev)}
            aria-label={pinnedOpen ? "Unpin sidebar" : "Pin sidebar open"}
            aria-pressed={pinnedOpen} title={pinnedOpen ? "Unpin sidebar" : "Pin sidebar open"}
            className="grid h-9 w-9 place-items-center text-white/85 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
            {expanded ? <ChevronLeft size={17}/> : <ChevronRight size={17}/>}
          </button>
        </div>
        {nav(expanded, false)}
        {footer(expanded)}
      </aside>
      <main id="financial-content" className="mx-auto min-w-0 w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8 xl:px-10">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#890022]">Financial Stewardship</p>
          <h1 className={ebGaramond.className + " mt-1 text-[42px] font-medium leading-none sm:text-[48px]"}>{title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#5F4A4F]">{DESCRIPTIONS[section]}</p>
        </header>
        <section role="status" className="mb-6 flex items-start gap-3 border-l-4 border-[#7A4E00] bg-[#FAF5E9] px-4 py-4 text-sm leading-6 text-[#633F0C]">
          <Lock size={20} className="mt-0.5 shrink-0" aria-hidden="true"/>
          <div><strong>Read-only interface — financial operations are not active.</strong>{" "}
            This live page is a design release only. No QR or OTC payment claims, financial accounts,
            receipt stock, collections, or Curia remittances are connected. Only authorized production
            financial controls may enable these operations in a future release.</div>
        </section>
        {section === "inventory" ? <InventoryContent/> : section === "collections" ? <CollectionsContent/> : <RemittancesContent/>}
        <footer className="mt-6 border-t border-[#E6DADC] pt-4 text-xs leading-5 text-[#6B5C62]">
          COWL-DOK · Diocesan Financial Stewardship · Phase 1 interface only. No financial ledger access or transactions.
        </footer>
      </main>
    </div>
    {mobileOpen && <>
      <button type="button" aria-label="Close navigation overlay" className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        onClick={() => setMobileOpen(false)}/>
      <aside id="finance-mobile-sidebar" role="dialog" aria-modal="true"
        aria-label="Mobile Financial Stewardship sidebar"
        className="fixed inset-y-0 left-0 z-50 flex w-[min(86vw,320px)] flex-col bg-[#890022] text-white shadow-2xl lg:hidden">
        <div className="flex min-h-[90px] items-center gap-3 border-b border-white/20 px-4">
          <DiocesanCoat size={48}/>
          <div className="min-w-0 flex-1">
            <p className={ebGaramond.className + " text-[22px]"}>COWL Portal</p>
            <p className="text-xs text-white/80">Financial Stewardship</p>
          </div>
          <button id="finance-mobile-close" type="button" aria-label="Close navigation"
            onClick={() => setMobileOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center hover:bg-white/15">
            <X size={20}/>
          </button>
        </div>
        {nav(true, true)}
        {footer(true)}
      </aside>
    </>}
  </div>;
}
