"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ebGaramond } from "@/app/fonts";
import { CenteredAdminLoader } from "@/components/admin-centered-loader";
import { shortMinistry } from "@/lib/constants";
import { verifySelectedMinistries, attachPendingMinistryLetter } from "@/lib/secure-ministry-verification";

type MemberDetails = {
  id: string; uid: string; first_name: string; last_name: string;
  parish: string; status: string;
};
type PendingAssignment = { id: string; member_id: string; ministry: string; document_url: string | null };
type PendingMember = { member: MemberDetails; assignments: PendingAssignment[] };
type RawAssignment = PendingAssignment & {
  members: MemberDetails | MemberDetails[] | null;
};

const MAX_PENDING = 1000;

/** Phase-two UI: only displayed when the separate secure-RPC release flag is set.
 * Never falls back to legacy member-wide writes when the RPC is unavailable.
 */
export default function SecureMinistryVerification() {
  const supabase = getSupabaseBrowserClient();
  const [members, setMembers] = useState<PendingMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [reachedLimit, setReachedLimit] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Read actual pending ministry rows, not a member-wide status that could
      // conceal another ministry's independent verification state.
      const { data, error: fetchError } = await supabase
        .from("member_ministries")
        .select("id,member_id,ministry,document_url,members!inner(id,uid,first_name,last_name,parish,status)")
        .eq("status", "Pending Verification")
        .order("created_at", { ascending: true })
        .limit(MAX_PENDING);
      if (fetchError) throw new Error(fetchError.message);
      const grouped = new Map<string, PendingMember>();
      const records = (data ?? []) as unknown as RawAssignment[];
      for (const row of records) {
        const member = Array.isArray(row.members) ? row.members[0] : row.members;
        if (!member || !row.id || !row.member_id) continue;
        let entry = grouped.get(member.id);
        if (!entry) {
          entry = { member, assignments: [] };
          grouped.set(member.id, entry);
        }
        entry.assignments.push({
          id: row.id, member_id: row.member_id, ministry: row.ministry,
          document_url: row.document_url,
        });
      }
      setMembers(Array.from(grouped.values()));
      setReachedLimit(records.length === MAX_PENDING);
    } catch (cause) {
      setMembers([]);
      setError(cause instanceof Error ? cause.message : "Unable to load pending ministries.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { void reload(); }, [reload]);

  const visible = useMemo(() => {
    const value = search.toLocaleLowerCase().trim();
    if (!value) return members;
    return members.filter(({ member, assignments }) =>
      [member.first_name, member.last_name, member.parish, member.uid,
        ...assignments.map((row) => row.ministry)]
        .join(" ").toLocaleLowerCase().includes(value));
  }, [members, search]);

  const active = members.find((m) => m.member.id === activeId) ?? null;

  const begin = (id: string) => {
    setActiveId(id);
    setSelected(new Set()); // Explicit selection; no default auto-approval.
    setError(null);
    setNotice(null);
    setUploadNotice(null);
  };

  const uploadPendingLetter = async (assignment: PendingAssignment, file: File) => {
    if (!active || submitting || uploadingId ||
        assignment.member_id !== active.member.id || assignment.document_url) {
      setError("Reopen the member to upload a letter to the correct pending ministry.");
      return;
    }
    setError(null);
    setUploadNotice(null);
    setUploadingId(assignment.id);
    try {
      await attachPendingMinistryLetter(active.member.id, assignment.id, file);
      await reload();
      setUploadNotice(`Recommendation letter attached to ${assignment.ministry}. No verification or renewal was applied.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to attach the recommendation letter.");
    } finally {
      setUploadingId(null);
    }
  };

  const confirm = async () => {
    if (!active || submitting || uploadingId || selected.size === 0) return;
    const ids = active.assignments
      .filter((assignment) => selected.has(assignment.id))
      .map((assignment) => assignment.id);
    if (ids.length !== selected.size || ids.some((id) => !active.assignments.find((a) => a.id === id)?.document_url)) {
      setError("Selection changed. Reopen this record before approving.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await verifySelectedMinistries(active.member.id, ids);
      setNotice(
        `Verified ${result.updated_assignments} selected ministry ${result.updated_assignments === 1 ? "assignment" : "assignments"} for one year. Member summary: ${result.member_status}. Unselected ministries were not approved.`
      );
      setActiveId(null);
      setSelected(new Set());
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Verification could not be completed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="space-y-5 pb-12 text-[#28191E]" aria-label="Secure ministry verification">
      <header className="border-b border-[#E6DADC] pb-4">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#890022]">Verification · assignment-level</p>
        <h2 className={ebGaramond.className + " mt-2 text-4xl"}>Verify Ministry Assignments</h2>
        <p className="mt-2 max-w-3xl text-sm text-[#65545A]">
          Select the exact ministries approved for a minister. A verification date and one-year
          expiration are set by the database. Other ministries remain unchanged.
          Renewals with recommendation letters are handled in the Renewals tab.
        </p>
      </header>
      {notice && <p role="status" className="border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>}
      {error && <p role="alert" className="border border-[#B66C7D] bg-[#FBF0F2] px-4 py-3 text-sm text-[#7B1834]">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex-1 min-w-[220px]">
          <span className="sr-only">Search pending ministry assignments</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder="Search minister, parish, UID, or ministry"
            className="w-full border border-[#D9CBCF] bg-white px-3 py-2.5 text-sm outline-[#890022]" />
        </label>
        <button type="button" onClick={() => void reload()} disabled={loading || submitting}
          className="border border-[#890022] bg-white px-4 py-2.5 text-sm font-semibold text-[#890022] disabled:opacity-50">
          Refresh
        </button>
      </div>
      {reachedLimit && (
        <p role="alert" className="border border-amber-300 bg-amber-50 p-3 text-sm">
          Showing only the first {MAX_PENDING} pending assignments. Review smaller batches before approving.
        </p>
      )}
      {loading ? <CenteredAdminLoader label="Loading pending ministry assignments…" className="min-h-[200px]" /> :
        visible.length === 0 ? <p className="border border-dashed border-[#D9CBCF] p-8 text-sm text-[#65545A]">
          No pending ministry assignments found for this search.
        </p> : (
        <div className="space-y-3">
          {visible.map(({ member, assignments }) => (
            <article key={member.id} className="border border-[#E5D6DA] border-t-[3px] border-t-[#890022] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{member.first_name} {member.last_name}</h3>
                  <p className="text-xs text-[#66545A]">{member.parish} · {member.uid}</p>
                  <p className="mt-2 text-sm">{assignments.map((a) => shortMinistry(a.ministry)).join(" · ")}</p>
                  <p className="mt-1 text-xs text-[#66545A]">{assignments.length} pending {assignments.length === 1 ? "assignment" : "assignments"}</p>
                </div>
                <button type="button" onClick={() => begin(member.id)} disabled={submitting}
                  className="bg-[#890022] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                  Review ministries
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {active && (
        <section role="dialog" aria-modal="true" aria-label="Choose ministry assignments to verify"
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#241015]/65 p-4">
          <div className="w-full max-w-xl space-y-4 border border-[#E0CED2] bg-white p-5 shadow-xl">
            <header className="border-b border-[#EAE0E3] pb-3">
              <h3 className={ebGaramond.className + " text-3xl"}>Verify selected ministries</h3>
              <p className="mt-1 text-sm text-[#66545A]">
                {active.member.first_name} {active.member.last_name} · {active.member.parish}
              </p>
            </header>
            <p className="text-sm">
              Select only the ministry assignments whose recommendation letters have been reviewed.
              The server will record a <strong>New</strong> verification valid for one calendar year.
            </p>
            <Link href={`/admin/members/${active.member.id}`}
              className="inline-block text-sm font-semibold text-[#890022] underline">
              Review this minister’s documents and assignments
            </Link>
            <div className="space-y-2">
              {active.assignments.map((assignment) => (
                <div key={assignment.id} className="border border-[#E6DADC] p-3">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input type="checkbox" checked={selected.has(assignment.id)}
                      disabled={submitting || uploadingId !== null || !assignment.document_url}
                      onChange={(event) => setSelected((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(assignment.id);
                        else next.delete(assignment.id);
                        return next;
                      })} className="mt-1 accent-[#890022]" />
                    <span className="text-sm font-medium">{assignment.ministry}
                      <span className="block text-xs font-normal text-[#66545A]">
                        {assignment.document_url ? "Recommendation letter on file" : "No ministry recommendation letter on file — upload before approval"}
                      </span>
                    </span>
                  </label>
                  {!assignment.document_url && (
                    <label className="mt-2 inline-flex cursor-pointer items-center gap-2 border border-[#890022] bg-white px-3 py-1.5 text-xs font-semibold text-[#890022] focus-within:ring-2 focus-within:ring-[#890022]">
                      {uploadingId === assignment.id ? "Uploading…" : "Upload letter"}
                      <input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                        className="sr-only" disabled={submitting || uploadingId !== null}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadPendingLetter(assignment, file);
                          event.target.value = "";
                        }} />
                    </label>
                  )}
                </div>
              ))}
            </div>
            {uploadNotice && <p role="status" className="border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{uploadNotice}</p>}
            {error && <p role="alert" className="border border-[#C69BA6] bg-[#FBF1F3] p-3 text-sm text-[#7B1834]">{error}</p>}
            <p className="text-xs text-[#66545A]">
              Unselected ministries stay pending. No approval occurs until you confirm.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => { setActiveId(null); setSelected(new Set()); }}
                disabled={submitting || uploadingId !== null} className="border border-[#D9C9CF] px-4 py-2.5 text-sm font-semibold disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={() => void confirm()} disabled={submitting || uploadingId !== null || selected.size === 0}
                className="bg-[#890022] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {submitting ? "Verifying…" : `Verify ${selected.size} selected`}
              </button>
            </div>
          </div>
        </section>
      )}
    </section>
  );
}
