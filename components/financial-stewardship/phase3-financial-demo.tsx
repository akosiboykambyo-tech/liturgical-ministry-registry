"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowLeftRight, Check, CheckCircle2, ChevronsUpDown,
  ClipboardCheck, FileCheck2, HandCoins, Landmark, ReceiptText, Search,
} from "lucide-react";
import { ebGaramond } from "@/app/fonts";
import { MINISTRIES, PARISHES } from "@/lib/constants";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { parsePesoAmountToCentavos } from "@/lib/financial-stewardship-receipt-preview";
import {
  checkPrintedReceiptSerial, serialsInBooklet, serialState, useReceiptBookletDemo,
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
function readableDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Select a valid date";
  const date = new Date(value + "T12:00:00Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "Select a valid date";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

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

  // The clerk starts from the number physically printed on the receipt.
  // Booklet identity and availability are DERIVED; neither is auto-selected.
  const [serial, setSerial] = useState("");
  const [serialOpen, setSerialOpen] = useState(false);
  const [serialActiveIndex, setSerialActiveIndex] = useState(-1);
  const [serialPhysicallyChecked, setSerialPhysicallyChecked] = useState(false);
  const serialCheck = useMemo(() => checkPrintedReceiptSerial(booklets, serial), [booklets, serial]);
  const availableBookletGroups = useMemo(() => booklets
    .filter(booklet => booklet.state === "cowl_custody")
    .map(booklet => ({
      booklet,
      serials: serialsInBooklet(booklet).filter(value => serialState(booklet, value) === "available"),
    }))
    .filter(group => group.serials.length > 0), [booklets]);
  const suggestionGroups = availableBookletGroups.map(group => ({
    booklet: group.booklet,
    serials: group.serials.filter(value => value.includes(serial.trim())),
  })).filter(group => group.serials.length > 0);
  const serialSuggestions = suggestionGroups.flatMap(group =>
    group.serials.map(value => ({ serial: value, bookletId: group.booklet.id })));
  const serialStatus = (() => {
    const b = serialCheck.booklet;
    switch (serialCheck.status) {
      case "empty": return "Enter the number exactly as printed, including leading zeros. No serial has been selected.";
      case "invalid": return "Use the complete printed numeric serial (4–12 digits), without spaces or punctuation. Preserve leading zeros.";
      case "outside_range": return "Outside any registered receipt booklet range. Check the printed digits and leading zeros.";
      case "ambiguous": return "This serial exists in multiple booklet series. Ask Curia to identify the correct series before recording.";
      case "not_in_custody": return b?.state === "awaiting_cowl_ack"
        ? "Not in COWL custody: booklet handover has not yet been acknowledged."
        : "Not in COWL custody: this booklet is still held by Curia.";
      case "already_used": {
        const existing = b?.usage.find(value => value.serial === serial);
        return "Already used" + (existing ? " — linked to " + existing.collectionRef : "") + ". This serial cannot be recorded again.";
      }
      case "voided": return "Voided receipt. This printed number cannot be reused.";
      case "missing": return "Reported missing. This printed number cannot be used.";
      case "available": return "Available in acknowledged COWL custody. Confirm it matches the physical paper before recording.";
    }
  })();
  function chooseSerial(next: string) {
    setSerial(next);
    setSerialPhysicallyChecked(false);
    setSerialOpen(false);
    setSerialActiveIndex(-1);
  }
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
  const eligibleCollection = storageReady && serialCheck.status === "available" && serialPhysicallyChecked && amountMatches &&
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
        <p className="mt-2 text-xs leading-5 text-[#6F6265]">Start with the exact number printed on the physical receipt. The assigned booklet is identified automatically; no serial number is generated or preselected.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="phase3-serial" className={LABEL}>Official receipt serial number — as printed on paper</label>
            <div className="relative" onBlur={event => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSerialOpen(false);
            }}>
              <div className="relative flex">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[#7A666C]" />
                <input id="phase3-serial" type="text" inputMode="numeric" autoComplete="off"
                  spellCheck={false} maxLength={16} role="combobox" aria-autocomplete="list"
                  aria-controls="phase3-serial-options" aria-expanded={serialOpen}
                  aria-activedescendant={serialOpen && serialActiveIndex >= 0 ? "phase3-suggestion-" + serialActiveIndex : undefined}
                  aria-describedby="phase3-serial-status"
                  placeholder="Type printed serial, e.g. 000123"
                  value={serial}
                  onFocus={() => setSerialOpen(true)}
                  onChange={event => {
                    setSerial(event.target.value);
                    setSerialPhysicallyChecked(false);
                    setSerialActiveIndex(-1);
                    setSerialOpen(true);
                  }}
                  onKeyDown={event => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault(); setSerialOpen(true);
                      setSerialActiveIndex(index => Math.min(index + 1, serialSuggestions.length - 1));
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault(); setSerialOpen(true);
                      setSerialActiveIndex(index => Math.max(0, index - 1));
                    } else if (event.key === "Enter") {
                      event.preventDefault();
                      if (serialOpen && serialActiveIndex >= 0 && serialSuggestions[serialActiveIndex]) {
                        chooseSerial(serialSuggestions[serialActiveIndex].serial);
                      } else setSerialOpen(false);
                    } else if (event.key === "Escape") {
                      event.preventDefault(); setSerialOpen(false); setSerialActiveIndex(-1);
                    }
                  }}
                  className="h-12 w-full min-w-0 border border-[#CDBFC3] bg-white pl-10 pr-12 font-mono text-base tracking-wide text-[#1E1114] outline-none focus:border-[#890022] focus:ring-1 focus:ring-[#890022]"
                />
                <button type="button" aria-label={serialOpen ? "Close available serial suggestions" : "Show available serial suggestions"}
                  aria-expanded={serialOpen} onClick={() => { setSerialOpen(value => !value); setSerialActiveIndex(-1); }}
                  className="absolute right-0 top-0 flex h-12 w-11 items-center justify-center border-l border-[#E6DADC] text-[#6F6265] hover:bg-[#FBF9F9]">
                  <ChevronsUpDown className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              {serialOpen && <div id="phase3-serial-options" role="listbox" aria-label="Available official receipt numbers"
                className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto border border-[#D8C7CB] bg-white py-1 shadow-lg">
                {!serialSuggestions.length && <p className="px-3 py-3 text-sm text-[#6F6265]">
                  {availableBookletGroups.length
                    ? "No unused matching serials. Check the validation message below for this printed number."
                    : "No available receipt numbers in acknowledged COWL custody."}
                </p>}
                {suggestionGroups.map(group => <div key={group.booklet.id} role="group" aria-label={"Booklet " + group.booklet.id}>
                  {availableBookletGroups.length > 1 && <p className="sticky top-0 border-y border-[#F0E8EA] bg-[#FBF9F9] px-3 py-2 text-xs font-bold text-[#76525C]">
                    Booklet {group.booklet.id} · {group.booklet.first}–{group.booklet.last}
                  </p>}
                  {group.serials.map(value => {
                    const index = serialSuggestions.findIndex(item => item.serial === value && item.bookletId === group.booklet.id);
                    return <button type="button" key={value} id={"phase3-suggestion-" + index} role="option"
                      aria-selected={serial === value} onMouseEnter={() => setSerialActiveIndex(index)}
                      onClick={() => chooseSerial(value)}
                      className={"flex min-h-10 w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[#F6EDEF] " +
                        (index === serialActiveIndex ? "bg-[#F6EDEF] text-[#890022]" : "text-[#1E1114]")}>
                      <span className="font-mono font-semibold tracking-wide">{value}</span>
                      {availableBookletGroups.length === 1 && <span className="text-xs text-[#6F6265]">Booklet {group.booklet.id}</span>}
                      {serial === value && <Check className="h-4 w-4 shrink-0 text-[#0B5C5A]" aria-hidden="true" />}
                    </button>;
                  })}
                </div>)}
              </div>}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-[#6F6265]">Booklet (derived)</span>
              <span className={"inline-flex items-center border px-3 py-1 text-xs font-semibold " +
                (serialCheck.booklet ? "border-[#CAD7D2] bg-[#EFF6F3] text-[#24564C]" : "border-[#E6DADC] bg-[#FBF9F9] text-[#706268]")}>
                {serialCheck.booklet ? serialCheck.booklet.id : "Not identified"}
              </span>
              {serialCheck.booklet && <span className="text-xs text-[#6F6265]">Range: {serialCheck.booklet.first}–{serialCheck.booklet.last}</span>}
            </div>
            <div id="phase3-serial-status" role="status"
              className={"mt-2 flex items-start gap-2 border px-3 py-2.5 text-sm leading-5 " +
                (serialCheck.status === "available" ? "border-[#B8DCD3] bg-[#EFF9F4] text-[#145747]" :
                  serialCheck.status === "empty" ? "border-[#E6DADC] bg-[#FBF9F9] text-[#6F6265]" :
                  "border-[#E8C7AC] bg-[#FFF7EB] text-[#854916]")}>
              {serialCheck.status === "available" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> :
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
              <div>
                <strong>{serialCheck.status === "available" ? "Available" :
                  serialCheck.status === "already_used" ? "Already used" :
                  serialCheck.status === "not_in_custody" ? "Not in custody" :
                  serialCheck.status === "outside_range" ? "Outside acknowledged range" :
                  serialCheck.status === "invalid" ? "Incomplete or invalid number" :
                  serialCheck.status === "ambiguous" ? "Ambiguous serial" :
                  serialCheck.status === "voided" ? "Voided" :
                  serialCheck.status === "missing" ? "Missing" : "Awaiting printed serial"}:</strong> {serialStatus}
              </div>
            </div>
            <p className="mt-2 text-xs leading-5 text-[#6F6265]">
              {availableBookletGroups.length === 1
                ? "Unused numbers belong to " + availableBookletGroups[0].booklet.id + "; no separate booklet selection needed."
                : availableBookletGroups.length > 1
                  ? "Unused numbers are grouped by " + availableBookletGroups.length + " acknowledged COWL booklets."
                  : "There are no unused serials in a COWL-acknowledged booklet. Resolve booklet custody in Phase 2 first."}
            </p>
            <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm leading-5">
              <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#890022]"
                checked={serialPhysicallyChecked} disabled={serialCheck.status !== "available"}
                onChange={event => setSerialPhysicallyChecked(event.target.checked)} />
              <span>I checked that <strong>OR {serial || "—"}</strong> matches the physical paper receipt. The demo will not choose the next available number for me.</span>
            </label>
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
