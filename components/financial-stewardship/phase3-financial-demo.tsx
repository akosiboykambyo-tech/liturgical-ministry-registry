"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowLeftRight, Check, CheckCircle2, ChevronsUpDown,
  ClipboardCheck, FileCheck2, HandCoins, Landmark, ReceiptText,
} from "lucide-react";
import { ebGaramond } from "@/app/fonts";
import { MINISTRIES, PARISHES } from "@/lib/constants";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { parsePesoAmountToCentavos } from "@/lib/financial-stewardship-receipt-preview";
import {
  serialsInBooklet, serialState, useReceiptBookletDemo,
  type FinancialCollectionDemo, type FinancialRemittanceDemo,
} from "@/lib/financial-stewardship-booklet-demo";

type Mode = "cowl" | "curia";
type Notice = { ok: boolean; message: string };
const BUTTON = "inline-flex min-h-11 items-center justify-center gap-2 border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40";
const PRIMARY = BUTTON + " border-[#890022] bg-[#890022] text-white hover:bg-[#75001C]";
const NEUTRAL = BUTTON + " border-[#CDBFC3] bg-white text-[#5F4A4F] hover:bg-[#F8F1F2]";
const INPUT = "h-11 w-full min-w-0 border border-[#CDBFC3] bg-white px-3 text-sm text-[#1E1114] outline-none focus:border-[#890022] focus:ring-1 focus:ring-[#890022]";
const LABEL = "mb-1.5 block text-xs font-semibold text-[#5F4A4F]";
const money = (centavos: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(centavos / 100);
const DATE = "2026-11-07";
const FORM_PLACEHOLDER = "—";

function Field({ id, label, value, onChange, type = "text", note }: {
  id: string; label: string; value: string; onChange: (v: string) => void; type?: string; note?: string;
}) {
  return <div className="min-w-0">
    <label htmlFor={id} className={LABEL}>{label}</label>
    <input id={id} value={value} onChange={event => onChange(event.target.value)}
      className={INPUT} type={type} autoComplete="off" />
    {note && <p className="mt-1 text-xs leading-5 text-[#6F6265]">{note}</p>}
  </div>;
}
function Pill({ status }: { status: FinancialRemittanceDemo["status"] }) {
  return <span className={"inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold " +
    (status === "confirmed" ? "border-[#B8DCD3] bg-[#ECF8F3] text-[#145747]"
      : status === "discrepancy" ? "border-[#E7BABF] bg-[#FFF2F3] text-[#922A38]"
      : "border-[#E8D6A9] bg-[#FFF9EC] text-[#805C16]")}>
    {status === "confirmed" ? <CheckCircle2 className="h-3.5 w-3.5" /> : status === "discrepancy" ? <AlertTriangle className="h-3.5 w-3.5" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
    {status === "confirmed" ? "Curia confirmed" : status === "discrepancy" ? "Discrepancy recorded" : "Pending Curia confirmation"}
  </span>;
}

export default function Phase3FinancialDemo({ mode }: { mode: Mode }) {
  const { booklets, collections, remittances, storageReady, recordCollection, submitRemittance, reviewRemittance } = useReceiptBookletDemo();
  const [notice, setNotice] = useState<Notice | null>(null);
  const handle = (result: { ok: boolean; error?: string }, success: string) =>
    setNotice({ ok: result.ok, message: result.ok ? success : result.error || "The simulated action was not accepted." });

  const acknowledgedBooklets = booklets.filter(booklet => booklet.state === "cowl_custody");
  const [bookletId, setBookletId] = useState("COWL-001");
  const activeBooklet = acknowledgedBooklets.find(booklet => booklet.id === bookletId) || acknowledgedBooklets[0] || null;
  const available = useMemo(() => activeBooklet
    ? serialsInBooklet(activeBooklet).filter(serial => serialState(activeBooklet, serial) === "available")
    : [], [activeBooklet]);
  const [serial, setSerial] = useState("");
  const [parish, setParish] = useState("San Bartolome Parish");
  const [parishOpen, setParishOpen] = useState(false);
  const [parishPrinted, setParishPrinted] = useState("SAN BARTOLOME PARISH");
  const [ministry, setMinistry] = useState("Ministry of Liturgical Music");
  const [ministryPrinted, setMinistryPrinted] = useState("MINISTRY ON LITURGICAL MUSIC");
  const [renewalYear, setRenewalYear] = useState("2026");
  const [date, setDate] = useState(DATE);
  const [participants, setParticipants] = useState("2");
  const [fee, setFee] = useState("50.00");
  const [received, setReceived] = useState("100.00");
  const [purpose, setPurpose] = useState("Renewal Year 2026 — Solidarity Fee (demo)");
  const [printedCode, setPrintedCode] = useState("");
  const [method, setMethod] = useState<"cash" | "check" | "other">("cash");
  const [collectedBy, setCollectedBy] = useState("COWL Collector (demo)");

  const count = /^\d{1,6}$/.test(participants.trim()) ? Number(participants) : null;
  const feeCentavos = parsePesoAmountToCentavos(fee);
  const receivedCentavos = parsePesoAmountToCentavos(received);
  const computed = count !== null && feeCentavos !== null ? count * feeCentavos : null;
  const amountMatches = Boolean(count && feeCentavos && receivedCentavos !== null && receivedCentavos === computed);
  const eligibleCollection = storageReady && activeBooklet && available.includes(serial) && amountMatches &&
    PARISHES.some(p => p === parish) && MINISTRIES.some(m => m === ministry) &&
    collectedBy.trim().length > 2 && purpose.trim().length > 2;

  const notRemitted = collections.filter(c => c.remittanceId === null);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);
  const [preparedBy, setPreparedBy] = useState("COWL Secretary (demo)");
  const [submittedDate, setSubmittedDate] = useState(DATE);
  const [copiesChecked, setCopiesChecked] = useState(false);
  const validSelected = selectedCollectionIds.filter(id => notRemitted.some(c => c.id === id));
  const selectedTotal = notRemitted.filter(c => validSelected.includes(c.id))
    .reduce((sum, c) => sum + c.amountCentavos, 0);

  const [reviewId, setReviewId] = useState("");
  const selectedRemittance = remittances.find(r => r.id === reviewId) || remittances[0] || null;
  const [counted, setCounted] = useState("");
  const [verifiedCollectionIds, setVerifiedCollectionIds] = useState<string[]>([]);
  const [curiaOfficer, setCuriaOfficer] = useState("Curia Cashier (demo)");
  const [curiaRef, setCuriaRef] = useState("");
  const [reviewDate, setReviewDate] = useState(DATE);
  const [reason, setReason] = useState("");
  const auditedIds = selectedRemittance ? verifiedCollectionIds.filter(id => selectedRemittance.collectionIds.includes(id)) : [];
  const auditedTotal = selectedRemittance
    ? collections.filter(c => selectedRemittance.collectionIds.includes(c.id)).reduce((sum, c) => sum + c.amountCentavos, 0)
    : 0;
  const parsedCounted = parsePesoAmountToCentavos(counted);
  const canConfirm = Boolean(selectedRemittance?.status === "pending" &&
    auditedIds.length === selectedRemittance.duplicateCount &&
    selectedRemittance.totalCentavos === auditedTotal &&
    parsedCounted === auditedTotal &&
    curiaOfficer.trim().length >= 3 && curiaRef.trim().length >= 3);
  const canFlag = Boolean(selectedRemittance?.status === "pending" &&
    parsedCounted !== null && curiaOfficer.trim().length >= 3 && reason.trim().length >= 10);

  const pending = remittances.filter(r => r.status === "pending");
  const confirmed = remittances.filter(r => r.status === "confirmed");
  const discrepancies = remittances.filter(r => r.status === "discrepancy");

  function chooseReview(remittance: FinancialRemittanceDemo) {
    setReviewId(remittance.id);
    setCounted((remittance.totalCentavos / 100).toFixed(2));
    setVerifiedCollectionIds([]);
    setCuriaOfficer("Curia Cashier (demo)");
    setCuriaRef("");
    setReason("");
    setNotice(null);
  }

  return <div className="space-y-6">
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#890022]">{mode === "cowl" ? "COWL collection desk" : "Curia verification desk"} · Phase 3</p>
      <h2 className={ebGaramond.className + " mt-2 text-[34px] font-medium"}>
        {mode === "cowl" ? "Collections & Remittance Turnover" : "Independent Remittance Reconciliation"}
      </h2>
      <p className="mt-2 max-w-[900px] text-sm leading-6 text-[#6F6265]">
        {mode === "cowl"
          ? "Simulate entering one collection against an available Curia-preprinted receipt, then grouping selected collections and their paper duplicates into a remittance."
          : "Review the mock COWL remittances, compare counted funds and receipt duplicates, and simulate an independent Curia acknowledgment or discrepancy."}
      </p>
    </div>
    <div role="note" className="border-l-4 border-[#890022] bg-[#F8EDEF] px-4 py-3 text-sm leading-6 text-[#4D343A]">
      <strong>Not operational.</strong> All Phase 3 collections, remittances, acknowledgment references and personnel are fictional. Actions stay in browser-local storage and are shared only between COWL and Curia test pages on the same preview domain and browser. No real payment, receipt, registration renewal, official acknowledgment or Supabase database record is created.
    </div>
    {notice && <div role="status" className={"border px-4 py-3 text-sm " + (notice.ok ? "border-[#B8DCD3] bg-[#ECF8F3] text-[#145747]" : "border-[#E7BABF] bg-[#FFF2F3] text-[#922A38]")}>{notice.message}</div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ["Phase 3 collections", String(collections.length), "Newly simulated collection entries"],
        ["Held by COWL", money(notRemitted.reduce((sum, c) => sum + c.amountCentavos, 0)), "Not yet included in a remittance"],
        ["Pending Curia review", money(pending.reduce((sum, r) => sum + r.totalCentavos, 0)), String(pending.length) + " remittance(s)"],
        ["Curia confirmed", money(confirmed.reduce((sum, r) => sum + r.totalCentavos, 0)), discrepancies.length + " discrepancy record(s)"],
      ].map(([title, value, info]) => <div key={title} className="border border-[#E6DADC] bg-white p-4">
        <p className="text-xs font-semibold text-[#6F6265]">{title}</p>
        <p className="mt-2 break-words text-[25px] font-semibold tabular-nums">{value}</p>
        <p className="mt-2 text-xs leading-5 text-[#706268]">{info}</p>
      </div>)}
    </div>

    {mode === "cowl" && <>
      <section className="border border-[#E6DADC] bg-white p-5 sm:p-6">
        <div className="flex items-center gap-2"><HandCoins className="h-5 w-5 text-[#890022]" /><h3 className={ebGaramond.className + " text-[28px]"}>1. Record a sample collection</h3></div>
        <p className="mt-2 text-xs leading-5 text-[#6F6265]">Only available serials from booklets already acknowledged by COWL are selectable. Official receipt numbers are never auto-generated.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="phase3-booklet" className={LABEL}>Curia-supplied booklet in COWL custody</label>
            <select id="phase3-booklet" className={INPUT} value={activeBooklet?.id || ""}
              onChange={event => { setBookletId(event.target.value); setSerial(""); }}>
              {!acknowledgedBooklets.length && <option value="">No acknowledged booklets</option>}
              {acknowledgedBooklets.map(b => <option key={b.id} value={b.id}>{b.id} · {b.first}–{b.last}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="phase3-serial" className={LABEL}>Preprinted official receipt number</label>
            <select id="phase3-serial" className={INPUT} value={available.includes(serial) ? serial : ""}
              onChange={event => setSerial(event.target.value)}>
              <option value="">Select unused serial</option>
              {available.map(n => <option value={n} key={n}>{n}</option>)}
            </select>
            <p className="mt-1 text-xs text-[#6F6265]">{available.length} unused serial(s) available in selected booklet</p>
          </div>
          <div className="min-w-0">
            <label htmlFor="phase3-parish" className={LABEL}>Paying parish (official registry name)</label>
            <Popover open={parishOpen} onOpenChange={setParishOpen}>
              <PopoverTrigger asChild>
                <button id="phase3-parish" type="button" role="combobox" aria-expanded={parishOpen}
                  className="flex min-h-11 w-full min-w-0 items-center justify-between gap-2 border border-[#CDBFC3] bg-white px-3 py-2 text-left text-sm outline-none focus-visible:border-[#890022] focus-visible:ring-1 focus-visible:ring-[#890022]">
                  <span className="truncate">{parish || "Search for parish..."}</span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 text-[#706268]" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[min(90vw,430px)] rounded-none border-[#CDBFC3] p-0">
                <Command>
                  <CommandInput placeholder="Search parish or mission station..." />
                  <CommandList className="max-h-[250px]">
                    <CommandEmpty>No matching registered parish.</CommandEmpty>
                    <CommandGroup>
                      {[...PARISHES].sort((a, b) => a.localeCompare(b)).map(p => <CommandItem key={p} value={p}
                        onSelect={() => { setParish(p); setParishOpen(false); }} className="cursor-pointer gap-2 py-2">
                        <Check className={parish === p ? "h-4 w-4 shrink-0 text-[#0B5C5A]" : "h-4 w-4 shrink-0 opacity-0"} />
                        <span className="whitespace-normal text-sm">{p}</span>
                      </CommandItem>)}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <label htmlFor="phase3-ministry" className={LABEL}>Linked COWL-DOK ministry</label>
            <select id="phase3-ministry" value={ministry} onChange={event => setMinistry(event.target.value)} className={INPUT}>
              {MINISTRIES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <Field id="phase3-parish-paper" label="Received from (exact paper wording)" value={parishPrinted} onChange={setParishPrinted} />
          <Field id="phase3-ministry-paper" label="Ministry as written on the receipt" value={ministryPrinted} onChange={setMinistryPrinted} />
          <Field id="phase3-year" label="Renewal year" value={renewalYear} onChange={setRenewalYear} />
          <Field id="phase3-date" label="Receipt / collection date" type="date" value={date} onChange={setDate} />
          <Field id="phase3-participants" label="Number of participants" value={participants} onChange={setParticipants} />
          <Field id="phase3-fee" label="Fee per participant (PHP)" value={fee} onChange={setFee}
            note="₱50.00 is an example from the supplied receipt, not an approved fee schedule." />
          <Field id="phase3-received" label="Amount physically received (PHP)" value={received} onChange={setReceived} />
          <div className="min-w-0">
            <label htmlFor="phase3-payment-method" className={LABEL}>Payment method (demo)</label>
            <select id="phase3-payment-method" className={INPUT} value={method} onChange={event => setMethod(event.target.value as "cash" | "check" | "other")}>
              <option value="cash">Cash</option><option value="check">Check</option><option value="other">Other</option>
            </select>
          </div>
          <Field id="phase3-purpose" label="Purpose / nature of payment" value={purpose} onChange={setPurpose} />
          <Field id="phase3-code" label="CODE printed on paper (if any)" value={printedCode} onChange={setPrintedCode}
            note="Do not assign accounting meaning until Curia confirms the code." />
          <div className="sm:col-span-2"><Field id="phase3-collected-by" label="COWL officer recording the collection" value={collectedBy} onChange={setCollectedBy} /></div>
        </div>
        <div className={"mt-5 flex flex-wrap items-center gap-3 border px-4 py-3 text-sm " +
          (amountMatches ? "border-[#B8DCD3] bg-[#EFF9F4] text-[#145747]" : "border-[#E8D6A9] bg-[#FFF9EC] text-[#805C16]")}>
          {amountMatches ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
          <span>Calculated: <strong>{computed === null ? FORM_PLACEHOLDER : money(computed)}</strong> · Recorded amount: <strong>{receivedCentavos === null ? FORM_PLACEHOLDER : money(receivedCentavos)}</strong>.
            {amountMatches ? " The example breakdown reconciles." : " Correct the difference before continuing."}</span>
        </div>
        <button type="button" className={PRIMARY + " mt-4"} disabled={!eligibleCollection} onClick={() => {
          if (!activeBooklet || !serial || count === null || feeCentavos === null || receivedCentavos === null) return;
          const result = recordCollection({
            bookletId: activeBooklet.id, serial, parish, parishPrinted, ministry, ministryPrinted,
            renewalYear, date, participants: count, feeCentavos,
            amountCentavos: receivedCentavos, purpose, printedCode, paymentMethod: method, collectedBy,
          });
          handle(result, "Sample collection recorded and receipt " + serial + " marked issued in the shared browser ledger.");
          if (result.ok) setSerial("");
        }}>
          <ReceiptText className="h-4 w-4" /> Simulate collection + receipt usage
        </button>
      </section>

      <section className="border border-[#E6DADC] bg-white p-5 sm:p-6">
        <div className="flex items-center gap-2"><ArrowLeftRight className="h-5 w-5 text-[#890022]" /><h3 className={ebGaramond.className + " text-[28px]"}>2. Prepare remittance to Curia</h3></div>
        <p className="mt-2 text-sm leading-6 text-[#6F6265]">Choose collections not already included in another remittance. The prepared statement lists exact official receipt numbers, totals and expected duplicate copies.</p>
        {notRemitted.length ? <div className="mt-4 space-y-2">{notRemitted.map(c => <label key={c.id} className="flex cursor-pointer items-start gap-3 border border-[#E6DADC] bg-white px-3 py-3 hover:bg-[#FFF8F9]">
          <input className="mt-1 h-4 w-4 accent-[#890022]" type="checkbox" checked={selectedCollectionIds.includes(c.id)}
            onChange={event => setSelectedCollectionIds(ids => event.target.checked ? [...ids, c.id] : ids.filter(id => id !== c.id))} />
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{c.id} · OR {c.serial} · {money(c.amountCentavos)}</span>
            <span className="mt-1 block text-xs leading-5 text-[#6F6265]">{c.parish} · {c.ministry}</span></span>
        </label>)}</div> : <p className="mt-4 border border-[#E6DADC] bg-[#FBF9F9] p-4 text-sm text-[#6F6265]">No unremitted Phase 3 collections. Record a sample collection above first.</p>}
        <div className="mt-4 grid gap-3 border border-[#E6DADC] bg-[#FBF9F9] p-4 sm:grid-cols-3">
          <div><p className="text-xs text-[#6F6265]">Selected collections</p><p className="mt-1 text-xl font-semibold">{validSelected.length}</p></div>
          <div><p className="text-xs text-[#6F6265]">Expected paper duplicates</p><p className="mt-1 text-xl font-semibold">{validSelected.length}</p></div>
          <div><p className="text-xs text-[#6F6265]">Declared remittance amount</p><p className="mt-1 text-xl font-semibold tabular-nums">{money(selectedTotal)}</p></div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field id="phase3-preparer" label="COWL officer preparing turnover" value={preparedBy} onChange={setPreparedBy} />
          <Field id="phase3-submitted-date" label="Handover date" type="date" value={submittedDate} onChange={setSubmittedDate} />
        </div>
        <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm leading-6">
          <input type="checkbox" checked={copiesChecked} onChange={event => setCopiesChecked(event.target.checked)}
            className="mt-1 h-4 w-4 accent-[#890022]" />
          <span>I verified the <strong>{validSelected.length}</strong> physical duplicate receipt copies to be included with this mock handover. This is a demo attestation, not actual delivery.</span>
        </label>
        <button type="button" className={PRIMARY + " mt-4"} disabled={!storageReady || !validSelected.length || !copiesChecked}
          onClick={() => {
            const result = submitRemittance({ collectionIds: validSelected, preparedBy, date: submittedDate, copiesChecked });
            handle(result, "Remittance prepared in the shared mock ledger. Curia can now perform an independent verification.");
            if (result.ok) { setSelectedCollectionIds([]); setCopiesChecked(false); }
          }}>
          <FileCheck2 className="h-4 w-4" /> Simulate turnover to Curia
        </button>
      </section>
    </>}

    <section className="border border-[#E6DADC] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className={ebGaramond.className + " text-[28px]"}>{mode === "curia" ? "3. Curia receiving and reconciliation desk" : "3. Curia remittance status"}</h3>
          <p className="mt-1 text-xs leading-5 text-[#6F6265]">{mode === "curia" ? "Review one submitted handover, independently count the money and check each physical duplicate copy." : "Follow the simulated acknowledgments recorded by Curia in this browser."}</p></div>
        {mode === "cowl" ? <Link href="/curia" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#0B5C5A] underline underline-offset-4">
          <Landmark className="h-4 w-4" /> Open Curia Portal
        </Link> : <Link href="/admin/financial-stewardship-preview" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#0B5C5A] underline underline-offset-4">
          <HandCoins className="h-4 w-4" /> Open COWL Portal
        </Link>}
      </div>
      {!remittances.length && <p className="mt-5 border border-[#E6DADC] bg-[#FBF9F9] p-4 text-sm text-[#6F6265]">
        No Phase 3 remittances yet. Use the COWL workflow to record a sample collection and submit a mock turnover.
      </p>}
      {!!remittances.length && <>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {[...remittances].reverse().map(r => <button key={r.id} type="button" onClick={() => chooseReview(r)}
            className={"border p-4 text-left hover:border-[#890022] " + (selectedRemittance?.id === r.id ? "border-[#890022] bg-[#FFF8F9]" : "border-[#E6DADC]")}>
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{r.id}</span><Pill status={r.status} /></div>
            <p className="mt-2 text-lg font-semibold tabular-nums">{money(r.totalCentavos)}</p>
            <p className="mt-1 text-xs text-[#6F6265]">{r.collectionIds.length} receipt(s) · submitted {r.submittedDate}</p>
          </button>)}
        </div>
        {selectedRemittance && <div className="mt-5 space-y-5 border-t border-[#E6DADC] pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-lg font-semibold">{selectedRemittance.id}</h4><Pill status={selectedRemittance.status} /></div>
          <dl className="grid gap-3 sm:grid-cols-3">
            {[
              ["COWL declared", money(selectedRemittance.totalCentavos)],
              ["Physical duplicate copies expected", String(selectedRemittance.duplicateCount)],
              ["COWL preparing officer", selectedRemittance.preparedBy],
            ].map(([label, value]) => <div className="bg-[#FBF9F9] p-3" key={label}>
              <dt className="text-xs text-[#6F6265]">{label}</dt><dd className="mt-1 text-sm font-semibold">{value}</dd>
            </div>)}
          </dl>

          <div>
            <p className="text-sm font-semibold">{mode === "curia" ? "Inspect each original receipt reference and physical duplicate" : "Receipt-by-receipt turnover statement"}</p>
            <div className="mt-3 space-y-2">
              {selectedRemittance.collectionIds.map(id => {
                const c = collections.find(item => item.id === id);
                if (!c) return <p key={id} className="text-sm text-[#922A38]">Missing mock collection {id}; reconciliation cannot be confirmed.</p>;
                const checked = auditedIds.includes(id);
                return <div key={id} className="border border-[#E6DADC] p-3">
                  <div className="flex gap-3">
                    {mode === "curia" && selectedRemittance.status === "pending" && <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[#890022]"
                      aria-label={"Physical duplicate checked for OR " + c.serial}
                      checked={checked} onChange={event => setVerifiedCollectionIds(ids =>
                        event.target.checked ? [...ids, id] : ids.filter(value => value !== id))} />}
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap justify-between gap-2 text-sm font-semibold"><span>{id} · OR {c.serial}</span><span className="tabular-nums">{money(c.amountCentavos)}</span></p>
                      <p className="mt-1 text-xs leading-5 text-[#6F6265]">{c.parish} · {c.ministry}</p>
                      <p className="mt-1 text-xs leading-5 text-[#6F6265]">{c.participants} × {money(c.feeCentavos)} · {c.date} · Booklet {c.bookletId}</p>
                      <p className="mt-1 text-xs leading-5 text-[#6F6265]">Printed payer: {c.parishPrinted || FORM_PLACEHOLDER} · CODE: {c.printedCode || "Not specified"}</p>
                    </div>
                  </div>
                </div>;
              })}
            </div>
          </div>
          {mode === "curia" && selectedRemittance.status === "pending" && <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="phase3-counted" label="Actual funds counted by Curia (PHP)" value={counted} onChange={setCounted} />
              <Field id="phase3-curia-officer" label="Curia receiving officer (demo)" value={curiaOfficer} onChange={setCuriaOfficer} />
              <Field id="phase3-curia-date" label="Date of independent review" value={reviewDate} type="date" onChange={setReviewDate} />
              <Field id="phase3-curia-reference" label="Curia acknowledgment reference" value={curiaRef} onChange={setCuriaRef}
                note="Required for full confirmation. Separate from the official receipt numbers." />
            </div>
            <div className={"border p-3 text-sm " + (canConfirm ? "border-[#B8DCD3] bg-[#ECF8F3] text-[#145747]" : "border-[#E8D6A9] bg-[#FFF9EC] text-[#805C16]")}>
              Counted {parsedCounted === null ? FORM_PLACEHOLDER : money(parsedCounted)} against {money(selectedRemittance.totalCentavos)} declared ·
              {auditedIds.length} of {selectedRemittance.duplicateCount} duplicates verified. Complete all checks for acknowledgment.
            </div>
            <button type="button" className={PRIMARY} disabled={!storageReady || !canConfirm} onClick={() => {
              const result = reviewRemittance({
                id: selectedRemittance.id, countedCentavos: parsedCounted ?? 0,
                verifiedCollectionIds: auditedIds, officer: curiaOfficer, reference: curiaRef,
                reviewedDate: reviewDate, outcome: "confirmed", reason: "",
              });
              handle(result, "Curia confirmation simulated. The same acknowledgment is visible on COWL's Phase 3 tab.");
            }}><CheckCircle2 className="h-4 w-4" /> Simulate Curia acknowledgment</button>
            <div className="border-t border-[#E6DADC] pt-5">
              <label htmlFor="phase3-discrepancy" className={LABEL}>If the amount or receipt copies differ, describe the discrepancy</label>
              <textarea id="phase3-discrepancy" value={reason} onChange={event => setReason(event.target.value)}
                rows={3} className="w-full border border-[#CDBFC3] bg-white p-3 text-sm outline-none focus:border-[#890022]"
                placeholder="Describe missing duplicates, a counted shortage, or other handover issues (minimum 10 characters)..." />
              <button type="button" className={NEUTRAL + " mt-3"} disabled={!storageReady || !canFlag}
                onClick={() => {
                  const result = reviewRemittance({
                    id: selectedRemittance.id, countedCentavos: parsedCounted ?? 0,
                    verifiedCollectionIds: auditedIds, officer: curiaOfficer, reference: curiaRef,
                    reviewedDate: reviewDate, outcome: "discrepancy", reason,
                  });
                  handle(result, "Discrepancy recorded in the mock ledger. Remittance is NOT confirmed.");
                }}><AlertTriangle className="h-4 w-4" /> Simulate discrepancy instead</button>
            </div>
          </>}
          {selectedRemittance.status !== "pending" && <div className="border border-[#E6DADC] bg-[#FBF9F9] p-4">
            <h5 className="font-semibold">{selectedRemittance.status === "confirmed" ? "Curia acknowledgment recorded" : "Curia discrepancy recorded"}</h5>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              {[
                ["Curia counted", selectedRemittance.curiaCountCentavos === undefined ? FORM_PLACEHOLDER : money(selectedRemittance.curiaCountCentavos)],
                ["Duplicates checked", (selectedRemittance.verifiedCollectionIds?.length || 0) + " of " + selectedRemittance.duplicateCount],
                ["Receiving officer", selectedRemittance.curiaOfficer || FORM_PLACEHOLDER],
                ["Acknowledgment reference", selectedRemittance.curiaReference || "Not recorded"],
                ["Reviewed date", selectedRemittance.reviewedDate || FORM_PLACEHOLDER],
                ...(selectedRemittance.discrepancyReason ? [["Discrepancy reason", selectedRemittance.discrepancyReason]] : []),
              ].map(([key, value]) => <div key={key}><dt className="text-xs text-[#6F6265]">{key}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}
            </dl>
          </div>}
        </div>}
      </>}
    </section>
    <p className="text-xs leading-5 text-[#6F6265]">
      The existing older financial dashboard and Curia Incoming Remittances tab contain separate fictional historical examples. Only new Phase 3 collections and remittances are synchronized across these two Phase 3 demo views. No actual Curia account verification or multiuser approval is in place.
    </p>
  </div>;
}
