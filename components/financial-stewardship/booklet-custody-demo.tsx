"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BookOpenCheck, CheckCircle2, ClipboardCheck, RotateCcw, ShieldCheck } from "lucide-react";
import { ebGaramond } from "@/app/fonts";
import {
  bookletCounts, rangeSize, serialsInBooklet, serialState, useReceiptBookletDemo,
  type BookletState, type ReceiptBookletDemo, type ReceiptState,
} from "@/lib/financial-stewardship-booklet-demo";

type Mode = "curia" | "cowl";
const FORM_DATE = "2026-11-07";
const control = "h-11 min-w-0 w-full rounded-sm border border-[#CDBFC3] bg-white px-3 text-sm text-[#1E1114] outline-none focus:border-[#890022] focus:ring-1 focus:ring-[#890022]";
const action = "inline-flex min-h-11 items-center justify-center gap-2 rounded-sm px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40";
const primary = action + " bg-[#890022] text-white hover:bg-[#71001C]";
const secondary = action + " border border-[#CEBBC1] bg-white text-[#49363A] hover:bg-[#FBF9F9]";
function stateLabel(state: BookletState) {
  return state === "curia_stock" ? "Held by Curia" : state === "awaiting_cowl_ack" ? "Awaiting COWL acknowledgment" : "COWL custody confirmed";
}
function StatePill({ state }: { state: BookletState }) {
  return <span className={"inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold " +
    (state === "cowl_custody" ? "border-[#B9DDCC] bg-[#EFF9F4] text-[#145747]" : state === "awaiting_cowl_ack" ? "border-[#E8D7A8] bg-[#FFF9EB] text-[#805C16]" : "border-[#E0D5D8] bg-[#F7F3F5] text-[#5F4A4F]")}>
    {stateLabel(state)}
  </span>;
}
function Field({ id, label, value, onChange, placeholder, type = "text" }: {
  id: string; label: string; value: string; onChange: (s: string) => void; placeholder?: string; type?: string;
}) {
  return <label htmlFor={id} className="block min-w-0">
    <span className="mb-1.5 block text-xs font-semibold text-[#5F4A4F]">{label}</span>
    <input id={id} className={control} value={value} type={type} placeholder={placeholder} onChange={event => onChange(event.target.value)} autoComplete="off" />
  </label>;
}
function Status({ value }: { value: ReceiptState }) {
  const cls = value === "issued" ? "text-[#145747]" : value === "available" ? "text-[#5F4A4F]" : "text-[#922A38]";
  return <span className={"text-xs font-semibold capitalize " + cls}>{value}</span>;
}
function BookletTable({ booklet }: { booklet: ReceiptBookletDemo }) {
  const serials = useMemo(() => serialsInBooklet(booklet), [booklet]);
  return <div className="mt-4 max-h-[350px] overflow-auto rounded-sm border border-[#E6DADC]">
    <table className="w-full min-w-[520px] text-left text-sm">
      <thead className="sticky top-0 z-10 bg-[#FBF9F9] text-xs uppercase tracking-wide text-[#6F6265]">
        <tr><th className="px-4 py-3">Preprinted number</th><th className="px-4 py-3">Accountability</th><th className="px-4 py-3">Internal reference / exception</th></tr>
      </thead>
      <tbody className="divide-y divide-[#EEE6E8] bg-white">
        {serials.map(serial => {
          const issue = booklet.usage.find(item => item.serial === serial);
          const exception = booklet.exceptions.find(item => item.serial === serial);
          return <tr key={serial}><td className="px-4 py-3 font-semibold tabular-nums">{serial}</td>
            <td className="px-4 py-3"><Status value={serialState(booklet, serial)} /></td>
            <td className="px-4 py-3 text-xs text-[#6F6265]">{issue?.collectionRef || (exception ? exception.reason : "—")}</td></tr>;
        })}
      </tbody>
    </table>
  </div>;
}

export default function BookletCustodyDemo({ mode }: { mode: Mode }) {
  const { booklets, storageReady, register, assign, acknowledge, issue, flag, reset } = useReceiptBookletDemo();
  const [id, setId] = useState(mode === "curia" ? "CUR-002" : "COWL-001");
  const selected = booklets.find(b => b.id === id) || booklets[0] || null;
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [resetArmed, setResetArmed] = useState(false);

  const [reference, setReference] = useState("CUR-003");
  const [series, setSeries] = useState("Curia sample series");
  const [first, setFirst] = useState("000201");
  const [last, setLast] = useState("000250");
  const [registerOfficer, setRegisterOfficer] = useState("Curia Custodian (demo)");
  const [registerDate, setRegisterDate] = useState(FORM_DATE);

  const [assignTo, setAssignTo] = useState("COWL Secretary (demo)");
  const [assignBy, setAssignBy] = useState("Curia Custodian (demo)");
  const [assignDate, setAssignDate] = useState(FORM_DATE);

  const [receivedBy, setReceivedBy] = useState("COWL Secretary (demo)");
  const [receivedDate, setReceivedDate] = useState(FORM_DATE);
  const [physicallyChecked, setPhysicallyChecked] = useState(false);

  const [useSerial, setUseSerial] = useState("");
  const [collectionRef, setCollectionRef] = useState("COL-DEMO-001");
  const [useOfficer, setUseOfficer] = useState("COWL Collector (demo)");
  const [useDate, setUseDate] = useState(FORM_DATE);

  const [exceptionSerial, setExceptionSerial] = useState("");
  const [exceptionKind, setExceptionKind] = useState<"voided" | "missing">("voided");
  const [exceptionReason, setExceptionReason] = useState("");
  const [exceptionOfficer, setExceptionOfficer] = useState("COWL Custodian (demo)");
  const [exceptionDate, setExceptionDate] = useState(FORM_DATE);

  const totals = useMemo(() => booklets.reduce((sum, booklet) => {
    const count = bookletCounts(booklet);
    return { total: sum.total + count.total, issued: sum.issued + count.issued,
      available: sum.available + count.available, exceptions: sum.exceptions + count.voided + count.missing };
  }, { total: 0, issued: 0, available: 0, exceptions: 0 }), [booklets]);
  const counts = selected ? bookletCounts(selected) : null;
  const available = selected ? serialsInBooklet(selected).filter(s => serialState(selected, s) === "available") : [];
  const handle = (result: { ok: boolean; error?: string }, message: string) => {
    setNotice({ ok: result.ok, text: result.ok ? message : result.error || "Unable to complete the mock action." });
  };

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className={ebGaramond.className + " text-[30px] font-medium"}>Receipt Booklets · Phase 2</h2>
        <p className="mt-2 max-w-[800px] text-sm leading-6 text-[#6F6265]">
          {mode === "curia"
            ? "Register the physical booklet's actual serial range and simulate its turnover to COWL."
            : "Acknowledge receipt of Curia-assigned booklets, review available serials and simulate recording a receipt's use or exception."}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={mode === "curia" ? "/staging/financial-stewardship/curia" : "/staging/financial-stewardship/cowl"}
          className={primary} title="Separate login and isolated Supabase test database required">
          <ShieldCheck className="h-4 w-4" /> Open secure test inventory
        </Link>
      <button type="button" className={secondary} onClick={() => {
        if (!resetArmed) {
          setResetArmed(true);
          setNotice({ ok: false, text: "Resetting will erase ALL browser-local Phase 2 and Phase 3 mock booklets, collections, and remittances. Click Confirm reset to proceed." });
          return;
        }
        const result = reset(); setId(mode === "curia" ? "CUR-002" : "COWL-001");
        setNotice({ ok: result.ok, text: result.ok ? "Phase 2 and Phase 3 mock data reset to the fictional starting inventory." : result.error || "Unable to reset." });
        setPhysicallyChecked(false); setResetArmed(false);
      }}><RotateCcw className="h-4 w-4" /> {resetArmed ? "Confirm reset all mock data" : "Reset Phase 2/3 demos"}</button>
      </div>
    </div>

    <div role="note" className="border-l-4 border-[#890022] bg-[#F8EDEF] px-4 py-3 text-sm leading-6 text-[#4D343A]">
      <strong>Demonstration only.</strong> All booklets below are fictional. Changes are kept in this browser's local storage so the COWL and Curia demos on the <strong>same preview domain and browser</strong> can see the handover. No real receipt stock, Supabase record, or diocesan accounting entry is affected. This is not proof of Curia authorization.
    </div>

    {!storageReady && <p className="text-xs text-[#6F6265]" role="status">Loading mock inventory from this browser...</p>}
    {notice && <div role="status" className={"border px-4 py-3 text-sm " + (notice.ok ? "border-[#B8DCD3] bg-[#ECF8F3] text-[#145747]" : "border-[#E6B6BB] bg-[#FFF1F2] text-[#922A38]")}>{notice.text}</div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ["Preprinted serials in mock inventory", totals.total],
        ["Issued (sample)", totals.issued],
        ["Available / not used", totals.available],
        ["Voided or missing", totals.exceptions],
      ].map(([title, value]) => <div key={String(title)} className="border border-[#E6DADC] bg-white p-4">
        <p className="text-xs font-semibold leading-5 text-[#6F6265]">{title}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      </div>)}
    </div>

    {mode === "curia" && <section className="border border-[#E6DADC] bg-white p-5 sm:p-6">
      <div className="flex items-center gap-2"><BookOpenCheck className="h-5 w-5 text-[#890022]" /><h3 className={ebGaramond.className + " text-[26px]"}>Curia: Register a physical booklet</h3></div>
      <p className="mt-2 text-xs leading-5 text-[#6F6265]">Enter a sample range as printed, not a generated number. For this prototype, ranges contain 4–12 digits and up to 200 serials; ranges cannot overlap within the same series.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field id="booklet-register-id" label="Internal booklet reference" value={reference} onChange={setReference} />
        <Field id="booklet-register-series" label="Curia-identified receipt series" value={series} onChange={setSeries} />
        <Field id="booklet-register-start" label="First printed receipt number" value={first} onChange={setFirst} />
        <Field id="booklet-register-end" label="Last printed receipt number" value={last} onChange={setLast} />
        <Field id="booklet-register-officer" label="Curia registering officer" value={registerOfficer} onChange={setRegisterOfficer} />
        <Field id="booklet-register-date" label="Registration date" type="date" value={registerDate} onChange={setRegisterDate} />
      </div>
      <p className="mt-3 text-xs text-[#6F6265]">
        Range: {rangeSize(first.trim(), last.trim()) === null ? "Invalid or oversized range" : rangeSize(first.trim(), last.trim()) + " physical serials"}
      </p>
      <button className={primary + " mt-4"} disabled={!storageReady} type="button" onClick={() => {
        const result = register({ id: reference, series, first, last, officer: registerOfficer, date: registerDate });
        handle(result, "Mock booklet registered in Curia stock. It is not yet assigned to COWL.");
        if (result.ok) setId(reference.trim());
      }}><BookOpenCheck className="h-4 w-4" /> Register sample booklet</button>
    </section>}

    <section className="border border-[#E6DADC] bg-white p-5 sm:p-6">
      <h3 className={ebGaramond.className + " text-[27px]"}>Booklet inventory and custody</h3>
      <p className="mt-1 text-xs leading-5 text-[#6F6265]">Select a booklet to inspect its assignment, custody and individual preprinted numbers.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {booklets.map(b => {
          const count = bookletCounts(b);
          return <button key={b.id} type="button" onClick={() => { setId(b.id); setNotice(null); setPhysicallyChecked(false); setUseSerial(""); setExceptionSerial(""); }}
            className={"rounded-sm border p-4 text-left transition-colors " + (selected?.id === b.id ? "border-[#890022] bg-[#FFF8F9]" : "border-[#E6DADC] bg-white hover:border-[#C699A4]")}>
            <div className="flex flex-wrap items-start justify-between gap-2"><p className="font-semibold">{b.id}</p><StatePill state={b.state} /></div>
            <p className="mt-2 text-sm font-semibold tabular-nums">{b.first}–{b.last}</p>
            <p className="mt-1 text-xs text-[#6F6265]">Series: {b.series}</p>
            <p className="mt-2 text-xs text-[#6F6265]">{count.available} available · {count.issued} issued · {count.voided} voided · {count.missing} missing</p>
          </button>;
        })}
      </div>

      {selected && counts && <div className="mt-6 space-y-5 border-t border-[#E6DADC] pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#890022]">Selected physical booklet</p>
            <h4 className={ebGaramond.className + " mt-1 text-[29px]"}>{selected.id}: {selected.first}–{selected.last}</h4></div>
          <StatePill state={selected.state} />
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Curia issuing officer", selected.curiaOfficer || "Not assigned"],
            ["Assigned COWL custodian", selected.cowlCustodian || "Not assigned"],
            ["Date issued to COWL", selected.issuedDate || "Not issued"],
            ["Acknowledged by COWL", selected.acknowledgedBy || "Not acknowledged"],
          ].map(([label, value]) => <div key={label} className="bg-[#FBF9F9] p-3"><dt className="text-xs text-[#6F6265]">{label}</dt><dd className="mt-1 text-sm font-semibold">{value}</dd></div>)}
        </dl>

        {mode === "curia" && selected.state === "curia_stock" && <div className="border border-[#E8D7A8] bg-[#FFFDF7] p-4">
          <h4 className="font-semibold">Curia action: Hand over this booklet to COWL</h4>
          <p className="mt-1 text-xs text-[#6F6265]">The next step will require COWL to acknowledge the physical booklet.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Field id="assign-custodian" label="COWL custodian" value={assignTo} onChange={setAssignTo} />
            <Field id="assign-curia-officer" label="Curia issuing officer" value={assignBy} onChange={setAssignBy} />
            <Field id="assign-date" label="Date of physical handover" type="date" value={assignDate} onChange={setAssignDate} />
          </div>
          <button type="button" disabled={!storageReady} className={primary + " mt-4"} onClick={() => handle(assign(selected.id, assignTo, assignBy, assignDate), "Mock booklet released by Curia. COWL acknowledgment is now required.")}>
            <ShieldCheck className="h-4 w-4" /> Simulate Curia handover
          </button>
        </div>}

        {mode === "cowl" && selected.state === "awaiting_cowl_ack" && <div className="border border-[#E8D7A8] bg-[#FFFDF7] p-4">
          <h4 className="font-semibold">COWL action: Acknowledge physical booklet custody</h4>
          <p className="mt-1 text-xs leading-5 text-[#6F6265]">Inspect the paper booklet first. Only acknowledge if its printed first/last numbers and physical count match the Curia handover.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field id="cowl-received-by" label="COWL receiving custodian" value={receivedBy} onChange={setReceivedBy} />
            <Field id="cowl-received-date" label="Date received" value={receivedDate} type="date" onChange={setReceivedDate} />
          </div>
          <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
            <input className="mt-0.5 h-4 w-4 accent-[#890022]" type="checkbox" checked={physicallyChecked} onChange={event => setPhysicallyChecked(event.target.checked)} />
            <span>I verified the physical receipt numbers <strong>{selected.first}–{selected.last}</strong> and counted <strong>{counts.total}</strong> forms. (Demo statement only.)</span>
          </label>
          <button type="button" disabled={!storageReady || !physicallyChecked} className={primary + " mt-4"} onClick={() => {
            const result = acknowledge(selected.id, receivedBy, receivedDate, physicallyChecked);
            handle(result, "COWL has acknowledged physical custody in this browser-only demo.");
            if (result.ok) setPhysicallyChecked(false);
          }}><CheckCircle2 className="h-4 w-4" /> Simulate custody acknowledgment</button>
        </div>}

        {selected.state === "awaiting_cowl_ack" && mode === "curia" && <p className="border border-[#E8D7A8] bg-[#FFF9EB] p-3 text-sm text-[#805C16]">
          Curia recorded the handover. COWL must acknowledge physical receipt before any of these serials can be used.
        </p>}
        {selected.state === "curia_stock" && mode === "cowl" && <p className="border border-[#E6DADC] bg-[#FBF9F9] p-3 text-sm text-[#5F4A4F]">
          This booklet is still held by Curia and is not available for COWL use.
        </p>}

        {mode === "cowl" && selected.state === "cowl_custody" && <div className="grid gap-4 lg:grid-cols-2">
          <section className="border border-[#E6DADC] bg-[#FFFCFD] p-4">
            <h4 className="font-semibold">Record mock receipt usage</h4>
            <p className="mt-1 text-xs leading-5 text-[#6F6265]">Phase 2 demonstrates one-to-one use of available preprinted serials. An actual financial collection cannot be posted here.</p>
            <div className="mt-3 space-y-3">
              <label className="block"><span className="mb-1 block text-xs font-semibold text-[#5F4A4F]">Unused printed receipt serial</span>
                <select className={control} value={available.includes(useSerial) ? useSerial : ""} onChange={event => setUseSerial(event.target.value)}>
                  <option value="">Select available number</option>{available.map(serial => <option key={serial} value={serial}>{serial}</option>)}
                </select>
              </label>
              <Field id="demo-col-ref" label="Fictional collection reference" value={collectionRef} onChange={setCollectionRef} placeholder="COL-DEMO-001" />
              <Field id="demo-col-officer" label="COWL receiving officer" value={useOfficer} onChange={setUseOfficer} />
              <Field id="demo-col-date" label="Date of mock receipt use" type="date" value={useDate} onChange={setUseDate} />
            </div>
            <button type="button" disabled={!storageReady || !available.includes(useSerial)} className={primary + " mt-4"} onClick={() => {
              const result = issue(selected.id, useSerial, collectionRef.trim(), useOfficer, useDate);
              handle(result, "Mock receipt " + useSerial + " linked to " + collectionRef.trim() + ". No payment was received or official receipt issued.");
              if (result.ok) setUseSerial("");
            }}><ClipboardCheck className="h-4 w-4" /> Simulate receipt usage</button>
          </section>

          <section className="border border-[#E6DADC] bg-[#FFFCFD] p-4">
            <h4 className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-[#922A38]" /> Report a mock exception</h4>
            <p className="mt-1 text-xs leading-5 text-[#6F6265]">Void or missing reports are retained in the mock ledger. Physical handling rules still require Curia approval.</p>
            <div className="mt-3 space-y-3">
              <label className="block"><span className="mb-1 block text-xs font-semibold text-[#5F4A4F]">Unused printed receipt serial</span>
                <select className={control} value={available.includes(exceptionSerial) ? exceptionSerial : ""} onChange={event => setExceptionSerial(event.target.value)}>
                  <option value="">Select available number</option>{available.map(serial => <option key={serial} value={serial}>{serial}</option>)}
                </select>
              </label>
              <label className="block"><span className="mb-1 block text-xs font-semibold text-[#5F4A4F]">Exception type</span>
                <select className={control} value={exceptionKind} onChange={event => setExceptionKind(event.target.value as "voided" | "missing")}>
                  <option value="voided">Voided</option><option value="missing">Missing</option>
                </select>
              </label>
              <label className="block"><span className="mb-1 block text-xs font-semibold text-[#5F4A4F]">Required explanation</span>
                <textarea className="min-h-[92px] w-full border border-[#CDBFC3] bg-white p-3 text-sm outline-none focus:border-[#890022]"
                  value={exceptionReason} onChange={event => setExceptionReason(event.target.value)} placeholder="At least 10 characters explaining the issue" />
              </label>
              <Field id="demo-ex-officer" label="COWL reporting officer" value={exceptionOfficer} onChange={setExceptionOfficer} />
              <Field id="demo-ex-date" label="Report date" type="date" value={exceptionDate} onChange={setExceptionDate} />
            </div>
            <button type="button" disabled={!storageReady || !available.includes(exceptionSerial) || exceptionReason.trim().length < 10}
              className={secondary + " mt-4"} onClick={() => {
                const result = flag(selected.id, exceptionSerial, exceptionKind, exceptionReason, exceptionOfficer, exceptionDate);
                handle(result, "Fictional " + exceptionKind + " exception noted for " + exceptionSerial + " in the shared browser demo.");
                if (result.ok) { setExceptionSerial(""); setExceptionReason(""); }
              }}><AlertTriangle className="h-4 w-4" /> Flag mock exception</button>
          </section>
        </div>}

        <section>
          <h4 className="font-semibold">Individual receipt serials · {counts.total} numbered forms</h4>
          <p className="mt-1 text-xs text-[#6F6265]">Status is separate from Curia's eventual verification of the issued receipt duplicate.</p>
          <BookletTable booklet={selected} />
        </section>

        <section>
          <h4 className="font-semibold">Booklet custody events</h4>
          <div className="mt-3 divide-y divide-[#E6DADC] border-y border-[#E6DADC]">
            {[...selected.history].reverse().map((event, i) => <div key={i} className="grid gap-2 py-3 text-sm sm:grid-cols-[130px_1fr]">
              <span className="text-xs text-[#6F6265]">{event.date}</span>
              <div><p className="font-semibold">{event.action}</p><p className="mt-1 text-xs text-[#6F6265]">{event.officer} · {event.detail}</p></div>
            </div>)}
          </div>
        </section>
      </div>}
    </section>
    <p className="text-xs leading-5 text-[#706268]">
      Note: this prototype simulates custody and exceptions locally in your browser. It does not authenticate Curia-specific roles, enforce database uniqueness, reserve real serial numbers, handle real receipt copy returns, or make financial ledger entries.
    </p>
  </div>;
}
