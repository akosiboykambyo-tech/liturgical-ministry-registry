"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, BookOpenCheck, CheckCircle2, ClipboardList,
  Clock3, FileCheck2, HandCoins, Landmark, ReceiptText, Search, ShieldCheck,
  Wallet, X,
} from "lucide-react";
import { ebGaramond } from "@/app/fonts";
import ReceiptFormatPreview from "@/components/financial-stewardship/receipt-format-preview";
import BookletCustodyDemo from "@/components/financial-stewardship/booklet-custody-demo";
import Phase3FinancialDemo from "@/components/financial-stewardship/phase3-financial-demo";
import { bookletCounts, useReceiptBookletDemo } from "@/lib/financial-stewardship-booklet-demo";
import { DEMO_RECEIPT_BREAKDOWNS } from "@/lib/financial-stewardship-receipt-preview";

type Tab = "overview" | "collections" | "format" | "receipts" | "remittances" | "workflow";
type CollectionStage = "COWL custody" | "Submitted to Curia" | "Curia confirmed";
type Collection = {
  id: string; parish: string; ministry: string; amount: number;
  received: string; receipt: string; representative: string;
  collectedBy: string; stage: CollectionStage; remittance: string | null;
};
type Remittance = {
  id: string; date: string; amount: number; receipts: string[];
  preparedBy: string; status: "Submitted — pending Curia confirmation" | "Curia confirmed";
  receivedBy: string | null; confirmedDate: string | null;
};
const COLLECTIONS: Collection[] = [
  { id: "COL-2026-001", parish: "San Roque Cathedral Parish", ministry: "Ministry of Lectors and Commentators", amount: 2000, received: "2026-11-02", receipt: "000101", representative: "Sample Parish Representative A", collectedBy: "COWL Staff A", stage: "Curia confirmed", remittance: "REM-2026-001" },
  { id: "COL-2026-002", parish: "San Bartolome Parish", ministry: "Extraordinary Ministers of Holy Communion", amount: 1500, received: "2026-11-02", receipt: "000102", representative: "Sample Parish Representative B", collectedBy: "COWL Staff A", stage: "Curia confirmed", remittance: "REM-2026-001" },
  { id: "COL-2026-003", parish: "The Diocesan Shrine and Parish of Our Lady of Grace", ministry: "Ministry of Greeters and Collectors", amount: 2500, received: "2026-11-03", receipt: "000103", representative: "Sample Parish Representative C", collectedBy: "COWL Staff B", stage: "Curia confirmed", remittance: "REM-2026-001" },
  { id: "COL-2026-004", parish: "San Roque Cathedral Parish", ministry: "Ministry of Liturgical Music", amount: 1800, received: "2026-11-04", receipt: "000104", representative: "Sample Parish Representative D", collectedBy: "COWL Staff A", stage: "Submitted to Curia", remittance: "REM-2026-002" },
  { id: "COL-2026-005", parish: "San Bartolome Parish", ministry: "Ministry of Altar Servers", amount: 3200, received: "2026-11-05", receipt: "000105", representative: "Sample Parish Representative E", collectedBy: "COWL Staff B", stage: "Submitted to Curia", remittance: "REM-2026-002" },
  { id: "COL-2026-006", parish: "San Roque Cathedral Parish", ministry: "Mother Butler Guild", amount: 1200, received: "2026-11-06", receipt: "000106", representative: "Sample Parish Representative F", collectedBy: "COWL Staff A", stage: "COWL custody", remittance: null },
];
const REMITTANCES: Remittance[] = [
  { id: "REM-2026-001", date: "2026-11-04", amount: 6000, receipts: ["000101", "000102", "000103"], preparedBy: "COWL Secretary (sample)", status: "Curia confirmed", receivedBy: "Curia Cashier (sample)", confirmedDate: "2026-11-04" },
  { id: "REM-2026-002", date: "2026-11-06", amount: 5000, receipts: ["000104", "000105"], preparedBy: "COWL Secretary (sample)", status: "Submitted — pending Curia confirmation", receivedBy: null, confirmedDate: null },
];
const money = (n: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);
const date = (value: string) => new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value + "T00:00:00Z"));
const summary = {
  total: COLLECTIONS.reduce((sum, item) => sum + item.amount, 0),
  confirmed: COLLECTIONS.filter((item) => item.stage === "Curia confirmed").reduce((sum, item) => sum + item.amount, 0),
  submitted: COLLECTIONS.filter((item) => item.stage === "Submitted to Curia").reduce((sum, item) => sum + item.amount, 0),
  cowl: COLLECTIONS.filter((item) => item.stage === "COWL custody").reduce((sum, item) => sum + item.amount, 0),
};
const buttonBase = "min-h-10 border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#890022]";
function StagePill({ stage }: { stage: CollectionStage }) {
  const style = stage === "Curia confirmed"
    ? "border-[#B8DCD3] bg-[#ECF8F3] text-[#145747]"
    : stage === "Submitted to Curia"
      ? "border-[#DCCBA3] bg-[#FFF8E8] text-[#765015]"
      : "border-[#E3D7DC] bg-[#F6F1F3] text-[#5F4A4F]";
  return <span className={"inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold " + style}>{stage}</span>;
}
function Metric({ label, value, note, Icon }: { label: string; value: string; note: string; Icon: typeof Wallet }) {
  return <div className="border border-[#E6DADC] bg-white p-5 sm:p-6">
    <div className="flex items-start justify-between gap-3">
      <p className="text-sm font-semibold text-[#5F4A4F]">{label}</p>
      <Icon className="h-5 w-5 shrink-0 text-[#890022]" aria-hidden="true" />
    </div>
    <p className="mt-3 text-[25px] font-semibold tracking-tight text-[#1E1114] sm:text-[29px]">{value}</p>
    <p className="mt-2 text-xs leading-5 text-[#6F6265]">{note}</p>
  </div>;
}
function CollectionTable({ rows, onChoose }: { rows: Collection[]; onChoose: (item: Collection) => void }) {
  return <div className="overflow-x-auto">
    <table className="w-full min-w-[820px] text-left text-sm">
      <thead className="border-y border-[#E6DADC] bg-[#FBF9F9] text-xs uppercase tracking-[0.07em] text-[#6F6265]">
        <tr>
          <th className="px-4 py-3 font-semibold">Collection / Date</th>
          <th className="px-4 py-3 font-semibold">Parish / Ministry</th>
          <th className="px-4 py-3 font-semibold">Official receipt no.</th>
          <th className="px-4 py-3 text-right font-semibold">Amount</th>
          <th className="px-4 py-3 font-semibold">Custody status</th>
          <th className="px-4 py-3 text-right font-semibold">Details</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[#EDE5E7]">
        {rows.map((item) => <tr key={item.id} className="hover:bg-[#FFFBFC]">
          <td className="px-4 py-4 align-top"><p className="font-semibold text-[#1E1114]">{item.id}</p><p className="mt-1 text-xs text-[#6F6265]">{date(item.received)}</p></td>
          <td className="max-w-[290px] px-4 py-4 align-top"><p className="font-medium text-[#1E1114]">{item.parish}</p><p className="mt-1 text-xs text-[#6F6265]">{item.ministry}</p></td>
          <td className="px-4 py-4 align-top font-semibold tabular-nums text-[#1E1114]">{item.receipt}</td>
          <td className="px-4 py-4 text-right align-top font-semibold tabular-nums">{money(item.amount)}</td>
          <td className="px-4 py-4 align-top"><StagePill stage={item.stage} /></td>
          <td className="px-4 py-4 text-right align-top">
            <button type="button" onClick={() => onChoose(item)} className="font-semibold text-[#0B5C5A] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B5C5A]">View</button>
          </td>
        </tr>)}
        {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-[#6F6265]">No sample collections match your filters.</td></tr>}
      </tbody>
    </table>
  </div>;
}
export default function FinancialStewardshipPreviewPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<"all" | CollectionStage>("all");
  const [selected, setSelected] = useState<Collection | null>(null);
  const { booklets: demoBooklets } = useReceiptBookletDemo();
  const sampleBooklet = demoBooklets.find(item => item.id === "COWL-001");
  const sampleCounts = sampleBooklet ? bookletCounts(sampleBooklet) : { total: 50, issued: 6, voided: 1, missing: 0, available: 43 };
  const filtered = useMemo(() => COLLECTIONS.filter((item) => {
    const match = !query.trim() || [item.id, item.parish, item.ministry, item.receipt, item.representative, item.remittance || ""]
      .join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    return match && (stage === "all" || item.stage === stage);
  }), [query, stage]);
  const tabs: { key: Tab; label: string; Icon: typeof Wallet }[] = [
    { key: "overview", label: "Overview (Sample)", Icon: Wallet },
    { key: "collections", label: "Collections (Sample Ledger)", Icon: HandCoins },
    { key: "workflow", label: "Collections & Remittances (Phase 3)", Icon: ArrowRight },
    { key: "format", label: "Receipt Format (Phase 1)", Icon: ReceiptText },
    { key: "receipts", label: "Receipt Inventory", Icon: ReceiptText },
    { key: "remittances", label: "Curia Remittances (Sample)", Icon: Landmark },
  ];
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.17em] text-[#890022]">COWL-DOK / Administrative Modules</p>
        <h1 className={ebGaramond.className + " mt-2 text-[38px] font-medium leading-[1.05] text-[#1E1114] sm:text-[47px]"}>Financial Stewardship</h1>
        <p className="mt-3 max-w-[780px] text-sm leading-6 text-[#5F4A4F]">Parish ministry collections, Curia-supplied official receipts and accountable remittance of funds and duplicate receipt copies.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/curia" className="inline-flex min-h-10 items-center gap-2 border border-[#890022] bg-white px-4 py-2 text-sm font-semibold text-[#890022] hover:bg-[#F8EDEF]">
          <Landmark className="h-4 w-4" aria-hidden="true" /> Open Curia Portal demo <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <span className="inline-flex items-center gap-2 border border-[#D7C2A7] bg-[#FFF7E9] px-3 py-2 text-xs font-semibold text-[#75511A]"><ShieldCheck className="h-4 w-4" /> DEMONSTRATION ONLY</span>
      </div>
    </div>

    <div role="note" className="border-l-4 border-[#890022] bg-[#F8EDEF] px-4 py-3 text-sm leading-6 text-[#4D343A]">
      <strong>Preview only.</strong> The Overview, Collections (Sample Ledger) and Curia Remittances tabs show fictional historic examples, while Phase 3 provides a separate connected browser-only workflow. The Receipt Format tab transcribes the physical sample you supplied; it is not a new issued receipt. This page makes no financial database changes and cannot issue receipts or transfer funds.
    </div>

    <div className="flex flex-wrap gap-2 border-b border-[#E6DADC] pb-3" role="tablist" aria-label="Financial Stewardship preview sections">
      {tabs.map(({ key, label, Icon }) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => { setTab(key); setSelected(null); }} className={buttonBase + " inline-flex items-center gap-2 " + (tab === key ? "border-[#890022] bg-[#890022] text-white" : "border-[#E6DADC] bg-white text-[#49363A] hover:border-[#890022]")}>
        <Icon className="h-4 w-4" aria-hidden="true" />{label}
      </button>)}
    </div>

    {tab === "overview" && <>
      <section aria-label="Sample financial totals" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total collected by COWL" value={money(summary.total)} note="All six sample collection records" Icon={HandCoins} />
        <Metric label="Still in COWL custody" value={money(summary.cowl)} note="Not yet submitted to the Curia" Icon={Wallet} />
        <Metric label="Submitted, awaiting confirmation" value={money(summary.submitted)} note="Funds and duplicate copies turned over; acknowledgment pending" Icon={Clock3} />
        <Metric label="Confirmed received by Curia" value={money(summary.confirmed)} note="Independently acknowledged sample remittance" Icon={CheckCircle2} />
      </section>
      <div className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
        <section className="border border-[#E6DADC] bg-white p-5 sm:p-6">
          <h2 className={ebGaramond.className + " text-[27px] font-medium"}>Collection to Curia: custody trail</h2>
          <p className="mt-1 text-sm text-[#6F6265]">A payment and its receipt copies move through distinct checkpoints.</p>
          <div className="mt-5 space-y-4">
            {[
              ["01", "Parish ministry remits to COWL", "Record parish, ministry, amount and representative."],
              ["02", "COWL issues Curia-provided official receipt", "Record the actual preprinted serial number and custodian."],
              ["03", "COWL submits funds and duplicate copies", "Prepare a remittance with each covered receipt listed."],
              ["04", "Curia acknowledges and reconciles", "Capture the independently confirmed amount and receipt-copy turnover."],
            ].map(([number, title, detail], index) => <div key={number} className="flex gap-3">
              <div className="flex flex-col items-center"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#F6E8EC] text-xs font-bold text-[#890022]">{number}</span>{index !== 3 && <span className="mt-1 h-full min-h-4 w-px bg-[#E6DADC]" />}</div>
              <div className="pb-3"><p className="font-semibold text-[#2B1A1F]">{title}</p><p className="mt-1 text-sm text-[#6F6265]">{detail}</p></div>
            </div>)}
          </div>
        </section>
        <section className="border border-[#E6DADC] bg-white p-5 sm:p-6">
          <h2 className={ebGaramond.className + " text-[27px] font-medium"}>Receipt accountability</h2>
          <p className="mt-1 text-xs text-[#6F6265]">Phase 1 format review is available under the Receipt Format tab.</p>
          <p className="mt-1 text-sm text-[#6F6265]">Sample booklet supplied by the Curia</p>
          <div className="mt-5 border border-[#E6DADC] bg-[#FBF9F9] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#75656A]">Booklet COWL-001</p>
            <p className="mt-2 text-xl font-semibold tabular-nums">000101–000150</p>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <div><p className="text-2xl font-semibold">{sampleCounts.issued}</p><p className="text-xs text-[#6F6265]">Issued</p></div>
              <div><p className="text-2xl font-semibold">{sampleCounts.voided}</p><p className="text-xs text-[#6F6265]">Voided</p></div>
              <div><p className="text-2xl font-semibold">{sampleCounts.available}</p><p className="text-xs text-[#6F6265]">Unused</p></div>
            </div>
          </div>
          <button type="button" onClick={() => setTab("receipts")} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#0B5C5A] hover:underline">View receipt ledger <ArrowRight className="h-4 w-4" /></button>
          <div className="mt-5 border-t border-[#E6DADC] pt-4">
            <p className="text-sm font-semibold">Duplicate-copy custody</p>
            <p className="mt-1 text-sm text-[#6F6265]">Initially: 3 duplicates confirmed surrendered, 2 submitted, 1 held by COWL. The Phase 2 mock receipt issuance does not create new remittance entries.</p>
          </div>
        </section>
      </div>
      <section className="overflow-hidden border border-[#E6DADC] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <h2 className={ebGaramond.className + " text-[27px] font-medium"}>Recent sample collections</h2>
          <button onClick={() => setTab("collections")} type="button" className="inline-flex items-center gap-2 text-sm font-semibold text-[#0B5C5A] hover:underline">View all <ArrowRight className="h-4 w-4" /></button>
        </div>
        <CollectionTable rows={COLLECTIONS.slice(0, 4)} onChoose={setSelected} />
      </section>
    </>}

    {tab === "collections" && <section className="overflow-hidden border border-[#E6DADC] bg-white">
      <div className="flex flex-wrap items-end justify-between gap-4 p-5">
        <div><h2 className={ebGaramond.className + " text-[27px] font-medium"}>Collections ledger</h2><p className="mt-1 text-sm text-[#6F6265]">Each entry is paired with a physical official receipt number.</p></div>
        <p className="text-sm font-semibold text-[#5F4A4F]">{filtered.length} sample records</p>
      </div>
      <div className="flex flex-wrap gap-3 px-5 pb-5">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search collections</span>
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#75656A]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search parish, receipt, ministry..." className="h-10 w-full border border-[#CFBEC3] bg-white pl-10 pr-3 text-sm outline-none focus:border-[#890022]" />
        </label>
        <label className="min-w-[210px]"><span className="sr-only">Filter collection custody</span><select value={stage} onChange={(event) => setStage(event.target.value as typeof stage)} className="h-10 w-full border border-[#CFBEC3] bg-white px-3 text-sm focus:border-[#890022]">
          <option value="all">All custody statuses</option><option value="COWL custody">Held by COWL</option><option value="Submitted to Curia">Submitted to Curia</option><option value="Curia confirmed">Curia confirmed</option>
        </select></label>
      </div>
      <CollectionTable rows={filtered} onChoose={setSelected} />
    </section>}

    {tab === "workflow" && <Phase3FinancialDemo mode="cowl" />}

    {tab === "format" && <ReceiptFormatPreview />}

    {tab === "receipts" && <BookletCustodyDemo mode="cowl" />}

    {tab === "remittances" && <section className="space-y-4">
      <div><h2 className={ebGaramond.className + " text-[27px] font-medium"}>Curia remittance and turnover</h2><p className="mt-1 text-sm text-[#6F6265]">Each remittance covers funds and the duplicate copies of its listed official receipts.</p></div>
      {REMITTANCES.map((item) => <article key={item.id} className="border border-[#E6DADC] bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-[#890022]">Remittance record</p><h3 className="mt-1 text-xl font-semibold">{item.id}</h3><p className="mt-1 text-sm text-[#6F6265]">Submitted {date(item.date)}</p></div>
          <span className={"inline-flex items-center gap-2 border px-3 py-2 text-xs font-semibold " + (item.status === "Curia confirmed" ? "border-[#B8DCD3] bg-[#ECF8F3] text-[#145747]" : "border-[#DCCBA3] bg-[#FFF8E8] text-[#765015]")}>{item.status === "Curia confirmed" ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}{item.status}</span>
        </div>
        <div className="mt-5 grid gap-4 border-t border-[#EDE5E7] pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-xs text-[#6F6265]">Funds submitted</p><p className="mt-1 text-xl font-semibold">{money(item.amount)}</p></div>
          <div><p className="text-xs text-[#6F6265]">Duplicate copies submitted</p><p className="mt-1 text-xl font-semibold">{item.receipts.length}</p></div>
          <div><p className="text-xs text-[#6F6265]">Receipt serial numbers</p><p className="mt-1 text-sm font-semibold tabular-nums">{item.receipts.join(", ")}</p></div>
          <div><p className="text-xs text-[#6F6265]">Prepared by</p><p className="mt-1 text-sm font-semibold">{item.preparedBy}</p></div>
        </div>
        <div className="mt-5 border-t border-[#EDE5E7] pt-4 text-sm text-[#5F4A4F]">{item.receivedBy
          ? <p className="flex items-center gap-2"><FileCheck2 className="h-4 w-4 text-[#145747]" /> Confirmed by {item.receivedBy} on {date(item.confirmedDate!)}; sample funds and copies reconciled.</p>
          : <p className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-[#765015]" /> Awaiting independent Curia acknowledgment of funds and duplicate receipt copies.</p>}</div>
      </article>)}
    </section>}

    {selected && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#1E1114]/60 px-3 py-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="collection-preview-title" className="max-h-full w-full max-w-[520px] overflow-y-auto border border-[#E6DADC] bg-white p-5 shadow-xl sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-[#890022]">Sample collection detail</p><h2 id="collection-preview-title" className={ebGaramond.className + " mt-1 text-[32px]"}>{selected.id}</h2></div>
          <button type="button" onClick={() => setSelected(null)} aria-label="Close details" className="grid h-9 w-9 place-items-center border border-[#E6DADC] hover:bg-[#FBF9F9]"><X className="h-5 w-5" /></button>
        </div>
        <p className="mt-3 text-2xl font-semibold">{money(selected.amount)}</p>
        <div className="mt-3"><StagePill stage={selected.stage} /></div>
        <dl className="mt-6 space-y-3 text-sm">
          {[
            ["Date received", date(selected.received)], ["Parish", selected.parish],
            ["Ministry", selected.ministry], ["Representative", selected.representative],
            ["Collected by", selected.collectedBy], ["Preprinted official receipt", selected.receipt],
            ["Renewal year (fictional)", DEMO_RECEIPT_BREAKDOWNS[selected.receipt]?.renewalYear || "Not supplied"],
            ["Participants (fictional)", String(DEMO_RECEIPT_BREAKDOWNS[selected.receipt]?.participantCount ?? "Not supplied")],
            ["Fee per person (fictional)", DEMO_RECEIPT_BREAKDOWNS[selected.receipt] ? money(DEMO_RECEIPT_BREAKDOWNS[selected.receipt].feeCentavos / 100) : "Not supplied"],
            ["CODE printed on paper", DEMO_RECEIPT_BREAKDOWNS[selected.receipt]?.printedCode || "Not supplied in fictional ledger"],
            ["Curia remittance", selected.remittance || "Not yet submitted"],
            ["Receipt duplicate", selected.stage === "Curia confirmed" ? "Surrender confirmed by Curia" : selected.stage === "Submitted to Curia" ? "Submitted, pending confirmation" : "In COWL custody"],
          ].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2 border-b border-[#EEE6E8] pb-3"><dt className="text-[#6F6265]">{label}</dt><dd className="max-w-[260px] text-right font-semibold">{value}</dd></div>)}
        </dl>
        <p className="mt-5 text-xs text-[#6F6265]">Read-only demonstration. No official receipt is issued by this page.</p>
      </section>
    </div>}
    <footer className="border-t border-[#E6DADC] pt-4 text-xs leading-5 text-[#6F6265]">
      Interface prototype only. Production financial operations require Curia-approved controls, role-scoped access, non-editable posted transactions and full audit/reconciliation testing.
    </footer>
  </div>;
}
