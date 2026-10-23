"use client";

import { useMemo, useState } from "react";
import { ArrowRight, ClipboardCheck, RotateCcw, Search, ShieldAlert } from "lucide-react";
import { ebGaramond } from "@/app/fonts";
import {
  filterReviewQueue,
  previewQueueDecision,
  summarizeReviewQueue,
  type ReviewQueueCase,
} from "@/lib/duplicate-review-queue";
import type { ReviewDecision } from "@/lib/duplicate-review-plan";

const seed: ReviewQueueCase[] = [
  {
    id: "DEMO-001",
    createdAt: "2026-10-22T08:00:00Z",
    status: "open",
    incoming: { parish: "Sample Parish A", ministries: ["Ministry of Liturgical Music"] },
    candidate: {
      id: "sample-member-1", uid: "DEMO-UID-001", parish: "Sample Parish A",
      ministries: ["Ministry of Lectors and Commentators"],
    },
  },
  {
    id: "DEMO-002",
    createdAt: "2026-10-21T08:00:00Z",
    status: "open",
    incoming: { parish: "Sample Parish B", ministries: ["Extraordinary Ministers of Holy Communion"] },
    candidate: {
      id: "sample-member-2", uid: "DEMO-UID-002", parish: "Sample Parish A",
      ministries: ["Extraordinary Ministers of Holy Communion"],
    },
  },
  {
    id: "DEMO-003",
    createdAt: "2026-10-20T08:00:00Z",
    status: "open",
    incoming: { parish: "Sample Parish C", ministries: ["Ministry of Greeters and Collectors"] },
    candidate: null,
  },
];

const decisions: { value: ReviewDecision; label: string; help: string }[] = [
  { value: "use_existing", label: "Same person", help: "Keep their existing UID and add any missing ministry." },
  { value: "transfer_parish", label: "Parish transfer", help: "Keep their UID, with the prior parish recorded in the decision plan." },
  { value: "create_distinct", label: "Different person", help: "Plan a new identity with Pending Verification." },
  { value: "discard", label: "Discard entry", help: "Dismiss the incoming record; do not create a member." },
];

const statusClass = {
  open: "bg-[#FFF6E7] text-[#7A4E00]",
  resolved: "bg-[#E8F5F1] text-[#0B5C5A]",
  dismissed: "bg-[#F1EFF0] text-[#5F4A4F]",
};

export default function DuplicateReviewPreviewPage() {
  const [cases, setCases] = useState<ReviewQueueCase[]>(seed);
  const [status, setStatus] = useState<"all" | ReviewQueueCase["status"]>("open");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string>("DEMO-001");
  const [decision, setDecision] = useState<ReviewDecision>("use_existing");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const counts = useMemo(() => summarizeReviewQueue(cases), [cases]);
  const visible = useMemo(() => filterReviewQueue(cases, status, search), [cases, status, search]);
  const active = cases.find((item) => item.id === selected) ?? null;

  function review() {
    if (!active) return;
    const result = previewQueueDecision(active, decision, notes, new Date().toISOString());
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setCases((items) => items.map((item) => item.id === active.id ? result.updated : item));
    setMessage("Preview decision recorded locally in this browser session only. No registry changes were made.");
    setNotes("");
  }

  return (
    <div className="space-y-6 pb-12 text-[#1E1114]">
      <div>
        <h1 className={ebGaramond.className + " text-[42px] leading-none sm:text-[52px]"}>Duplicate Validation Queue</h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-7 text-[#5F4A4F]">
          Review potential identity conflicts before a new UID or ministry assignment is created.
        </p>
      </div>

      <div role="status" className="border-l-4 border-[#890022] bg-[#F8EDF0] px-5 py-4 text-[15px] leading-7">
        <strong>Offline demonstration only.</strong> Every case and UID shown here is fictional.
        Decisions are temporary previews and will disappear when the page reloads.
        This page does not read or write Supabase.
      </div>

      <section aria-label="Queue summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Open", counts.open],
          ["Resolved", counts.resolved],
          ["Dismissed", counts.dismissed],
          ["Total sample cases", counts.total],
        ].map(([label, count]) => (
          <div key={label} className="border border-[#E6DADC] border-t-[3px] border-t-[#890022] bg-white p-4">
            <p className={ebGaramond.className + " text-[40px] leading-none tabular-nums"}>{count}</p>
            <p className="mt-2 text-[14px] font-semibold">{label}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.95fr)]">
        <section className="border border-[#E6DADC] bg-white" aria-labelledby="cases-heading">
          <div className="border-b border-[#E6DADC] p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 id="cases-heading" className={ebGaramond.className + " text-[32px] leading-tight"}>Cases</h2>
              <button onClick={() => { setCases(seed); setSelected("DEMO-001"); setStatus("open"); setSearch(""); setNotes(""); setMessage(null); }} type="button" className="inline-flex min-h-11 items-center gap-2 border border-[#E6DADC] px-3 text-[14px] text-[#890022] hover:bg-[#FBF9F9]"><RotateCcw size={16} /> Reset demo</button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter cases by status">
              {(["open", "resolved", "dismissed", "all"] as const).map((item) => (
                <button key={item} type="button" onClick={() => setStatus(item)} aria-pressed={status === item} className={status === item ? "min-h-10 border border-[#890022] bg-[#890022] px-3 text-[14px] font-semibold capitalize text-white" : "min-h-10 border border-[#E6DADC] bg-white px-3 text-[14px] font-medium capitalize text-[#5F4A4F] hover:border-[#890022]"}>{item}</button>
              ))}
            </div>
            <label htmlFor="queue-search" className="mt-4 block text-[14px] font-semibold">Search cases</label>
            <div className="relative mt-2">
              <Search size={18} className="pointer-events-none absolute left-3 top-3 text-[#5F4A4F]" />
              <input id="queue-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Case ID, ministry, parish or sample UID" className="min-h-11 w-full border border-[#D7CACC] bg-white py-2 pl-10 pr-3 text-[14px] outline-offset-2 focus-visible:outline-[#890022]" />
            </div>
          </div>
          <div className="divide-y divide-[#E6DADC]">
            {visible.length === 0 && <p className="p-5 text-[15px] text-[#5F4A4F]">No cases match this view.</p>}
            {visible.map((item) => (
              <button key={item.id} type="button" onClick={() => { setSelected(item.id); setDecision("use_existing"); setNotes(""); setMessage(null); }} aria-pressed={selected === item.id} className={"flex w-full items-start justify-between gap-3 p-5 text-left hover:bg-[#FBF9F9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#890022] " + (selected === item.id ? "bg-[#F8EDF0]" : "")}>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold">{item.id}</span>
                  <span className="mt-1 block text-[14px] leading-6 text-[#5F4A4F]">{item.incoming.parish}</span>
                  <span className="block text-[14px] leading-6 text-[#5F4A4F]">{item.incoming.ministries.join(", ")}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={"px-2 py-1 text-[13px] font-semibold capitalize " + statusClass[item.status]}>{item.status}</span>
                  <ArrowRight size={17} className="text-[#890022]" />
                </span>
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="review-heading" className="self-start border border-[#E6DADC] border-t-[3px] border-t-[#890022] bg-white p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <ShieldAlert size={22} className="text-[#890022]" />
            <h2 id="review-heading" className={ebGaramond.className + " text-[32px] leading-tight"}>Review Details</h2>
          </div>
          {!active ? <p className="mt-4 text-[15px]">Select a case to review.</p> : (
            <>
              <p className="mt-4 text-[14px] font-semibold text-[#5F4A4F]">{active.id} · {active.status.toUpperCase()}</p>
              <dl className="mt-3 space-y-3 text-[15px]">
                <div><dt className="font-semibold">Incoming parish</dt><dd className="mt-1 text-[#5F4A4F]">{active.incoming.parish}</dd></div>
                <div><dt className="font-semibold">Incoming ministries</dt><dd className="mt-1 text-[#5F4A4F]">{active.incoming.ministries.join(", ")}</dd></div>
                <div><dt className="font-semibold">Possible existing identity</dt><dd className="mt-1 text-[#5F4A4F]">{active.candidate ? active.candidate.uid + " · " + active.candidate.parish : "No matching record in this sample case"}</dd></div>
                {active.candidate && <div><dt className="font-semibold">Existing ministries</dt><dd className="mt-1 text-[#5F4A4F]">{active.candidate.ministries.join(", ") || "None"}</dd></div>}
              </dl>
              {active.status === "open" ? (
                <div className="mt-6 border-t border-[#E6DADC] pt-5">
                  <label htmlFor="review-decision" className="block text-[14px] font-semibold">Review decision</label>
                  <select id="review-decision" value={decision} onChange={(event) => { setDecision(event.target.value as ReviewDecision); setMessage(null); }} className="mt-2 min-h-11 w-full border border-[#D7CACC] bg-white px-3 text-[15px] focus-visible:outline-[#890022]">
                    {decisions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
                  </select>
                  <p className="mt-2 text-[14px] leading-6 text-[#5F4A4F]">{decisions.find((item) => item.value === decision)?.help}</p>
                  <label htmlFor="review-notes" className="mt-5 block text-[14px] font-semibold">Reason for decision <span className="text-[#B00020]">*</span></label>
                  <textarea id="review-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} placeholder="Explain the identity check and why this decision is appropriate..." className="mt-2 w-full border border-[#D7CACC] bg-white p-3 text-[15px] focus-visible:outline-[#890022]" />
                  <p className="mt-1 text-[13px] text-[#5F4A4F]">At least 10 characters required.</p>
                  <button type="button" onClick={review} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 bg-[#970E24] px-4 text-[15px] font-semibold text-white hover:bg-[#890022] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#970E24]">
                    <ClipboardCheck size={18} /> Preview decision
                  </button>
                </div>
              ) : <div className="mt-6 border-t border-[#E6DADC] pt-4">
                <p className="text-[15px] font-semibold text-[#0B5C5A]">Decision preview recorded</p>
                <p className="mt-2 text-[14px] leading-6 text-[#5F4A4F]">{active.resolution?.notes}</p>
                <p className="mt-2 text-[14px] text-[#5F4A4F]">Planned action: {active.resolution?.plan.kind.replaceAll("_", " ")}</p>
              </div>}
              {message && <p role="status" className="mt-4 border-l-4 border-[#890022] bg-[#F8EDF0] p-3 text-[14px] leading-6">{message}</p>}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
