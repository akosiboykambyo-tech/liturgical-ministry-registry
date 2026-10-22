"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList, FileDown, FileSpreadsheet, History, Loader2, Search, Users } from "lucide-react";
import { ebGaramond } from "@/app/fonts";
import { MINISTRIES, PARISHES } from "@/lib/constants";
import { MultiSelectCombobox } from "@/components/multi-select-combobox";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Assignment = { id: string; ministry: string; status: string; member_id: string };
type Candidate = { id: string; uid: string; first_name: string; last_name: string; parish: string; member_ministries: Assignment[] };
const supabase = getSupabaseBrowserClient();
const field = "h-11 w-full rounded-none border border-[#D7C9CD] bg-white px-3 text-sm outline-none focus:border-[#890022] focus:ring-2 focus:ring-[#890022]/15";
const todayYear = new Date().getFullYear();
const labelClass = "mb-1.5 block text-xs font-semibold text-[#514449]";
const csvCell = (value: string | number) => '"' + String(value).replace(/"/g, '""') + '"';

export default function RenewalBatchPreparationPage() {
  const [parish, setParish] = useState<string>("");
  const [ministry, setMinistry] = useState<string>("");
  const [year, setYear] = useState(todayYear);
  const [representative, setRepresentative] = useState("");
  const [contact, setContact] = useState("");
  const [lookup, setLookup] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const findMembers = useCallback(async () => {
    if (!parish || !ministry) { setCandidates([]); return; }
    setLoading(true);
    setError(null);
    // Read only: existing admin-only RLS governs access to the registry.
    const { data, error: requestError } = await supabase.from("members")
      .select("id,uid,first_name,last_name,parish,member_ministries(id,ministry,status,member_id)")
      .eq("parish", parish)
      .order("last_name", { ascending: true })
      .limit(1000);
    setLoading(false);
    if (requestError) { setCandidates([]); setError(requestError.message); return; }
    setCandidates((data ?? []).filter((m) =>
      Array.isArray(m.member_ministries) && m.member_ministries.some((a: Assignment) => a.ministry === ministry)
    ) as Candidate[]);
  }, [parish, ministry]);

  useEffect(() => { void findMembers(); }, [findMembers]);
  useEffect(() => { setSelected([]); setLookup(""); }, [parish, ministry]);

  const matches = useMemo(() => candidates.filter((m) => {
    const term = lookup.trim().toLocaleLowerCase();
    return !term || `${m.first_name} ${m.last_name} ${m.uid}`.toLocaleLowerCase().includes(term);
  }), [candidates, lookup]);

  const add = (member: Candidate) => setSelected((prior) => prior.some((m) => m.id === member.id) ? prior : [...prior, member]);
  const remove = (id: string) => setSelected((prior) => prior.filter((m) => m.id !== id));

  const exportDraft = () => {
    if (!parish || !ministry || !representative.trim() || selected.length === 0) {
      setError("Enter the parish, ministry, representative and at least one member.");
      return;
    }
    const header = ["Parish", "Ministry", "Service Year", "Representative", "Contact", "UID", "Member Name", "Ministry Assignment ID", "Registration Status"];
    const rows = selected.map((m) => [parish, ministry, year, representative.trim(), contact.trim(), m.uid,
      `${m.last_name}, ${m.first_name}`, m.member_ministries.find((a) => a.ministry === ministry)?.id ?? "", 
      m.member_ministries.find((a) => a.ministry === ministry)?.status ?? ""]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `renewal-draft-${year}-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <div className="border-b border-[#E5D9DC] pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#890022]">Commission Renewal Desk</p>
        <h1 className={`${ebGaramond.className} mt-2 text-4xl text-[#271C20]`}>Parish–Ministry Batches</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6B5C62]">Prepare a consolidated parish submission and match its members to the registry. The manual-selection method below prepares a draft only; the existing CSV-based renewal processor remains available through its dedicated link. Payment collection and treasury remittance are not enabled.</p>
      </div>
      <div className="border border-[#E2D7DA] border-l-4 border-l-[#890022] bg-[#F8F1F3] px-4 py-3 text-sm leading-6 text-[#592C3A]">
        <strong>Preparation only.</strong> You can download a draft CSV manifest for review. Final batch saving, supplemental submission tracking, payment collection and treasury remittance remain disabled until the database controls are approved.
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="border border-[#D9CED1] bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#42262F]"><Users className="h-4 w-4 text-[#890022]" /> Select members from registry</div>
          <p className="mt-2 text-xs leading-5 text-[#6B5C62]">Build a draft roster directly from existing member records using the form below. Draft export does not change registrations.</p>
        </div>
        <div className="border border-[#D9CED1] bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#42262F]"><FileSpreadsheet className="h-4 w-4 text-[#890022]" /> Upload a parish renewal CSV</div>
          <p className="mt-2 text-xs leading-5 text-[#6B5C62]">Open the existing validated CSV renewal processor, including shared recommendation-letter upload and review of uncertain matches.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link href="/admin/import?tab=renewal" className="text-xs font-semibold text-[#890022] underline underline-offset-2">Open CSV Renewal Processor</Link>
            <Link href="/admin/import?tab=history" className="inline-flex items-center gap-1 text-xs font-semibold text-[#890022] underline underline-offset-2"><History className="h-3.5 w-3.5" /> Renewal History</Link>
          </div>
        </div>
      </div>
      <section className="space-y-4 border border-[#E2D7DA] bg-white p-5">
        <div className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-[#890022]" /><h2 className="text-base font-semibold">Batch details</h2></div>
        <div className="grid gap-4 md:grid-cols-2">
          <div><span className={labelClass}>Parish</span><MultiSelectCombobox
            options={[...PARISHES].sort((a, b) => a.localeCompare(b))}
            selected={parish ? [parish] : []}
            onChange={(values) => setParish(values[values.length - 1] ?? "")}
            placeholder="Select parish"
            searchPlaceholder="Search for a parish..."
            emptyText="No matching parish found."
            className="min-h-11 rounded-none border-[#D7C9CD] text-left"
          /></div>
          <label><span className={labelClass}>Ministry</span><select className={field} value={ministry} onChange={(e) => setMinistry(e.target.value)}><option value="">Select ministry</option>{MINISTRIES.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
          <label><span className={labelClass}>Service year</span><input className={field} type="number" min={2000} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value))} /></label>
          <label><span className={labelClass}>Parish representative</span><input className={field} maxLength={120} value={representative} onChange={(e) => setRepresentative(e.target.value)} placeholder="Full name" /></label>
          <label className="md:col-span-2"><span className={labelClass}>Representative contact (optional)</span><input className={field} maxLength={120} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Telephone or email" /></label>
        </div>
      </section>
      <section className="space-y-4 border border-[#E2D7DA] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><Users className="h-5 w-5 text-[#890022]" /><h2 className="text-base font-semibold">Match registered members</h2></div>
          <span className="text-xs text-[#6B5C62]">{selected.length} selected</span>
        </div>
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-[#89797E]" /><input className={`${field} pl-10`} value={lookup} onChange={(e) => setLookup(e.target.value)} disabled={!parish || !ministry} placeholder="Search member name or UID" /></div>
        {error && <p role="alert" className="border border-[#DFC5CB] bg-[#F8F1F3] p-3 text-sm text-[#890022]">{error}</p>}
        {loading ? <p className="flex items-center gap-2 text-sm text-[#6B5C62]"><Loader2 className="h-4 w-4 animate-spin" /> Loading members…</p> : !parish || !ministry ? <p className="text-sm text-[#6B5C62]">Choose a parish and ministry to show matching registry members.</p> : (
          <div className="max-h-80 overflow-y-auto border border-[#E2D7DA]">
            {matches.length === 0 ? <p className="p-4 text-sm text-[#6B5C62]">No matching members found.</p> : matches.map((m) => {
              const included = selected.some((s) => s.id === m.id);
              return <div key={m.id} className="flex items-center justify-between gap-3 border-b border-[#EFE8EA] px-3 py-2 last:border-b-0">
                <div className="min-w-0"><p className="truncate text-sm font-medium">{m.last_name}, {m.first_name}</p><p className="text-xs text-[#6B5C62]">{m.uid}</p></div>
                <button type="button" disabled={included} onClick={() => add(m)} className="min-w-20 border border-[#890022] px-3 py-2 text-xs font-semibold text-[#890022] disabled:border-[#D9CED1] disabled:text-[#81777A]">{included ? "Added" : "Add"}</button>
              </div>;
            })}
          </div>
        )}
      </section>
      <section className="space-y-4 border border-[#E2D7DA] bg-white p-5">
        <div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold">Draft batch manifest</h2><span className="text-sm text-[#6B5C62]">{selected.length} ministers</span></div>
        {selected.length === 0 ? <p className="text-sm text-[#6B5C62]">No members selected yet.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[#F5F0F1] text-[#514449]"><tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">UID</th><th className="px-3 py-2">Registry status</th><th className="px-3 py-2">Action</th></tr></thead><tbody>{selected.map((m) => <tr key={m.id} className="border-b border-[#EEE5E7]"><td className="px-3 py-2">{m.last_name}, {m.first_name}</td><td className="px-3 py-2">{m.uid}</td><td className="px-3 py-2">{m.member_ministries.find((a) => a.ministry === ministry)?.status ?? "—"}</td><td className="px-3 py-2"><button className="text-xs font-semibold text-[#890022] underline" onClick={() => remove(m.id)}>Remove</button></td></tr>)}</tbody></table></div>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EEE5E7] pt-4"><p className="text-xs text-[#6B5C62]">Draft CSV contains member UIDs. Store and share securely.</p><button type="button" onClick={exportDraft} disabled={selected.length===0} className="inline-flex min-h-11 items-center gap-2 bg-[#890022] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"><FileDown className="h-4 w-4" /> Download Draft CSV</button></div>
      </section>
    </div>
  );
}
