"use client";

/**
 * Financial Stewardship receipt preparation — approved v0.5 UI integration.
 * Intentionally PREVIEW ONLY: no payment posting, receipt issuance, live
 * serial allocation, audit mutation, paper print, or persisted calibration.
 * Actual issuance must use a reviewed server-side financial ledger.
 */
import { useMemo, useState } from "react";
import { ebGaramond } from "@/app/fonts";
import DemoFinancialReports from "@/components/financial-stewardship/demo-financial-reports";
const PARISHES=["DEMO - Fictional Parish 1","DEMO - Fictional Parish 2","DEMO - Fictional Parish 3","DEMO - Fictional Parish 4"];
const MINISTRIES=["DEMO - Fictional Ministry"];
import { MultiSelectCombobox } from "@/components/multi-select-combobox";
import { Lock, Receipt, ShieldCheck, Printer } from "@/components/phosphor-icons";

type Tab = "issue" | "register" | "calibration";
type MapField = { id: string; label: string; x: number; y: number; width: number; height?: number };
const PAGE_WIDTH = 111.76;
const PAGE_HEIGHT = 170.18;
// Scan-derived draft placements; no published or printer-calibrated template exists.
const DEFAULT_MAP: MapField[] = [
  { id: "date", label: "Receipt date", x: 51, y: 38.5, width: 49 },
  { id: "receivedFrom", label: "Received from", x: 32, y: 45, width: 69 },
  { id: "amountInWords", label: "Amount in words", x: 30, y: 51, width: 70 },
  { id: "amountInline", label: "Amount inline", x: 26, y: 62, width: 30 },
  { id: "description", label: "Particulars", x: 19, y: 79, width: 50, height: 51 },
  { id: "lineAmount", label: "Line amount", x: 77, y: 79, width: 20 },
  { id: "total", label: "Total", x: 77, y: 137.2, width: 21 },
  { id: "cashMark", label: "Cash mark", x: 11, y: 144.7, width: 4 },
  { id: "cashAmount", label: "Cash amount", x: 35, y: 144.7, width: 24 },
  { id: "checkMark", label: "Check mark", x: 11, y: 150.7, width: 4 },
  { id: "checkNumber", label: "Check number", x: 32, y: 150.7, width: 27 },
  { id: "bank", label: "Bank", x: 32, y: 157.2, width: 27 },
  { id: "checkAmount", label: "Check amount", x: 32, y: 163.5, width: 27 },
  { id: "receivedBy", label: "Received by", x: 63, y: 157, width: 38 },
];
const money = (centavos: number | null) =>
  centavos === null ? "—" : new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(centavos / 100);

function parseCentavos(raw: string): number | null {
  const value = raw.trim();
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) return null;
  const [pesos, centavos = ""] = value.split(".");
  const result = Number(pesos) * 100 + Number(centavos.padEnd(2, "0"));
  return Number.isSafeInteger(result) ? result : null;
}

function amountInWords(value: number | null): string {
  if (value === null) return "";
  const small = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const underThousand = (n: number): string => {
    if (n < 20) return small[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + small[n % 10] : "");
    return small[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + underThousand(n % 100) : "");
  };
  const whole = Math.floor(value / 100);
  const fractions = value % 100;
  const parts: string[] = [];
  if (whole >= 1000000) parts.push(underThousand(Math.floor(whole / 1000000)) + " Million");
  if (whole % 1000000 >= 1000) parts.push(underThousand(Math.floor((whole % 1000000) / 1000)) + " Thousand");
  if (whole % 1000 || !parts.length) parts.push(underThousand(whole % 1000));
  return parts.join(" ") + " Pesos" + (fractions ? " and " + underThousand(fractions) + " Centavos" : " Only");
}

function localToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

function withinPaper(fields: MapField[], dx: number, dy: number): boolean {
  return Number.isFinite(dx) && Number.isFinite(dy) && fields.every(field => {
    const { x, y, width, height = 3 } = field;
    return [x, y, width, height].every(Number.isFinite) &&
      x + dx >= 2 && y + dy >= 2 && width >= 3 &&
      x + dx + width <= PAGE_WIDTH - 2 &&
      y + dy + height <= PAGE_HEIGHT - 2;
  });
}

const control = "min-h-11 w-full border border-[color:var(--finance-control-border)] bg-white px-3 py-2 text-sm text-[color:var(--registry-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--registry-button)]";
const label = "mb-1.5 block text-sm font-semibold text-[color:var(--registry-muted)]";
const panel = "finance-panel finance-metric";

export default function ReceiptManagementPreview() {
  const [tab, setTab] = useState<Tab>("issue");
  const [serial, setSerial] = useState("");
  const [date, setDate] = useState(localToday);
  const [parish, setParish] = useState("");
  const [ministry, setMinistry] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [quantity, setQuantity] = useState("");
  const [rate, setRate] = useState("");
  const [overrideAmount, setOverrideAmount] = useState(false);
  const [receivedAmount, setReceivedAmount] = useState("");
  const [additional, setAdditional] = useState("");
  const [method, setMethod] = useState<"cash" | "check">("cash");
  const [checkNo, setCheckNo] = useState("");
  const [bank, setBank] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [unlockText, setUnlockText] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [draftMap, setDraftMap] = useState<MapField[]>(DEFAULT_MAP.map(field => ({ ...field })));
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [exportError,setExportError]=useState("");
  const [exporting,setExporting]=useState(false);

  const count = /^\d{1,5}$/.test(quantity) && Number(quantity) > 0 ? Number(quantity) : null;
  const rateCentavos = parseCentavos(rate);
  const expected = count !== null && rateCentavos !== null &&
    Number.isSafeInteger(count * rateCentavos) ? count * rateCentavos : null;
  const paid = overrideAmount ? parseCentavos(receivedAmount) : expected;
  const validMap = useMemo(() => withinPaper(draftMap, dx, dy), [draftMap, dx, dy]);
  const particulars = [
    ministry ? ministry.toUpperCase() : "MINISTRY NOT SELECTED",
    "RENEWAL REGISTRATION · " + year,
    count !== null && rateCentavos !== null ? count + " RENEWALS × " + money(rateCentavos) : "RENEWALS / RATE NOT SET",
    additional.trim(),
  ].filter(Boolean).join("\n");
  const words = amountInWords(paid);

  const values: Record<string, string> = {
    date: date ? new Date(date + "T12:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "",
    receivedFrom: parish,
    amountInWords: words,
    amountInline: paid === null ? "" : money(paid),
    description: particulars,
    lineAmount: paid === null ? "" : money(paid),
    total: paid === null ? "" : money(paid),
    cashMark: method === "cash" ? "X" : "",
    cashAmount: method === "cash" && paid !== null ? money(paid) : "",
    checkMark: method === "check" ? "X" : "",
    checkNumber: method === "check" ? checkNo : "",
    bank: method === "check" ? bank : "",
    checkAmount: method === "check" && paid !== null ? money(paid) : "",
    receivedBy,
  };

  async function exportSpecimen(calibration=false) {
    if(exporting||!validMap)return;
    setExporting(true);setExportError("");
    try {
      const {jsPDF}=await import("jspdf");
      const pdf=new jsPDF({unit:"mm",format:[PAGE_WIDTH,PAGE_HEIGHT],orientation:"portrait"});
      pdf.setTextColor(137,0,34);pdf.setFontSize(10);
      pdf.text("DEMONSTRATION - NOT VALID",PAGE_WIDTH/2,8,{align:"center"});
      pdf.setFontSize(7);pdf.text("TEST specimen - plain paper only - no official receipt",PAGE_WIDTH/2,13,{align:"center"});
      pdf.setDrawColor(137,0,34);pdf.rect(2,2,PAGE_WIDTH-4,PAGE_HEIGHT-4);
      pdf.setTextColor(30,17,20);pdf.setFontSize(7);
      for(const f of calibration?draftMap:DEFAULT_MAP){
        const x=f.x+(calibration?dx:0),y=f.y+(calibration?dy:0);
        const text=calibration?f.label:values[f.id]?.replace(/₱/g,"PHP ");
        if(!text)continue;
        const lines=pdf.splitTextToSize(text,f.width) as string[];
        pdf.text(lines.slice(0,Math.max(1,Math.floor((f.height??3)/3))),x,y+2);
        if(calibration){pdf.setDrawColor(130,112,120);pdf.rect(x,y,f.width,f.height??3);}
      }
      pdf.setTextColor(137,0,34);pdf.setFontSize(13);
      pdf.text("NOT VALID",PAGE_WIDTH/2,PAGE_HEIGHT/2,{align:"center",angle:25});
      pdf.save(calibration?"DEMO-calibration-specimen.pdf":"DEMO-receipt-specimen.pdf");
    } catch(e){setExportError(e instanceof Error?e.message:"Unable to generate sample PDF.");}
    finally{setExporting(false);}
  }

  function updateField(id: string, prop: "x" | "y" | "width", raw: string) {
    const next = raw === "" ? NaN : Number(raw);
    setDraftMap(previous => previous.map(field => field.id === id ? { ...field, [prop]: next } : field));
  }
  function discard() {
    setDraftMap(DEFAULT_MAP.map(field => ({ ...field })));
    setDx(0); setDy(0); setUnlocked(false); setUnlockText("");
  }

  return <div className="space-y-5" id="receipt-management">
    {exportError&&<p role="alert" className="text-sm text-[color:var(--registry-error)]">{exportError}</p>}
    <section className="border-l-4 border-l-[color:var(--registry-crimson)] bg-[color:var(--finance-soft-rose)] p-4 text-sm leading-6 text-[color:var(--registry-ink)]" role="status">
      <strong>DEMONSTRATION — NOT VALID.</strong> This paper layout is a screen-only draft. Use Collections and Receipts for the TEST ledger. Entries below are temporary browser state:
      they do not reserve a preprinted serial, confirm payment, renew a member, produce an official receipt, or save a financial record. Downloaded specimens are prominently marked as invalid.
      Production printing remains disabled pending Curia approval, audited ledger integration, and Epson LX-310 stock calibration.
    </section>
    <div className="grid gap-3 sm:grid-cols-3" aria-label="Receipt workflow summary">
      {[
        ["Receipt inventory", "TEST ledger"],
        ["Receipts issued", "See TEST register"],
        ["Printer template", "Awaiting calibration"],
      ].map(([name, value]) => <div key={name} className="border border-[color:var(--registry-hairline)] border-t-[3px] border-t-[color:var(--registry-crimson)] bg-white px-4 py-4">
        <p className="text-sm font-semibold">{name}</p>
        <p className="mt-3 text-sm text-[color:var(--registry-muted)]">{value}</p>
      </div>)}
    </div>

    <div className="flex gap-1 overflow-x-auto border-b border-[color:var(--registry-hairline)]" role="tablist" aria-label="Receipt Management tools">
      {([
        ["issue", "Paper preview"],
        ["register", "Receipt Register"],
        ["calibration", "Print Calibration"],
      ] as const).map(([id, text]) =>
        <button key={id} type="button" role="tab" id={"receipt-tab-" + id} aria-controls={"receipt-panel-" + id}
          aria-selected={tab === id} tabIndex={tab === id ? 0 : -1}
          onClick={() => { if (tab === "calibration" && id !== "calibration") discard(); setTab(id); }}
          onKeyDown={event => {
            if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") return;
            event.preventDefault();
            const ids: Tab[] = ["issue", "register", "calibration"];
            const index = ids.indexOf(tab);
            const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3;
            if (tab === "calibration" && ids[next] !== "calibration") discard();
            setTab(ids[next]);
            document.getElementById("receipt-tab-" + ids[next])?.focus();
          }}
          className={"min-h-12 shrink-0 border-b-[3px] px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--registry-button)] " +
            (tab === id ? "border-[color:var(--registry-crimson)] bg-[color:var(--finance-soft-rose)] text-[color:var(--registry-crimson)]" : "border-transparent text-[color:var(--registry-muted)] hover:bg-[color:var(--registry-page)]")}>
          {text}
        </button>)}
    </div>

    {tab === "issue" && <section role="tabpanel" id="receipt-panel-issue" aria-labelledby="receipt-tab-issue" className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(310px,0.8fr)]">
      <div className={panel + " space-y-5"}>
        <div>
          <h2 className={ebGaramond.className + " text-[30px]"}>Payment information</h2>
          <p className="text-sm text-[color:var(--registry-muted)]">Received From is the parish; the ministry appears in Particulars only.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="or-number" className={label}>Preprinted OR number</label>
            <input id="or-number" className={control} value={serial} onChange={e => setSerial(e.target.value.replace(/[^0-9]/g, "").slice(0, 12))}
              inputMode="numeric" placeholder="As printed on Curia's booklet"/>
            <p className="mt-1 text-xs text-[color:var(--registry-muted)]">For future reconciliation only. Never included in the print overlay.</p></div>
          <div><label htmlFor="or-date" className={label}>Receipt date</label>
            <input id="or-date" className={control} type="date" value={date} onChange={e => setDate(e.target.value)}/></div>
          <div className="sm:col-span-2"><span className={label}>Received From — Parish / Mission Station</span>
            <MultiSelectCombobox options={[...PARISHES].sort((a, b) => a.localeCompare(b))}
              selected={parish ? [parish] : []} onChange={items => setParish(items[items.length - 1] ?? "")}
              placeholder="Choose parish or mission station" searchPlaceholder="Search parishes..." emptyText="No matching parish"
              className="min-h-11 rounded-none border-[color:var(--finance-control-border)] text-left"/></div>
          <div className="sm:col-span-2"><label htmlFor="or-ministry" className={label}>Ministry — Particulars</label>
            <select id="or-ministry" className={control} value={ministry} onChange={e => setMinistry(e.target.value)}>
              <option value="">Choose ministry</option>{MINISTRIES.map(m => <option key={m} value={m}>{m}</option>)}
            </select></div>
          <div><label htmlFor="or-year" className={label}>Renewal year</label>
            <input id="or-year" type="number" min="2020" max="2100" className={control} value={year} onChange={e => setYear(e.target.value)}/></div>
          <div><label htmlFor="or-count" className={label}>Number of renewals</label>
            <input id="or-count" type="number" min="1" max="99999" step="1" className={control} value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="Enter count"/></div>
          <div><label htmlFor="or-rate" className={label}>Fictional rate per renewal (₱)</label>
            <input id="or-rate" inputMode="decimal" className={control} value={rate} onChange={e => setRate(e.target.value)}
              placeholder="Enter authorized rate"/></div>
          <div><span className={label}>Calculated total</span><p className="flex min-h-11 items-center border border-[color:var(--registry-hairline)] bg-[color:var(--registry-page)] px-3 font-semibold tabular-nums">{money(expected)}</p></div>
          <label className="flex items-center gap-2 sm:col-span-2 text-sm text-[color:var(--registry-muted)]">
            <input type="checkbox" checked={overrideAmount} onChange={e => setOverrideAmount(e.target.checked)} className="h-4 w-4 accent-[color:var(--registry-crimson)]"/>
            Amount received differs from calculated total
          </label>
          {overrideAmount && <div className="sm:col-span-2"><label htmlFor="or-paid" className={label}>Actual amount received (₱)</label>
            <input id="or-paid" inputMode="decimal" value={receivedAmount} onChange={e => setReceivedAmount(e.target.value)}
              className={control} placeholder="Enter payment received"/></div>}
          <div className="sm:col-span-2 border border-[color:var(--registry-hairline)] bg-[color:var(--registry-page)] px-4 py-3">
            <div className="flex items-center justify-between gap-2"><strong className="text-sm">Amount on receipt</strong><strong className="text-xl tabular-nums text-[color:var(--registry-crimson)]">{money(paid)}</strong></div>
            <p className="mt-1 text-xs text-[color:var(--registry-muted)]">{words || "Enter a count and authorized rate."}</p>
            {paid !== null && expected !== null && paid !== expected && <p className="mt-2 text-xs font-semibold text-[color:var(--registry-amber)]">The amount paid differs from the expected total. This preview does not allocate or verify the difference.</p>}
          </div>
          <div className="sm:col-span-2"><label htmlFor="or-notes" className={label}>Additional information (optional)</label>
            <textarea id="or-notes" rows={3} maxLength={240} className={control} value={additional} onChange={e => setAdditional(e.target.value)}
              placeholder="Batch reference, other relevant information..."/></div>
          <div className="sm:col-span-2"><span className={label}>Payment method</span>
            <div className="flex gap-5 text-sm">
              <label className="flex items-center gap-2"><input type="radio" name="payment-method" checked={method === "cash"} onChange={() => setMethod("cash")}/> Cash</label>
              <label className="flex items-center gap-2"><input type="radio" name="payment-method" checked={method === "check"} onChange={() => setMethod("check")}/> Check</label>
            </div></div>
          {method === "check" && <>
            <div><label htmlFor="or-check" className={label}>Check number</label><input id="or-check" className={control} value={checkNo} onChange={e => setCheckNo(e.target.value)}/></div>
            <div><label htmlFor="or-bank" className={label}>Bank</label><input id="or-bank" className={control} value={bank} onChange={e => setBank(e.target.value)}/></div>
          </>}
          <div className="sm:col-span-2"><label htmlFor="or-receiver" className={label}>Received by (name)</label>
            <input id="or-receiver" className={control} value={receivedBy} onChange={e => setReceivedBy(e.target.value)}
              placeholder="Authorized receiving staff"/></div>
        </div>
        <div className="border-t border-[color:var(--registry-hairline)] pt-4 text-sm text-[color:var(--registry-muted)]">
          <p className="font-semibold text-[color:var(--registry-ink)]">Generated particulars — preview</p>
          <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm">{particulars}</pre>
          <button type="button" disabled={exporting||!validMap||paid===null||!parish||!ministry} onClick={()=>void exportSpecimen()} className="mt-4 inline-flex min-h-11 items-center gap-2 bg-[color:var(--registry-crimson)] px-4 text-sm font-semibold text-white disabled:opacity-40">
            <Receipt size={18}/> Download watermarked specimen
          </button>
        </div>
      </div>
      <div className={panel + " h-fit"}>
        <h2 className={ebGaramond.className + " text-[30px]"}>Paper overlay preview</h2>
        <p className="text-xs text-[color:var(--registry-muted)]">111.76 × 170.18 mm portrait · layout provisional · not to scale on-screen</p>
        <div className="mt-4 overflow-x-auto bg-[color:var(--finance-soft-rose)] p-3 sm:p-5">
          <div className="relative mx-auto w-full max-w-[360px] overflow-hidden border border-[color:var(--registry-hairline)] bg-white shadow-sm"
            style={{ aspectRatio: String(PAGE_WIDTH) + " / " + String(PAGE_HEIGHT) }} aria-label="Receipt preview (screen only)">
            <div className="absolute left-0 top-0 w-full border-b border-dashed border-[color:var(--registry-hairline)] p-3 text-center text-[9px] uppercase tracking-wide text-[color:var(--registry-muted)]">DEMONSTRATION — NOT VALID</div>
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[36%] z-10 -rotate-12 text-center text-xl font-bold text-[color:color-mix(in_srgb,var(--registry-crimson)_35%,transparent)]">DEMONSTRATION — NOT VALID</div>
            {DEFAULT_MAP.map(field => values[field.id] ? <div key={field.id}
              className="absolute overflow-hidden whitespace-pre-wrap break-words font-mono text-[7px] leading-[1.15] text-[color:var(--registry-ink)]"
              style={{
                left: (field.x / PAGE_WIDTH * 100) + "%",
                top: (field.y / PAGE_HEIGHT * 100) + "%",
                width: (field.width / PAGE_WIDTH * 100) + "%",
                maxHeight: ((field.height ?? 9) / PAGE_HEIGHT * 100) + "%",
                textAlign: ["lineAmount", "total"].includes(field.id) ? "right" : "left",
              }}>{values[field.id]}</div> : null)}
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-[color:var(--registry-muted)]">The preprinted official receipt number is deliberately absent. This is a UI-only illustration, not a print-ready or approved template.</p>
      </div>
    </section>}

    {tab === "register" && <section role="tabpanel" id="receipt-panel-register" aria-labelledby="receipt-tab-register" className={panel}>
      <h2 className={ebGaramond.className + " text-[30px]"}>Receipt Register</h2>
      <DemoFinancialReports registerOnly/>
      <p className="mt-4 text-xs text-[color:var(--registry-muted)]">Original receipts go to payers; physical duplicates remain in COWL custody and are available for Curia inspection.</p>
    </section>}

    {tab === "calibration" && <section role="tabpanel" id="receipt-panel-calibration" aria-labelledby="receipt-tab-calibration" className={panel + " space-y-5"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className={ebGaramond.className + " text-[30px]"}>Print Calibration</h2>
          <p className="text-sm text-[color:var(--registry-muted)]">Epson LX-310 · Custom 111.76 × 170.18 mm · X/Y measured from top-left.</p></div>
        <span className="inline-flex items-center gap-2 border border-[color:var(--registry-hairline)] bg-[color:var(--registry-page)] px-3 py-2 text-sm font-semibold">
          <Lock size={16}/>{unlocked ? "Draft unlocked" : "Locked"}
        </span>
      </div>
      <p className="text-sm leading-6 text-[color:var(--registry-muted)]">Both existing COWL staff may prepare a calibration draft; no additional staff role is introduced. This confirmation protects against accidental changes only. Changes are not persisted or published in this preview.</p>
      {!unlocked ? <div className="max-w-lg space-y-3 border border-[color:var(--registry-hairline)] bg-[color:var(--registry-page)] p-4">
        <label htmlFor="unlock-map" className={label}>Type CALIBRATE to unlock a temporary draft</label>
        <input id="unlock-map" className={control} value={unlockText} onChange={e => setUnlockText(e.target.value)} autoComplete="off"/>
        <button type="button" disabled={unlockText !== "CALIBRATE"} onClick={() => { setUnlocked(true); setUnlockText(""); }}
          className="min-h-11 bg-[color:var(--registry-crimson)] px-4 text-sm font-semibold text-white disabled:opacity-40">Unlock draft</button>
      </div> : <div className="flex flex-wrap gap-3">
        <button type="button" onClick={discard} className="min-h-11 border border-[color:var(--registry-crimson)] px-4 text-sm font-semibold text-[color:var(--registry-crimson)]">Discard draft and lock</button>
        <button type="button" disabled={!validMap||exporting} onClick={()=>void exportSpecimen(true)} className="inline-flex min-h-11 items-center gap-2 bg-[color:var(--registry-crimson)] px-4 text-sm font-semibold text-white disabled:opacity-40">
          <Printer size={18}/> Download calibration specimen
        </button>
      </div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="calibration-x" className={label}>Global horizontal offset (mm)</label>
          <input id="calibration-x" type="number" step="0.1" min="-3" max="3" disabled={!unlocked} className={control}
            value={dx} onChange={e => setDx(e.target.value === "" ? NaN : Number(e.target.value))}/></div>
        <div><label htmlFor="calibration-y" className={label}>Global vertical offset (mm)</label>
          <input id="calibration-y" type="number" step="0.1" min="-3" max="3" disabled={!unlocked} className={control}
            value={dy} onChange={e => setDy(e.target.value === "" ? NaN : Number(e.target.value))}/></div>
      </div>
      {!validMap && <p role="alert" className="border-l-4 border-[color:var(--registry-error)] bg-[color:var(--finance-error-surface)] p-3 text-sm text-[color:var(--registry-error)]">At least one field exceeds the proposed paper-safe bounds. Discard or correct the draft.</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[610px] text-left text-sm">
          <caption className="pb-2 text-left text-xs text-[color:var(--registry-muted)]">Receipt serial is intentionally excluded from all printable fields.</caption>
          <thead className="border-y border-[color:var(--registry-hairline)] bg-[color:var(--registry-page)] text-xs uppercase tracking-wide text-[color:var(--registry-muted)]"><tr>
            {["Field", "X (mm)", "Y (mm)", "Width (mm)"].map(col => <th key={col} className="p-2">{col}</th>)}
          </tr></thead>
          <tbody>{draftMap.map(field => <tr key={field.id} className="border-b border-[color:var(--registry-hairline)]">
            <th scope="row" className="p-2 font-medium">{field.label}</th>
            {(["x", "y", "width"] as const).map(property => <td className="p-2" key={property}>
              <input type="number" step="0.1" aria-label={field.label + " " + property} disabled={!unlocked}
                className="min-h-10 w-24 border border-[color:var(--finance-control-border)] px-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--registry-button)]"
                value={Number.isFinite(field[property]) ? field[property] : ""} onChange={e => updateField(field.id, property, e.target.value)}/>
            </td>)}
          </tr>)}</tbody>
        </table>
      </div>
      <div className="border border-[color:var(--registry-hairline)] bg-[color:var(--registry-page)] p-4 text-sm leading-6 text-[color:var(--registry-muted)]">
        <ShieldCheck size={20} className="mb-2 text-[color:var(--registry-crimson)]"/>
        The active template is unchanged. A future production implementation must save a server-audited version, require a physical test and second confirmation, and allow rollback. These browser draft coordinates never become an official printer template.
      </div>
    </section>}
  </div>;

}
