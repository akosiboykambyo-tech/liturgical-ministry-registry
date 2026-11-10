"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { attachRecommendationLetter } from "@/lib/registry-letter-attachments";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Loader2, Upload } from "@/components/phosphor-icons";

type Assignment = {
  id: string;
  memberId: string;
  uid: string;
  name: string;
  parish: string;
  ministry: string;
  status: string;
  documentUrl: string | null;
};

type RawAssignment = {
  id: string;
  member_id: string;
  ministry: string;
  status: string;
  document_url: string | null;
  members: {
    uid: string;
    first_name: string;
    last_name: string;
    parish: string;
  } | Array<{
    uid: string;
    first_name: string;
    last_name: string;
    parish: string;
  }> | null;
};

export function BatchLetterAttachmentDialog({
  open,
  onOpenChange,
  selectedMemberIds,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedMemberIds: string[];
  onUpdated: () => void | Promise<void>;
}) {
  const memberKey = selectedMemberIds.join(",");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"shared" | "individual">("shared");
  const [sharedFile, setSharedFile] = useState<File | null>(null);
  const [individualFiles, setIndividualFiles] = useState<Record<string, File>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setAssignments([]);
    setChecked(new Set());
    setSharedFile(null);
    setIndividualFiles({});
    setConfirmed(false);
    setError("");
    setNotice("");
    const ids = memberKey.split(",").filter(Boolean);
    if (ids.length < 1 || ids.length > 100) {
      setError("Choose between 1 and 100 members for document attachment.");
      return;
    }
    setLoading(true);
    const load = async () => {
      try {
        const { data, error: loadError } = await getSupabaseBrowserClient()
          .from("member_ministries")
          .select("id,member_id,ministry,status,document_url,members!inner(uid,first_name,last_name,parish)")
          .in("member_id", ids)
          .order("member_id")
          .order("ministry");
        if (loadError) throw loadError;
        if (cancelled) return;
        const rows: Assignment[] = ((data ?? []) as unknown as RawAssignment[]).map((row) => {
          const member = Array.isArray(row.members) ? row.members[0] : row.members;
          return {
            id: row.id,
            memberId: row.member_id,
            uid: member?.uid ?? "",
            name: `${member?.first_name ?? ""} ${member?.last_name ?? ""}`.trim(),
            parish: member?.parish ?? "",
            ministry: row.ministry,
            status: row.status,
            documentUrl: row.document_url,
          };
        });
        setAssignments(rows);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load selected assignments.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [open, memberKey]);

  const eligible = useMemo(() => assignments.filter((a) => !a.documentUrl), [assignments]);
  const chosen = useMemo(() => eligible.filter((a) => checked.has(a.id)), [eligible, checked]);
  const distinctParishes = useMemo(
    () => new Set(chosen.map((row) => row.parish.trim().toLowerCase())).size,
    [chosen]
  );
  const sharedParishValid = distinctParishes <= 1;
  const filesComplete = mode === "shared"
    ? !!sharedFile && sharedParishValid
    : chosen.every((row) => !!individualFiles[row.id]);
  const canSubmit = !busy && !loading && checked.size > 0 && checked.size <= 100 && filesComplete && confirmed;

  const toggle = (id: string, yes: boolean) => {
    setConfirmed(false);
    setChecked((old) => {
      const next = new Set(old);
      if (yes) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    setNotice("");
    let successful = 0;
    const completedIds: string[] = [];
    try {
      if (mode === "shared" && sharedFile) {
        successful = await attachRecommendationLetter(chosen.map((a) => a.id), sharedFile);
        completedIds.push(...chosen.map((a) => a.id));
      } else {
        // Separate immutable file per assignment. Never silently assign one
        // member's letter to a different member via filename matching.
        for (const assignment of chosen) {
          const file = individualFiles[assignment.id];
          if (!file) throw new Error(`Select a file for ${assignment.name} — ${assignment.ministry}`);
          await attachRecommendationLetter([assignment.id], file);
          completedIds.push(assignment.id);
          successful += 1;
        }
      }
      setNotice(`Attached letters to ${successful} ministry assignment(s). No status or validity dates changed.`);
      setAssignments((old) => old.map((row) =>
        completedIds.includes(row.id) ? { ...row, documentUrl: "attached" } : row
      ));
      setChecked(new Set());
      setSharedFile(null);
      setIndividualFiles({});
      setConfirmed(false);
      await onUpdated();
      // The selected records are re-read on the next dialog open.
    } catch (cause) {
      setAssignments((old) => old.map((row) =>
        completedIds.includes(row.id) ? { ...row, documentUrl: "attached" } : row
      ));
      setError(
        `${successful} attachment(s) confirmed. ` +
        (cause instanceof Error ? cause.message : "Some attachments could not be confirmed.") +
        " Refresh and check assignments before retrying."
      );
      await onUpdated();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,800px)] max-w-[800px] flex-col gap-3 overflow-hidden border-[#E3D8DA] bg-[#FBF9F9] p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#211018]">
            <FileText className="h-5 w-5 text-[#890022]" />
            Attach Recommendation Letters
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-[#745D64]">
          This is a document-only operation. It does not verify, renew, change status,
          or update registration and expiration dates. Existing letters cannot be overwritten.
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Attachment mode">
          <button type="button" onClick={() => {setMode("shared");setConfirmed(false);}} disabled={busy}
            className={`border px-3 py-2 text-xs font-semibold ${mode === "shared" ? "border-[#890022] bg-[#890022] text-white" : "border-[#D8CDD0] bg-white text-[#69001D]"}`}>
            Shared parish letter
          </button>
          <button type="button" onClick={() => {setMode("individual");setConfirmed(false);}} disabled={busy}
            className={`border px-3 py-2 text-xs font-semibold ${mode === "individual" ? "border-[#890022] bg-[#890022] text-white" : "border-[#D8CDD0] bg-white text-[#69001D]"}`}>
            Separate letters per ministry
          </button>
        </div>
        {error && <p role="alert" className="border border-red-200 bg-red-50 p-3 text-xs text-red-900">{error}</p>}
        {notice && <p role="status" className="border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">{notice}</p>}
        <div className="min-h-0 flex-1 overflow-y-auto border border-[#E4D9DB] bg-white">
          {loading ? (
            <div className="flex items-center gap-2 p-6 text-xs"><Loader2 className="h-4 w-4 animate-spin" /> Loading ministry assignments…</div>
          ) : assignments.length === 0 ? (
            <p className="p-5 text-xs text-[#745D64]">No ministry assignments available for the selected members.</p>
          ) : (
            <div className="divide-y divide-[#ECE2E4]">
              {assignments.map((a) => (
                <div key={a.id} className="px-4 py-3">
                  <label className="flex items-start gap-3 text-sm">
                    <input type="checkbox" className="mt-1 accent-[#890022]" disabled={busy || !!a.documentUrl}
                      checked={checked.has(a.id)} onChange={(event) => toggle(a.id, event.target.checked)} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-[#211018]">{a.name} <span className="font-normal text-[#796870]">({a.uid})</span></span>
                      <span className="block text-xs text-[#745D64]">{a.parish} · {a.ministry} · {a.status}</span>
                      {a.documentUrl && <span className="block text-xs text-emerald-800">Letter already on file — not eligible for attachment</span>}
                    </span>
                  </label>
                  {mode === "individual" && checked.has(a.id) && !a.documentUrl && (
                    <input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                      aria-label={`Letter for ${a.name}, ${a.ministry}`}
                      disabled={busy} onChange={(event) => {
                        const file = event.target.files?.[0];
                        setConfirmed(false);
                        setIndividualFiles((old) => {
                          const next = {...old};
                          if (file) next[a.id] = file;
                          else delete next[a.id];
                          return next;
                        });
                      }} className="mt-2 block w-full text-xs" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#745D64]">
          <span>{chosen.length} assignment(s) selected · {eligible.length} without letters</span>
          <button type="button" disabled={busy || eligible.length===0}
            className="font-semibold text-[#890022] disabled:opacity-50"
            onClick={() => { setChecked(new Set(eligible.slice(0,100).map(a=>a.id))); setConfirmed(false); }}>
            Select all without letters (up to 100)
          </button>
        </div>
        {mode === "shared" && (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[#211018]">Shared recommendation letter (PDF, JPEG or PNG; 5 MB max)</label>
            <input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              disabled={busy} onChange={(e)=>{setSharedFile(e.target.files?.[0]??null);setConfirmed(false);}}
              className="block w-full text-xs" />
            {!sharedParishValid && <p role="alert" className="text-xs text-red-800">A shared letter can only be attached to members from the same parish. Narrow the selection or use separate files.</p>}
          </div>
        )}
        <label className="flex items-start gap-2 text-xs text-[#51373F]">
          <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} disabled={busy} className="mt-0.5 accent-[#890022]" />
          I have verified that each selected letter covers the chosen member(s) and ministry assignments.
        </label>
        <div className="flex flex-wrap justify-end gap-2 border-t border-[#E4D9DB] pt-3">
          <button type="button" disabled={busy} onClick={()=>onOpenChange(false)}
            className="border border-[#DDD0D3] bg-white px-4 py-2 text-xs font-semibold text-[#51373F]">Close</button>
          <button type="button" disabled={!canSubmit} onClick={()=>void submit()}
            className="inline-flex items-center gap-2 bg-[#890022] px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {busy ? "Attaching…" : "Attach to selected assignments"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
