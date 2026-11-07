"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, ArrowLeftRight, BookOpenCheck, CheckCircle2, ChevronRight,
  ClipboardCheck, Clock3, FileText, Landmark, LayoutDashboard, Loader2,
  ReceiptText, RotateCcw, ShieldCheck, Wallet, X,
} from "lucide-react";
import { ebGaramond } from "@/app/fonts";
import PortalShell, { type PortalNavGroup } from "@/components/portal-shell";
import { useAuth } from "@/lib/auth-context";
import BookletCustodyDemo from "@/components/financial-stewardship/booklet-custody-demo";
import Phase3FinancialDemo from "@/components/financial-stewardship/phase3-financial-demo";
import { bookletCounts, useReceiptBookletDemo } from "@/lib/financial-stewardship-booklet-demo";
import { DEMO_RECEIPT_BREAKDOWNS, REFERENCE_RECEIPT } from "@/lib/financial-stewardship-receipt-preview";

type Section = "overview" | "incoming" | "booklets" | "history" | "reconcile";
type Status = "Pending Curia review" | "Curia confirmed" | "Discrepancy recorded";
type ReceiptLine = { serial: string; receiptDate: string; parish: string; ministry: string; centavos: number };
type Remittance = {
  id: string;
  submittedAt: string;
  preparedBy: string;
  declaredCentavos: number;
  receipts: ReceiptLine[];
  status: Status;
  acceptedCentavos?: number;
  verifiedSerials?: string[];
  receivedBy?: string;
  curiaReference?: string;
  reviewedAt?: string;
  discrepancyNote?: string;
};
type AuditEvent = { id: string; time: string; action: string; detail: string; actor: string };

const SAMPLE_REMITTANCES: Remittance[] = [
  {
    id: "REM-2026-001", submittedAt: "2026-11-04", preparedBy: "COWL Secretary (sample)",
    declaredCentavos: 600000, status: "Curia confirmed", acceptedCentavos: 600000,
    verifiedSerials: ["000101", "000102", "000103"],
    receivedBy: "Curia Cashier (sample)", curiaReference: "CUR-ACK-2026-001", reviewedAt: "2026-11-04",
    receipts: [
      { serial: "000101", receiptDate: "2026-11-02", parish: "San Roque Cathedral Parish", ministry: "Ministry of Lectors and Commentators", centavos: 200000 },
      { serial: "000102", receiptDate: "2026-11-02", parish: "San Bartolome Parish", ministry: "Extraordinary Ministers of Holy Communion", centavos: 150000 },
      { serial: "000103", receiptDate: "2026-11-03", parish: "The Diocesan Shrine and Parish of Our Lady of Grace", ministry: "Ministry of Greeters and Collectors", centavos: 250000 },
    ],
  },
  {
    id: "REM-2026-002", submittedAt: "2026-11-06", preparedBy: "COWL Secretary (sample)",
    declaredCentavos: 500000, status: "Pending Curia review",
    receipts: [
      { serial: "000104", receiptDate: "2026-11-04", parish: "San Roque Cathedral Parish", ministry: "Ministry of Liturgical Music", centavos: 180000 },
      { serial: "000105", receiptDate: "2026-11-05", parish: "San Bartolome Parish", ministry: "Ministry of Altar Servers", centavos: 320000 },
    ],
  },
];

const INITIAL_AUDIT: AuditEvent[] = [
  { id: "audit-1", time: "Nov 6, 2026", action: "Submitted to Curia", detail: "REM-2026-002 · ₱5,000.00 · 2 receipt duplicates submitted", actor: "COWL Secretary (sample)" },
  { id: "audit-2", time: "Nov 4, 2026", action: "Curia confirmed", detail: "REM-2026-001 · ₱6,000.00 · 3 receipt duplicates verified", actor: "Curia Cashier (sample)" },
  { id: "audit-3", time: "Nov 1, 2026", action: "Receipt booklet issued", detail: "COWL-001 · serial numbers 000101–000150", actor: "Curia Custodian (sample)" },
];

const initialRemittances = () => SAMPLE_REMITTANCES.map(item => ({
  ...item, receipts: item.receipts.map(receipt => ({ ...receipt })),
  verifiedSerials: item.verifiedSerials ? [...item.verifiedSerials] : undefined,
}));
const money = (centavos: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(centavos / 100);
const formatDate = (value: string) => new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value + "T00:00:00Z"));
function parseCentavos(value: string): number | null {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
}
function StatusTag({ status }: { status: Status }) {
  const style = status === "Curia confirmed"
    ? "border-[#B8DCD3] bg-[#EAF7F2] text-[#145747]"
    : status === "Discrepancy recorded"
      ? "border-[#E6B6BB] bg-[#FFF1F2] text-[#922A38]"
      : "border-[#DDCE9C] bg-[#FFFAE9] text-[#805C16]";
  return <span className={"inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold " + style}>
    {status === "Curia confirmed" ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : status === "Discrepancy recorded" ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> : <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />}
    {status}
  </span>;
}
function Metric({ title, value, note, Icon }: { title: string; value: string; note: string; Icon: typeof Wallet }) {
  return <div className="border border-[#E6DADC] bg-white p-5">
    <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-[#5F4A4F]">{title}</p><Icon className="h-5 w-5 shrink-0 text-[#890022]" aria-hidden="true" /></div>
    <p className="mt-4 text-[27px] font-semibold tabular-nums tracking-tight">{value}</p>
    <p className="mt-2 text-xs leading-5 text-[#706268]">{note}</p>
  </div>;
}
export default function CuriaPreviewPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => { if (!loading && !user) router.replace("/admin"); }, [loading, user, router]);

  const [section, setSection] = useState<Section>("overview");
  const { booklets: demoBooklets } = useReceiptBookletDemo();
  const sampleBooklet = demoBooklets.find(item => item.id === "COWL-001");
  const sampleCounts = sampleBooklet ? bookletCounts(sampleBooklet) : { total: 50, issued: 6, voided: 1, missing: 0, available: 43 };
  const [remittances, setRemittances] = useState<Remittance[]>(initialRemittances);
  const [audit, setAudit] = useState<AuditEvent[]>(INITIAL_AUDIT);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amount, setAmount] = useState("5000.00");
  const [checkedSerials, setCheckedSerials] = useState<string[]>([]);
  const [officer, setOfficer] = useState("Curia Cashier (demo)");
  const [curiaReference, setCuriaReference] = useState("");
  const [discrepancy, setDiscrepancy] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const selected = remittances.find(item => item.id === selectedId) || null;
  const submitted = remittances.filter(item => item.status === "Pending Curia review");
  const confirmed = remittances.filter(item => item.status === "Curia confirmed");
  const flagged = remittances.filter(item => item.status === "Discrepancy recorded");
  const pendingCentavos = submitted.reduce((total, item) => total + item.declaredCentavos, 0);
  const confirmedCentavos = confirmed.reduce((total, item) => total + (item.acceptedCentavos || 0), 0);
  const checkedCount = selected ? selected.receipts.filter(receipt => checkedSerials.includes(receipt.serial)).length : 0;
  const parsedAmount = parseCentavos(amount);
  const linesReconcile = Boolean(selected && selected.receipts.length > 0 &&
    selected.receipts.reduce((total, receipt) => total + receipt.centavos, 0) === selected.declaredCentavos &&
    selected.receipts.every(receipt => {
      const details = DEMO_RECEIPT_BREAKDOWNS[receipt.serial];
      return details && details.participantCount * details.feeCentavos === receipt.centavos;
    }));
  const canConfirm = Boolean(selected?.status === "Pending Curia review" && linesReconcile &&
    parsedAmount !== null && parsedAmount === selected.declaredCentavos &&
    checkedCount === selected.receipts.length &&
    officer.trim().length >= 3 && curiaReference.trim().length >= 3);
  const canFlag = Boolean(selected?.status === "Pending Curia review" &&
    parsedAmount !== null && officer.trim().length >= 3 && discrepancy.trim().length >= 10);

  const confirmedSerials = useMemo(() => new Set(confirmed.flatMap(item => item.verifiedSerials || [])), [confirmed]);
  const pendingSerials = useMemo(() => new Set(submitted.flatMap(item => item.receipts.map(receipt => receipt.serial))), [submitted]);

  const menu: { key: Section; label: string; Icon: typeof Wallet }[] = [
    { key: "overview", label: "Dashboard (Sample)", Icon: LayoutDashboard },
    { key: "incoming", label: "Incoming Remittances (Sample)", Icon: ArrowLeftRight },
    { key: "reconcile", label: "Phase 3 Reconciliation", Icon: FileText },
    { key: "booklets", label: "Receipt Booklets", Icon: ReceiptText },
    { key: "history", label: "History & Audit", Icon: ClipboardCheck },
  ];
  function openReview(item: Remittance) {
    setSelectedId(item.id);
    setAmount((item.declaredCentavos / 100).toFixed(2));
    setCheckedSerials([]);
    setOfficer("Curia Cashier (demo)");
    setCuriaReference("");
    setDiscrepancy("");
    setNotice(null);
    setSection("incoming");
  }
  function recordOutcome(type: "confirmed" | "discrepancy") {
    if (!selected || selected.status !== "Pending Curia review") return;
    if (type === "confirmed" && !canConfirm) return;
    if (type === "discrepancy" && !canFlag) return;
    const nextStatus: Status = type === "confirmed" ? "Curia confirmed" : "Discrepancy recorded";
    const accepted = parsedAmount === null ? 0 : parsedAmount;
    const now = new Date();
    setRemittances(items => items.map(item => item.id === selected.id
      ? {
        ...item, status: nextStatus, acceptedCentavos: accepted, verifiedSerials: checkedSerials,
        receivedBy: officer.trim(), curiaReference: curiaReference.trim() || undefined,
        reviewedAt: now.toISOString().slice(0, 10), discrepancyNote: type === "discrepancy" ? discrepancy.trim() : undefined,
      } : item));
    setAudit(items => [{
      id: "demo-" + String(items.length + 1), time: "Just now (this preview only)",
      action: type === "confirmed" ? "Curia confirmed" : "Discrepancy recorded",
      detail: selected.id + " · " + money(accepted) + " physically counted · " + checkedSerials.length + " duplicates checked"
        + (type === "discrepancy" ? " · " + discrepancy.trim() : ""),
      actor: officer.trim() + " (simulated)",
    }, ...items]);
    setNotice(type === "confirmed"
      ? "Sample confirmation recorded in this page only. No funds or real records were changed."
      : "Sample discrepancy recorded in this page only. No funds or real records were changed.");
  }
  function resetDemo() {
    setRemittances(initialRemittances());
    setAudit(INITIAL_AUDIT);
    setSelectedId(null);
    setSection("overview");
    setNotice(null);
  }

  if (loading || !user) return <div className="flex min-h-screen items-center justify-center bg-[#FBF9F9]" role="status">
    <Loader2 className="h-6 w-6 animate-spin text-[#890022]" aria-hidden="true" />
    <span className="sr-only">Checking preview sign-in</span>
  </div>;

  const groups: PortalNavGroup[] = [{
    name: "Curia",
    items: menu.map(({ key, label, Icon }) => ({
      id: key,
      label,
      icon: Icon,
      active: section === key,
      onSelect: () => { setSection(key); setSelectedId(null); setNotice(null); },
    })),
  }];
  return <PortalShell
    title="Curia Portal" subtitle="COWL-DOK · Demonstration"
    homeHref="/curia" navigationLabel="Curia navigation" groups={groups}
    footer={<>
      <p className="text-xs font-semibold uppercase tracking-wide text-white/75">Preview access</p>
      <p className="mt-2 text-xs leading-5 text-white/85">Signed-in tester only. Curia-specific permissions are not implemented.</p>
      <Link href="/admin/financial-stewardship-preview" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-white underline underline-offset-4">
        <ArrowLeftRight className="h-4 w-4" /> COWL financial demo
      </Link>
    </>}
    compactFooter={<Link href="/admin/financial-stewardship-preview" title="COWL financial demo" aria-label="COWL financial demo"
      className="grid h-11 w-11 place-items-center rounded-sm text-white hover:bg-white/15">
      <ArrowLeftRight className="h-[18px] w-[18px]" aria-hidden="true" />
    </Link>}
  >
        <header className="border-b border-[#E6DADC] bg-white px-4 py-4 sm:px-7 lg:px-10">
          <div className="mx-auto flex w-full max-w-[1450px] flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#890022]">Diocesan Curia</p>
              <p className="text-sm text-[#655459]">Financial Stewardship · Remittance Accountability</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="border border-[#DCCBA3] bg-[#FFF8E8] px-3 py-1.5 text-xs font-semibold text-[#765015]">SAMPLE DATA ONLY</span>
              <button type="button" onClick={resetDemo} className="inline-flex min-h-9 items-center gap-2 border border-[#CEBEC3] bg-white px-3 text-xs font-semibold text-[#5F4A4F] hover:bg-[#FBF9F9]">
                <RotateCcw className="h-3.5 w-3.5" /> Reset remittance demo
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1450px] space-y-6 px-4 py-6 sm:px-7 lg:px-10 lg:py-9">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#890022]">Curia · Financial Stewardship</p>
            <h1 className={ebGaramond.className + " mt-2 text-[38px] font-medium leading-[1.03] sm:text-[47px]"}>
              {section === "overview" ? "Remittance Dashboard" : section === "incoming" ? "Incoming Remittances" : section === "reconcile" ? "Curia Reconciliation (Phase 3)" : section === "booklets" ? "Official Receipt Booklets" : "Remittance History & Audit"}
            </h1>
            <p className="mt-3 max-w-[850px] text-sm leading-6 text-[#6F6265]">A simulated Curia workspace to independently acknowledge funds and the duplicate copies of Curia-issued official receipts submitted by COWL.</p>
          </div>

          <div role="note" className="border-l-4 border-[#890022] bg-[#F8EDEF] px-4 py-3 text-sm leading-6 text-[#4D343A]">
            <strong>Prototype only.</strong> The Dashboard and Incoming Remittances sample ledger is fictional. Phase 3 Reconciliation is a separate browser-only workflow connected to COWL Phase 3, while receipt booklets remain fictional. The Receipt Booklets section also shows a separate transcription of the real receipt photo you supplied, explicitly excluded from mock transactions. Confirmation and discrepancy actions affect this browser page only; there is no financial database, Curia authorization, audit persistence or synchronization with COWL.
          </div>

          {section === "overview" && <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric title="Remittances awaiting review" value={String(submitted.length)} note="Submitted by COWL; not yet acknowledged" Icon={Clock3} />
              <Metric title="Amount pending review" value={money(pendingCentavos)} note="Awaiting independent Curia verification" Icon={Wallet} />
              <Metric title="Confirmed funds" value={money(confirmedCentavos)} note="Recorded as verified in this demo" Icon={CheckCircle2} />
              <Metric title="Open discrepancies" value={String(flagged.length)} note="Require follow-up, not automatic acceptance" Icon={AlertTriangle} />
            </div>
            <div className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
              <section className="border border-[#E6DADC] bg-white p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className={ebGaramond.className + " text-[28px]"}>Awaiting your review</h2>
                  <button type="button" onClick={() => setSection("incoming")} className="text-sm font-semibold text-[#0B5C5A] hover:underline">All remittances</button>
                </div>
                {submitted.length ? <div className="mt-4 space-y-3">{submitted.map(item => <button key={item.id} type="button" onClick={() => openReview(item)}
                  className="flex w-full flex-wrap items-center justify-between gap-4 border border-[#E6DADC] bg-[#FFFCFD] px-4 py-4 text-left hover:border-[#890022]">
                  <div><p className="font-semibold">{item.id}</p><p className="mt-1 text-xs text-[#6F6265]">{formatDate(item.submittedAt)} · {item.receipts.length} duplicate copies</p></div>
                  <div className="flex items-center gap-3"><span className="font-semibold tabular-nums">{money(item.declaredCentavos)}</span><ChevronRight className="h-4 w-4 text-[#890022]" /></div>
                </button>)}</div> : <div className="mt-5 border border-[#CDE5D9] bg-[#EFF9F4] p-4 text-sm text-[#145747]">There are no sample remittances awaiting review.</div>}
              </section>
              <section className="border border-[#E6DADC] bg-white p-5 sm:p-6">
                <h2 className={ebGaramond.className + " text-[28px]"}>Curia verification checklist</h2>
                <div className="mt-4 space-y-4">
                  {[
                    ["Count the remitted funds", "Verify the actual amount against COWL's declaration."],
                    ["Inspect duplicate receipts", "Match each physical duplicate to the serial-number list."],
                    ["Record the receiving officer", "Identify the Curia personnel accountable for the handover."],
                    ["Confirm or flag a discrepancy", "Never mark mismatched funds or copies as fully reconciled."],
                  ].map(([name, detail], index) => <div key={name} className="flex items-start gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#F5E7EB] text-xs font-bold text-[#890022]">{index + 1}</span>
                    <div><p className="text-sm font-semibold">{name}</p><p className="mt-1 text-xs leading-5 text-[#6F6265]">{detail}</p></div>
                  </div>)}
                </div>
              </section>
            </div>
            <section className="border border-[#E6DADC] bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className={ebGaramond.className + " text-[28px]"}>Receipt booklet accountability</h2><p className="mt-1 text-sm text-[#6F6265]">Curia booklets entrusted to COWL</p></div>
                <button type="button" onClick={() => setSection("booklets")} className="inline-flex items-center gap-2 text-sm font-semibold text-[#0B5C5A] hover:underline">View inventory <ChevronRight className="h-4 w-4" /></button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="bg-[#FBF9F9] p-4"><p className="text-xs text-[#6F6265]">Booklet serials</p><p className="mt-1 text-lg font-semibold tabular-nums">000101–000150</p></div>
                <div className="bg-[#FBF9F9] p-4"><p className="text-xs text-[#6F6265]">Issued / Voided / Unused</p><p className="mt-1 text-lg font-semibold">{sampleCounts.issued} / {sampleCounts.voided} / {sampleCounts.available}</p></div>
                <div className="bg-[#FBF9F9] p-4"><p className="text-xs text-[#6F6265]">Duplicate copies verified</p><p className="mt-1 text-lg font-semibold">{confirmedSerials.size} / 6</p></div>
              </div>
            </section>
          </>}

          {section === "reconcile" && <Phase3FinancialDemo mode="curia" />}

          {section === "incoming" && <>
            <section className="overflow-hidden border border-[#E6DADC] bg-white">
              <div className="p-5"><h2 className={ebGaramond.className + " text-[28px]"}>Remittances submitted by COWL</h2><p className="mt-1 text-sm text-[#6F6265]">Select a pending item to simulate the Curia cashier's verification.</p></div>
              <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-y border-[#E6DADC] bg-[#FBF9F9] text-xs uppercase tracking-wide text-[#6F6265]"><tr>
                  <th className="px-4 py-3">Reference</th><th className="px-4 py-3">Submitted</th><th className="px-4 py-3 text-right">Declared amount</th><th className="px-4 py-3">Receipt copies</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th>
                </tr></thead>
                <tbody className="divide-y divide-[#EDE5E7]">{remittances.map(item => <tr key={item.id}>
                  <td className="px-4 py-4 font-semibold">{item.id}</td>
                  <td className="px-4 py-4">{formatDate(item.submittedAt)}</td>
                  <td className="px-4 py-4 text-right font-semibold tabular-nums">{money(item.declaredCentavos)}</td>
                  <td className="px-4 py-4">{item.receipts.length}</td>
                  <td className="px-4 py-4"><StatusTag status={item.status} /></td>
                  <td className="px-4 py-4"><button type="button" onClick={() => openReview(item)} className="font-semibold text-[#0B5C5A] hover:underline">{item.status === "Pending Curia review" ? "Review" : "Details"}</button></td>
                </tr>)}</tbody>
              </table></div>
            </section>

            {selected && <section aria-labelledby="remittance-review-title" className="border border-[#CBB9BE] bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#890022]">Curia receiving desk · sample</p>
                  <h2 id="remittance-review-title" className={ebGaramond.className + " mt-1 text-[30px]"}>{selected.id}</h2><p className="text-sm text-[#6F6265]">Prepared by {selected.preparedBy} · submitted {formatDate(selected.submittedAt)}</p></div>
                <button type="button" onClick={() => { setSelectedId(null); setNotice(null); }} aria-label="Close remittance details" className="grid h-10 w-10 place-items-center border border-[#E6DADC] hover:bg-[#FBF9F9]"><X className="h-5 w-5" /></button>
              </div>
              {notice && <div role="status" className="mt-5 border border-[#B8DCD3] bg-[#EFF9F4] p-3 text-sm text-[#145747]">{notice}</div>}
              <div className="mt-5 flex flex-wrap items-center gap-4 border-y border-[#E6DADC] py-4">
                <div><p className="text-xs text-[#6F6265]">COWL declared</p><p className="mt-1 text-2xl font-semibold tabular-nums">{money(selected.declaredCentavos)}</p></div>
                <div><p className="text-xs text-[#6F6265]">Duplicate receipts expected</p><p className="mt-1 text-2xl font-semibold">{selected.receipts.length}</p></div>
                <StatusTag status={selected.status} />
              </div>
              {selected.status === "Pending Curia review" ? <>
                <div className="mt-5 grid gap-6 xl:grid-cols-2">
                  <div>
                    <h3 className="font-semibold">1. Verify funds actually received</h3>
                    <label htmlFor="curia-amount" className="mt-3 block text-sm text-[#5F4A4F]">Counted amount in PHP</label>
                    <input id="curia-amount" inputMode="decimal" type="text" value={amount} onChange={event => setAmount(event.target.value)}
                      className="mt-2 h-12 w-full border border-[#CDBFC3] bg-white px-3 text-lg font-semibold outline-none focus:border-[#890022]" placeholder="0.00" />
                    <p className={"mt-2 text-xs " + (parsedAmount === null ? "text-[#922A38]" : parsedAmount !== selected.declaredCentavos ? "text-[#922A38]" : "text-[#145747]")}>
                      {parsedAmount === null ? "Enter a valid peso amount with up to two decimal places." : parsedAmount === selected.declaredCentavos ? "Counted amount matches the declaration." : "Amount differs from the COWL declaration; confirmation is blocked."}
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold">2. Check the physical receipt duplicates</h3>
                    <p className="mt-2 text-xs leading-5 text-[#6F6265]">Tick a serial only after checking its actual paper duplicate and matching the date, paying parish, ministry, amount, participant count, solidarity fee and any printed CODE.</p>
                    <p className={"mt-2 text-xs font-semibold " + (linesReconcile ? "text-[#145747]" : "text-[#922A38]")}>
                      {linesReconcile ? "Sample receipt subtotals reconcile with COWL's declared remittance." : "Receipt subtotals or participant calculations do not reconcile; confirmation is blocked."}
                    </p>
                    <div className="mt-3 space-y-2">{selected.receipts.map(receipt => <label key={receipt.serial} className="flex cursor-pointer items-start gap-3 border border-[#E6DADC] px-3 py-3 hover:bg-[#FFFCFD]">
                      <input type="checkbox" checked={checkedSerials.includes(receipt.serial)} onChange={event => setCheckedSerials(items => event.target.checked ? [...items, receipt.serial] : items.filter(value => value !== receipt.serial))}
                        className="mt-1 h-4 w-4 accent-[#890022]" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">OR {receipt.serial} · {money(receipt.centavos)}</span>
                        <span className="mt-1 block text-xs leading-5 text-[#6F6265]">{receipt.parish} · {receipt.ministry}</span>
                        <span className="mt-2 block text-xs leading-5 text-[#5F4A4F]">
                          Receipt date: {formatDate(receipt.receiptDate)} · Renewal year: {DEMO_RECEIPT_BREAKDOWNS[receipt.serial]?.renewalYear || "Not supplied"}
                        </span>
                        <span className="block text-xs leading-5 text-[#5F4A4F]">
                          Solidarity fee breakdown: {DEMO_RECEIPT_BREAKDOWNS[receipt.serial]?.participantCount ?? "—"} participants × {money(DEMO_RECEIPT_BREAKDOWNS[receipt.serial]?.feeCentavos ?? 0)} = {money(receipt.centavos)}
                        </span>
                        <span className="block text-xs leading-5 text-[#5F4A4F]">
                          Printed accounting CODE: {DEMO_RECEIPT_BREAKDOWNS[receipt.serial]?.printedCode || "Not supplied in fictional data"}
                        </span>
                      </span>
                    </label>)}</div>
                    <p className="mt-2 text-xs text-[#6F6265]">{checkedCount} of {selected.receipts.length} duplicates checked</p>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 border-t border-[#E6DADC] pt-5 sm:grid-cols-2">
                  <div><label htmlFor="curia-officer" className="block text-sm font-semibold">3. Receiving officer (demo)</label>
                    <input id="curia-officer" type="text" value={officer} onChange={event => setOfficer(event.target.value)} className="mt-2 h-11 w-full border border-[#CDBFC3] px-3 text-sm outline-none focus:border-[#890022]" placeholder="Curia cashier or authorized officer" /></div>
                  <div><label htmlFor="curia-reference" className="block text-sm font-semibold">Curia acknowledgment reference</label>
                    <input id="curia-reference" type="text" value={curiaReference} onChange={event => setCuriaReference(event.target.value)} className="mt-2 h-11 w-full border border-[#CDBFC3] px-3 text-sm outline-none focus:border-[#890022]" placeholder="E.g. CUR-ACK-2026-002" /></div>
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button type="button" disabled={!canConfirm} onClick={() => recordOutcome("confirmed")}
                    className="inline-flex min-h-11 items-center gap-2 bg-[#890022] px-5 text-sm font-semibold text-white hover:bg-[#70001B] disabled:cursor-not-allowed disabled:bg-[#D1C6C9] disabled:text-[#655B5E]">
                    <CheckCircle2 className="h-4 w-4" /> Simulate Curia confirmation
                  </button>
                  <span className="max-w-[500px] text-xs leading-5 text-[#6F6265]">Requires reconciled receipt subtotals, an exact counted amount, every duplicate checked, an officer and an acknowledgment reference.</span>
                </div>
                <div className="mt-6 border-t border-[#E6DADC] pt-5">
                  <h3 className="flex items-center gap-2 font-semibold text-[#922A38]"><AlertTriangle className="h-4 w-4" /> Record a discrepancy instead</h3>
                  <p className="mt-2 text-sm text-[#6F6265]">Use this for missing copies, an amount mismatch, or another documented physical handover issue.</p>
                  <label htmlFor="curia-discrepancy" className="mt-3 block text-sm font-semibold">Reason for discrepancy (at least 10 characters)</label>
                  <textarea id="curia-discrepancy" rows={3} value={discrepancy} onChange={event => setDiscrepancy(event.target.value)}
                    className="mt-2 w-full border border-[#CDBFC3] p-3 text-sm outline-none focus:border-[#890022]" placeholder="Describe the shortage, missing duplicate or other issue..." />
                  <button type="button" disabled={!canFlag} onClick={() => recordOutcome("discrepancy")}
                    className="mt-3 inline-flex min-h-11 items-center gap-2 border border-[#922A38] bg-white px-5 text-sm font-semibold text-[#922A38] hover:bg-[#FFF1F2] disabled:cursor-not-allowed disabled:border-[#D1C6C9] disabled:text-[#8C8285]">
                    <AlertTriangle className="h-4 w-4" /> Simulate discrepancy
                  </button>
                </div>
              </> : <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div><p className="text-xs text-[#6F6265]">Counted amount</p><p className="mt-1 font-semibold">{money(selected.acceptedCentavos || 0)}</p></div>
                <div><p className="text-xs text-[#6F6265]">Receipt duplicates checked</p><p className="mt-1 font-semibold">{selected.verifiedSerials?.length || 0} of {selected.receipts.length}</p></div>
                <div><p className="text-xs text-[#6F6265]">Receiving officer</p><p className="mt-1 font-semibold">{selected.receivedBy}</p></div>
                <div><p className="text-xs text-[#6F6265]">Curia acknowledgment reference</p><p className="mt-1 font-semibold">{selected.curiaReference || "Not recorded"}</p></div>
                {selected.discrepancyNote && <div className="sm:col-span-2"><p className="text-xs text-[#6F6265]">Discrepancy reason</p><p className="mt-1 font-semibold text-[#922A38]">{selected.discrepancyNote}</p></div>}
              </div>}
            </section>}
          </>}

          {section === "booklets" && <>
            <BookletCustodyDemo mode="curia" />
            <section className="border border-[#E6DADC] bg-white p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#890022]">Separate format reference from uploaded receipt</p>
              <h2 className={ebGaramond.className + " mt-2 text-[29px]"}>Official Receipt {REFERENCE_RECEIPT.serial}</h2>
              <p className="mt-1 text-xs leading-5 text-[#6F6265]">
                Source-based transcription only. This historical receipt is not part of the fictional COWL-001 or CUR-002 inventory and cannot be reassigned or issued by the prototype.
              </p>
              <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ["Issuing entity", REFERENCE_RECEIPT.issuer],
                  ["Receipt date", formatDate(REFERENCE_RECEIPT.receiptDate)],
                  ["Received from", REFERENCE_RECEIPT.receivedFrom],
                  ["Printed ministry", REFERENCE_RECEIPT.ministryOnPaper],
                  ["Registry ministry", REFERENCE_RECEIPT.ministryInRegistry],
                  ["Renewal / purpose", REFERENCE_RECEIPT.purpose],
                  ["Participants", String(REFERENCE_RECEIPT.participantCount)],
                  ["Fee per person", money(REFERENCE_RECEIPT.feeCentavos)],
                  ["Receipt amount", money(REFERENCE_RECEIPT.amountCentavos)],
                  ["Printed CODE", REFERENCE_RECEIPT.printedCode + " (meaning not confirmed)"],
                  ["Payment method", REFERENCE_RECEIPT.paymentMethod],
                ].map(([label, value]) => <div key={label}><dt className="text-xs text-[#6F6265]">{label}</dt><dd className="mt-1 text-sm font-semibold">{value}</dd></div>)}
              </dl>
              <div className="mt-5 border border-[#C7E2D7] bg-[#EFF9F4] px-4 py-3 text-sm font-semibold text-[#145747]">
                Source calculation: 113 × ₱50.00 = ₱5,650.00. Receipt serial stays as text, including its leading zero.
              </div>
            </section>
          </>}

          {section === "history" && <section className="border border-[#E6DADC] bg-white p-5 sm:p-6">
            <div className="flex items-center gap-2"><FileText className="h-5 w-5 text-[#890022]" /><h2 className={ebGaramond.className + " text-[29px]"}>Simulated audit trail</h2></div>
            <p className="mt-1 text-sm text-[#6F6265]">Includes sample historical events and any actions performed during this page session.</p>
            <div className="mt-5 divide-y divide-[#E6DADC] border-t border-[#E6DADC]">{audit.map(event => <div key={event.id} className="grid gap-2 py-4 sm:grid-cols-[150px_1fr] sm:gap-5">
              <p className="text-xs font-semibold text-[#6F6265]">{event.time}</p>
              <div><p className="text-sm font-semibold">{event.action}</p><p className="mt-1 text-sm text-[#5F4A4F]">{event.detail}</p><p className="mt-1 text-xs text-[#6F6265]">Recorded by: {event.actor}</p></div>
            </div>)}</div>
            <p className="mt-5 text-xs text-[#6F6265]">This history is ephemeral and is not an actual audit log. Production records must be append-only and independently authenticated.</p>
          </section>}

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E6DADC] pt-5 text-xs leading-5 text-[#6F6265]">
            <p>Curia preview · no live receipt issuance, confirmation, fund transfer or database updates.</p>
            <Link href="/admin/financial-stewardship-preview" className="inline-flex items-center gap-2 font-semibold text-[#0B5C5A] hover:underline"><ArrowLeftRight className="h-4 w-4" /> Return to COWL financial demo</Link>
          </footer>
        </main>
  </PortalShell>;
}
