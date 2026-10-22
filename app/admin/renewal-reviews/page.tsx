"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, Loader2, RefreshCw, Search } from "lucide-react";
import { ebGaramond } from "@/app/fonts";
import { listRenewalReviews, resolveRenewalReview,
  type RenewalResolution, type RenewalReviewStatus, type SavedRenewalReview } from "@/lib/renewal-review-queue";

const REASONS: Record<string, string> = {
  multiple_exact_members: "Multiple exact member matches",
  missing_membership: "Member found, ministry assignment missing",
  same_name_different_parish: "Name found in another parish",
  similar_name: "Similar name requires verification",
  duplicate_csv_membership: "Repeated row in renewal CSV",
  unmatched: "No registry member matched",
};
const DECISIONS: { value: RenewalResolution; label: string }[] = [
  { value: "member_verified", label: "Existing member manually verified" },
  { value: "ministry_assignment_verified", label: "Ministry assignment manually verified" },
  { value: "registry_record_corrected", label: "Registry record corrected separately" },
  { value: "csv_row_corrected", label: "Source roster corrected / restage needed" },
  { value: "duplicate_row", label: "Duplicate entry in the source roster" },
  { value: "no_action_required", label: "No registry change required" },
  { value: "other", label: "Other (explain in notes)" },
];

export default function RenewalReviewQueuePage() {
  const [status, setStatus] = useState<RenewalReviewStatus | "all">("open");
  const [items, setItems] = useState<SavedRenewalReview[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SavedRenewalReview | null>(null);
  const [decision, setDecision] = useState<RenewalResolution | "">("");
  const [notes, setNotes] = useState("");
  const [outcome, setOutcome] = useState<"resolved" | "dismissed">("resolved");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setItems(await listRenewalReviews(status)); }
    catch (cause) { setItems([]); setError(cause instanceof Error ? cause.message : "Unable to load review cases."); }
    finally { setLoading(false); }
  }, [status]);
  useEffect(() => { void reload(); }, [reload]);
  const shown = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return items.filter((item) => !q || [
      item.first_name, item.last_name, item.parish, item.ministry,
      item.source_filename, item.reason,
      ...item.candidates.map((candidate) => candidate.uid),
    ].join(" ").toLocaleLowerCase().includes(q));
  }, [items, search]);

  const beginReview = (item: SavedRenewalReview) => {
    setSelected(item); setDecision(""); setNotes(""); setOutcome("resolved");
    setError(null); setNotice(null);
  };
  const submitDecision = async () => {
    if (!selected || !decision || notes.trim().length < 10) {
      setError("Choose a decision and enter an explanation of at least 10 characters.");
      return;
    }
    setSaving(true); setError(null);
    try {
      await resolveRenewalReview(selected, outcome, decision, notes);
      setSelected(null); setNotice("Review decision recorded. No member or ministry assignment was changed.");
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not record the review decision.");
    } finally { setSaving(false); }
  };
  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-14 text-[#24191D]">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#E5D9DC] pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#890022]">Commission Renewal Desk</p>
          <h1 className={`${ebGaramond.className} mt-2 text-4xl`}>Renewal Review Queue</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#66575C]">Saved cases that need a human decision. This queue is separate from duplicate registration merges.</p>
        </div>
        <Link href="/admin/renewal-batches" className="text-sm font-semibold text-[#890022] underline underline-offset-2">Back to Renewal Batches</Link>
      </div>
      <div className="border border-[#DFC7CE] bg-[#F8F1F3] px-4 py-3 text-sm text-[#62313F]">
        Marking a review resolved documents your decision only. To add a missing ministry, correct member details, or process a renewal, use the existing authorized registry tools. Restage a corrected CSV before renewing.
      </div>
      <div className="flex flex-wrap items-end gap-3 border border-[#E2D7DA] bg-white p-4">
        <label className="min-w-44 flex-1 space-y-1.5">
          <span className="text-xs font-semibold">Case status</span>
          <select className="h-10 w-full border border-[#D7C9CD] bg-white px-3 text-sm" value={status} onChange={(e) => {setStatus(e.target.value as RenewalReviewStatus | "all");setSelected(null);}}>
            <option value="open">Open cases</option>
            <option value="resolved">Resolved cases</option>
            <option value="dismissed">Dismissed cases</option>
            <option value="all">All cases</option>
          </select>
        </label>
        <label className="relative min-w-52 flex-[2] space-y-1.5">
          <span className="text-xs font-semibold">Search reviews</span>
          <Search className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 text-[#716168]" />
          <input className="h-10 w-full border border-[#D7C9CD] bg-white pl-9 pr-3 text-sm" value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Name, parish, UID or filename" />
        </label>
        <button type="button" onClick={()=>void reload()} disabled={loading} className="inline-flex h-10 items-center gap-2 border border-[#D7C9CD] px-3 text-sm font-semibold text-[#890022]">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>
      {error && <p role="alert" className="border border-[#DFC7CE] bg-[#F8F1F3] p-3 text-sm text-[#890022]">{error}</p>}
      {notice && <p role="status" className="border border-[#DFC7CE] bg-[#F8F1F3] p-3 text-sm text-[#563440]">{notice}</p>}
      {loading ? (
        <p className="flex items-center gap-2 py-12 text-sm text-[#66575C]"><Loader2 className="h-4 w-4 animate-spin" /> Loading review cases…</p>
      ) : shown.length === 0 ? (
        <div className="border border-dashed border-[#D7C9CD] bg-white px-5 py-12 text-center">
          <ClipboardCheck className="mx-auto h-8 w-8 text-[#A2969B]" />
          <p className="mt-3 text-sm font-semibold">No matching {status === "open" ? "open" : ""} review cases.</p>
          <p className="mt-1 text-xs text-[#66575C]">Save review exceptions from a staged renewal CSV to add them here.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-[#E2D7DA] bg-white">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-[#F5F0F1] text-xs uppercase tracking-wider text-[#62545A]"><tr>
              <th className="p-3">Member</th><th className="p-3">Parish & Ministry</th><th className="p-3">Review reason</th><th className="p-3">Status</th><th className="p-3">Action</th>
            </tr></thead>
            <tbody>{shown.map((item) => <tr key={item.id} className="border-t border-[#EDE5E7]">
              <td className="p-3"><p className="font-semibold">{item.first_name} {item.last_name}</p><p className="mt-1 text-xs text-[#766970]">{item.source_filename} · {new Date(item.created_at).toLocaleDateString()}</p></td>
              <td className="p-3"><p>{item.parish}</p><p className="mt-1 text-xs text-[#766970]">{item.ministry}</p></td>
              <td className="p-3">{REASONS[item.reason] ?? item.reason}</td>
              <td className="p-3 capitalize">{item.status}</td>
              <td className="p-3"><button type="button" onClick={()=>beginReview(item)} className="font-semibold text-[#890022] underline underline-offset-2">{item.status === "open" ? "Review" : "View decision"}</button></td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
      {items.length === 500 && <p className="text-xs text-[#66575C]">Displaying at most the latest 500 cases for the selected status. Older cases require server-side pagination, which must be implemented before production use.</p>}
      {selected && <section aria-label="Review details" className="space-y-4 border border-[#E0CED2] border-t-[3px] border-t-[#890022] bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className={`${ebGaramond.className} text-2xl`}>{selected.first_name} {selected.last_name}</h2>
            <p className="text-sm text-[#62535A]">{REASONS[selected.reason] ?? selected.reason} · {selected.parish} · {selected.ministry}</p></div>
          <button type="button" className="text-sm font-semibold text-[#890022] underline" onClick={()=>setSelected(null)}>Close</button>
        </div>
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#62535A]">Possible registry matches</h3>
          {selected.candidates.length === 0 ? <p className="text-sm text-[#716168]">No candidates found during staging. Check the registry manually.</p> :
            selected.candidates.map((candidate) => <div key={candidate.id} className="flex flex-wrap justify-between gap-2 border border-[#E8E0E2] bg-[#FBF9F9] p-3 text-sm">
              <div><p className="font-semibold">{candidate.name} · {candidate.uid}</p>
                <p className="text-xs text-[#716168]">{candidate.parish} · {candidate.matchType} ({Math.round(candidate.similarity*100)}% match)</p></div>
              <Link href={`/admin/members/${candidate.id}`} className="text-xs font-semibold text-[#890022] underline">Open registry record</Link>
            </div>)}
        </div>
        {selected.status !== "open" ? (
          <div className="border border-[#E8E0E2] bg-[#FBF9F9] p-3 text-sm">
            <p><strong>Decision:</strong> {DECISIONS.find(d=>d.value===selected.resolution)?.label ?? selected.resolution}</p>
            <p className="mt-2 whitespace-pre-wrap"><strong>Notes:</strong> {selected.resolution_notes}</p>
            <p className="mt-2 text-xs text-[#716168]">Reviewed {selected.resolved_at ? new Date(selected.resolved_at).toLocaleString() : "—"}</p>
          </div>
        ) : (
          <div className="space-y-3 border-t border-[#EEE5E7] pt-4">
            <label className="block space-y-1"><span className="text-xs font-semibold">Outcome</span>
              <select value={outcome} onChange={e=>setOutcome(e.target.value as "resolved" | "dismissed")} className="h-10 w-full border border-[#D7C9CD] px-3 text-sm">
                <option value="resolved">Resolved after manual verification</option>
                <option value="dismissed">Dismissed / not eligible for renewal</option>
              </select></label>
            <label className="block space-y-1"><span className="text-xs font-semibold">Documented decision</span>
              <select value={decision} onChange={e=>setDecision(e.target.value as RenewalResolution)} className="h-10 w-full border border-[#D7C9CD] px-3 text-sm">
                <option value="">Choose a decision</option>{DECISIONS.map(d=><option key={d.value} value={d.value}>{d.label}</option>)}
              </select></label>
            <label className="block space-y-1"><span className="text-xs font-semibold">Review notes (required)</span>
              <textarea rows={3} maxLength={2000} className="w-full border border-[#D7C9CD] p-3 text-sm" value={notes} onChange={e=>setNotes(e.target.value)}
                placeholder="Record what was checked and which separate administrative action was taken, if any." />
            </label>
            <button type="button" onClick={()=>void submitDecision()} disabled={saving || !decision || notes.trim().length<10}
              className="inline-flex min-h-11 items-center gap-2 bg-[#890022] px-4 text-sm font-semibold text-white disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Record review decision
            </button>
          </div>
        )}
      </section>}
    </div>
  );
}
