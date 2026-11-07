"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSearch, RotateCcw, ShieldCheck } from "lucide-react";
import { ebGaramond } from "@/app/fonts";
import {
  parsePesoAmountToCentavos, REFERENCE_RECEIPT,
} from "@/lib/financial-stewardship-receipt-preview";

type Draft = {
  serial: string; receiptDate: string; receivedFrom: string;
  ministryOnPaper: string; ministryInRegistry: string;
  renewalYear: string; purpose: string; printedDescription: string;
  participantCount: string; feePesos: string; amountPesos: string;
  printedCode: string; amountInWords: string; paymentMethod: string;
};
const DEFAULT: Draft = {
  serial: REFERENCE_RECEIPT.serial,
  receiptDate: REFERENCE_RECEIPT.receiptDate,
  receivedFrom: REFERENCE_RECEIPT.receivedFrom,
  ministryOnPaper: REFERENCE_RECEIPT.ministryOnPaper,
  ministryInRegistry: REFERENCE_RECEIPT.ministryInRegistry,
  renewalYear: REFERENCE_RECEIPT.renewalYear,
  purpose: REFERENCE_RECEIPT.purpose,
  printedDescription: REFERENCE_RECEIPT.printedDescription,
  participantCount: String(REFERENCE_RECEIPT.participantCount),
  feePesos: (REFERENCE_RECEIPT.feeCentavos / 100).toFixed(2),
  amountPesos: (REFERENCE_RECEIPT.amountCentavos / 100).toFixed(2),
  printedCode: REFERENCE_RECEIPT.printedCode,
  amountInWords: REFERENCE_RECEIPT.amountInWords,
  paymentMethod: "Unconfirmed from photo",
};
const pesos = (cents: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(cents / 100);
const labelCss = "mb-1.5 block text-xs font-semibold text-[#5F4A4F]";
const inputCss = "h-11 w-full min-w-0 border border-[#CDBFC3] bg-white px-3 text-sm text-[#1E1114] outline-none focus:border-[#890022] focus:ring-1 focus:ring-[#890022]";
function Field({
  title, value, onChange, type = "text", note, id, placeholder,
}: {
  title: string; value: string; onChange: (value: string) => void;
  type?: string; note?: string; id: string; placeholder?: string;
}) {
  return <div className="min-w-0">
    <label htmlFor={id} className={labelCss}>{title}</label>
    <input id={id} type={type} value={value} onChange={event => onChange(event.target.value)}
      className={inputCss} placeholder={placeholder} autoComplete="off" />
    {note && <p className="mt-1 text-xs leading-5 text-[#706268]">{note}</p>}
  </div>;
}

export default function ReceiptFormatPreview() {
  const [draft, setDraft] = useState<Draft>(DEFAULT);
  const edit = (field: keyof Draft, value: string) =>
    setDraft(current => ({ ...current, [field]: value }));
  const data = useMemo(() => {
    const participantCount = /^\d{1,6}$/.test(draft.participantCount.trim()) ? Number(draft.participantCount) : null;
    const feeCentavos = parsePesoAmountToCentavos(draft.feePesos);
    const paperCentavos = parsePesoAmountToCentavos(draft.amountPesos);
    const calculated = participantCount === null || feeCentavos === null ? null : participantCount * feeCentavos;
    return {
      participantCount, feeCentavos, paperCentavos, calculated,
      match: calculated !== null && paperCentavos !== null && calculated === paperCentavos,
      serialPresent: draft.serial.trim().length > 0 && draft.serial.length <= 64,
    };
  }, [draft]);

  return <section className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className={ebGaramond.className + " text-[30px] font-medium"}>Preprinted Receipt · Format Review</h2>
        <p className="mt-2 max-w-[800px] text-sm leading-6 text-[#6F6265]">An editable, unsaved transcription of the receipt you provided. Use it to test the fields COWL should record before any accounting integration.</p>
      </div>
      <button type="button" onClick={() => setDraft({ ...DEFAULT })}
        className="inline-flex min-h-10 items-center gap-2 border border-[#CFBEC3] bg-white px-4 text-sm font-semibold text-[#49363A] hover:bg-[#FBF9F9]">
        <RotateCcw className="h-4 w-4" /> Reset to receipt sample
      </button>
    </div>
    <div role="note" className="border-l-4 border-[#0B5C5A] bg-[#EEF6F5] px-4 py-3 text-sm leading-6 text-[#244743]">
      <strong>Reference only:</strong> Serial <strong>057785</strong> comes from your supplied photo; this form does not issue, reserve, validate against Curia inventory, or store that receipt. The photo's cash line is populated, but the payment-method checkbox is not clearly marked.
    </div>

    <div className="grid gap-5 xl:grid-cols-[1.5fr_0.9fr]">
      <div className="space-y-5">
        <section className="border border-[#E6DADC] bg-white p-5 sm:p-6">
          <div className="flex items-center gap-2"><FileSearch className="h-5 w-5 text-[#890022]" /><h3 className={ebGaramond.className + " text-[25px]"}>1. Physical official receipt</h3></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field id="receipt-reference-number" title="Exact printed official receipt no." value={draft.serial} onChange={v => edit("serial", v)}
              note="Text, never a number. Keep leading zeros; no automatic sequence." />
            <Field id="receipt-reference-date" title="Date written on the receipt" type="date" value={draft.receiptDate} onChange={v => edit("receiptDate", v)} />
            <Field id="receipt-reference-from" title="Received from (paying parish)" value={draft.receivedFrom} onChange={v => edit("receivedFrom", v)} />
            <Field id="receipt-reference-year" title="Renewal / service year" value={draft.renewalYear} onChange={v => edit("renewalYear", v)} />
            <div className="sm:col-span-2"><Field id="receipt-reference-ministry-paper" title="Ministry wording as printed / written" value={draft.ministryOnPaper} onChange={v => edit("ministryOnPaper", v)} /></div>
            <div className="sm:col-span-2"><Field id="receipt-reference-ministry-registry" title="Linked COWL-DOK ministry (canonical name)" value={draft.ministryInRegistry} onChange={v => edit("ministryInRegistry", v)}
              note="The example prints 'MINISTRY ON LITURGICAL MUSIC'; the registry uses 'Ministry of Liturgical Music'." /></div>
            <div className="sm:col-span-2"><Field id="receipt-reference-purpose" title="Purpose / nature of payment" value={draft.purpose} onChange={v => edit("purpose", v)} /></div>
            <div className="sm:col-span-2"><Field id="receipt-reference-description" title="Additional details as printed" value={draft.printedDescription} onChange={v => edit("printedDescription", v)} /></div>
            <Field id="receipt-reference-code" title="CODE printed on physical receipt" value={draft.printedCode} onChange={v => edit("printedCode", v)}
              note="Meaning is not yet verified with Curia; do not assign ledger semantics." />
            <div>
              <label htmlFor="receipt-reference-method" className={labelCss}>Payment method (when verified)</label>
              <select id="receipt-reference-method" value={draft.paymentMethod} onChange={event => edit("paymentMethod", event.target.value)} className={inputCss}>
                <option>Unconfirmed from photo</option><option>Cash</option><option>Check</option><option>Other / subject to Curia confirmation</option>
              </select>
            </div>
          </div>
        </section>

        <section className="border border-[#E6DADC] bg-white p-5 sm:p-6">
          <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#890022]" /><h3 className={ebGaramond.className + " text-[25px]"}>2. Solidarity fee breakdown</h3></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <Field id="receipt-reference-participants" title="Number of participants" value={draft.participantCount} onChange={v => edit("participantCount", v)} />
            <Field id="receipt-reference-rate" title="Fee per participant (PHP)" value={draft.feePesos} onChange={v => edit("feePesos", v)} />
            <Field id="receipt-reference-amount" title="Actual amount on receipt (PHP)" value={draft.amountPesos} onChange={v => edit("amountPesos", v)} />
          </div>
          <div className="mt-4"><Field id="receipt-reference-words" title="Amount in words (as written on receipt)" value={draft.amountInWords} onChange={v => edit("amountInWords", v)} note="Transcribed from the paper; the demo does not generate words or validate spelling." /></div>
          <p className="mt-4 text-xs leading-5 text-[#6F6265]">The ₱50.00 rate is taken from this receipt only. It is not yet configured as an approved fee schedule for every ministry or year.</p>
        </section>
      </div>

      <aside className="space-y-4">
        <section className="border border-[#E6DADC] bg-white p-5 sm:p-6 xl:sticky xl:top-5">
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#890022]">Curia-compatible field summary</p>
          <h3 className={ebGaramond.className + " mt-2 text-[30px]"}>Receipt comparison</h3>
          <div className="mt-5 border border-[#E6DADC] bg-[#FBF9F9] p-4">
            <p className="text-xs text-[#706268]">Curia Official Receipt No.</p>
            <p className="mt-1 text-[29px] font-semibold tracking-wider tabular-nums">{draft.serial || "—"}</p>
            <p className="mt-2 text-xs text-[#706268]">Separate from any COWL-DOK collection ID.</p>
          </div>
          <dl className="mt-5 space-y-3 text-sm">
            {[
              ["Received from", draft.receivedFrom || "—"],
              ["Ministry", draft.ministryInRegistry || "—"],
              ["Renewal year", draft.renewalYear || "—"],
              ["Printed CODE", draft.printedCode || "Not specified"],
              ["Payment method", draft.paymentMethod],
            ].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2 border-b border-[#EEE6E8] pb-3"><dt className="text-[#6F6265]">{label}</dt><dd className="max-w-[230px] text-right font-semibold">{value}</dd></div>)}
          </dl>
          <div className="mt-5 border-t border-[#E6DADC] pt-5">
            <p className="text-xs text-[#6F6265]">Calculated amount (participants × fee)</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{data.calculated === null ? "Invalid breakdown" : pesos(data.calculated)}</p>
            <p className="mt-4 text-xs text-[#6F6265]">Amount transcribed from receipt</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{data.paperCentavos === null ? "Invalid amount" : pesos(data.paperCentavos)}</p>
          </div>
          <div className={"mt-5 flex items-start gap-2 border p-3 text-sm " + (data.match && data.serialPresent ? "border-[#C7E2D7] bg-[#EFF9F4] text-[#145747]" : "border-[#EAD3A3] bg-[#FFF9ED] text-[#75511A]")}>
            {data.match && data.serialPresent ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
            <p>{!data.serialPresent ? "Enter the exact printed receipt number." : data.match ? "Breakdown matches the transcribed total. This is not Curia confirmation." : "Participant count, fee and/or transcribed total do not reconcile."}</p>
          </div>
          <p className="mt-4 text-xs leading-5 text-[#706268]">No Save or Issue action exists in Phase 1. Receipt booklet authorization, duplicate-use blocking and data persistence belong to later phases.</p>
        </section>
      </aside>
    </div>
  </section>;
}
