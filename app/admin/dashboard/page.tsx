"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Download, RefreshCw, Search } from "lucide-react";
import { ebGaramond } from "@/app/fonts";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AuditLog, Member, MemberMinistry } from "@/lib/types";

const CRIMSON = "#890022";
const STATUS = [
  { key: "New", label: "Verified Active", color: "#0B5C5A" },
  { key: "Renewed", label: "Renewed (Validated)", color: "#2563A6" },
  { key: "Pending Verification", label: "Pending Verification", color: "#B7791F" },
  { key: "Inactive", label: "Inactive", color: "#8A8588" },
] as const;

type MemberRow = Pick<Member, "id" | "first_name" | "last_name" | "parish" | "service_year" | "created_at">;
type Assignment = Pick<MemberMinistry, "member_id" | "ministry" | "status" | "document_url" | "created_at" | "renewal_date">;
type Activity = Pick<AuditLog, "id" | "admin_action" | "timestamp" | "member_id">;
type Report = { members: MemberRow[]; memberships: Assignment[]; activities: Activity[]; error: string | null };

const panel = "border border-[#E6DADC] border-t-[3px] border-t-[#890022] bg-white p-4 sm:p-5";
const fmt = (v: number) => new Intl.NumberFormat("en-PH").format(v);
const csvEscape = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;

function getMemberStatus(rows: Assignment[]) {
  if (rows.some((x) => x.status === "Renewed")) return "Renewed";
  if (rows.some((x) => x.status === "New")) return "New";
  if (rows.some((x) => x.status === "Pending Verification")) return "Pending Verification";
  return "Inactive";
}

export default function AdminDashboardPage() {
  const supabase = getSupabaseBrowserClient();
  const [data, setData] = useState<Report>({ members: [], memberships: [], activities: [], error: null });
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState<string>("All");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        // Fetch a precise row count, then request deterministic pages concurrently.
        // Bounded concurrency prevents overwhelming Supabase and avoids the latency
        // of waiting for every 1,000-row page before starting the next one.
        const loadAll = async <T,>(table: string, columns: string): Promise<T[]> => {
          const PAGE_SIZE = 1000;
          const MAX_CONCURRENT = 5;
          const { count, error: countError } = await supabase
            .from(table)
            .select("id", { count: "exact", head: true });
          if (countError) throw new Error(`${table} count: ${countError.message}`);
          if (count === null) throw new Error(`${table}: row count unavailable`);
          if (count === 0) return [];

          const pages = Math.ceil(count / PAGE_SIZE);
          const chunks: T[][] = new Array(pages);
          let nextPage = 0;
          const worker = async () => {
            while (nextPage < pages) {
              const page = nextPage++;
              const from = page * PAGE_SIZE;
              const { data: batch, error } = await supabase
                .from(table)
                .select(columns)
                .order("id", { ascending: true })
                .range(from, from + PAGE_SIZE - 1);
              if (error) throw new Error(`${table} page ${page + 1}: ${error.message}`);
              const records = (batch ?? []) as T[];
              const expected = Math.min(PAGE_SIZE, count - from);
              if (records.length !== expected) {
                throw new Error(`${table}: data changed during loading. Refresh the dashboard to recalculate complete figures.`);
              }
              chunks[page] = records;
            }
          };
          await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, pages) }, () => worker()));
          return chunks.flat();
        };
        const [members, memberships, recent] = await Promise.all([
          loadAll<MemberRow>("members", "id,first_name,last_name,parish,service_year,created_at"),
          loadAll<Assignment>("member_ministries", "member_id,ministry,status,document_url,created_at,renewal_date"),
          supabase.from("audit_logs").select("id,admin_action,timestamp,member_id").order("timestamp", { ascending: false }).limit(7),
        ]);
        if (recent.error) throw new Error(`audit_logs: ${recent.error.message}`);
        if (!cancelled) setData({ members, memberships, activities: (recent.data ?? []) as Activity[], error: null });
      } catch (e) {
        if (!cancelled) setData({ members: [], memberships: [], activities: [], error: e instanceof Error ? e.message : "Unable to load dashboard data" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [supabase, reload]);

  const years = useMemo(() => Array.from(new Set(data.members.map(m => m.service_year).filter((x): x is number => Number.isFinite(x)))).sort((a,b) => b-a), [data.members]);
  const effectiveYear = year === "All" && years.length ? String(years[0]) : year;
  const current = useMemo(() => data.members.filter(m => effectiveYear === "All" || String(m.service_year) === effectiveYear), [data.members, effectiveYear]);
  const memberIds = useMemo(() => new Set(current.map(m => m.id)), [current]);
  const assignments = useMemo(() => data.memberships.filter(a => memberIds.has(a.member_id)), [data.memberships, memberIds]);
  const summary = useMemo(() => {
    const byMember = new Map<string, Assignment[]>();
    current.forEach(m => byMember.set(m.id, []));
    assignments.forEach(a => byMember.get(a.member_id)?.push(a));
    const counts: Record<string, number> = Object.fromEntries(STATUS.map(s => [s.key, 0]));
    byMember.forEach((rows) => { counts[getMemberStatus(rows)]++; });
    const parishes = new Map<string, number>();
    current.forEach(m => parishes.set(m.parish || "Unspecified parish", (parishes.get(m.parish || "Unspecified parish") ?? 0) + 1));
    const ministries = new Map<string, number>();
    assignments.forEach(a => ministries.set(a.ministry, (ministries.get(a.ministry) ?? 0) + 1));
    const covered = assignments.filter(a => Boolean(a.document_url)).length;
    const sorted = (map: Map<string,number>) => Array.from(map.entries()).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]));
    const pending = new Set(assignments.filter(a => a.status === "Pending Verification").map(a => a.member_id)).size;
    return { counts, parishes: sorted(parishes), ministries: sorted(ministries), covered, pending, membershipCount: assignments.length };
  }, [current, assignments]);
  const breakdown = STATUS.map(s => ({ ...s, count: summary.counts[s.key] ?? 0 }));
  const reportLabel = effectiveYear === "All" ? "All service years" : `Service year ${effectiveYear}`;

  function exportReport() {
    const rows: (string | number)[][] = [
      ["COWL-DOK Registry Report", reportLabel],
      ["Metric", "Count"],
      ["Members", current.length],
      ...breakdown.map(s => [s.label, s.count]),
      ["Ministry assignments", summary.membershipCount],
      ["Assignments with recommendation letter", summary.covered],
      [], ["Parish", "Members"], ...summary.parishes,
      [], ["Ministry", "Assignments"], ...summary.ministries,
    ];
    const blob = new Blob(["\uFEFF" + rows.map(r => r.map(csvEscape).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `cowl-dok-dashboard-${effectiveYear}.csv`; link.click();
    URL.revokeObjectURL(url);
  }

  const chart = (items: [string, number][], maxItems: number, title: string, noun: string) => (
    <section className={panel} aria-label={title}>
      <h2 className="text-[16px] font-semibold text-[#1E1114]">{title}</h2>
      <div className="mt-5 space-y-3">
        {items.length === 0 ? <p className="text-sm text-[#5F4A4F]">No records for this service year.</p> : items.slice(0,maxItems).map(([name,count]) => (
          <div key={name} className="grid grid-cols-[minmax(0,1fr)_minmax(90px,2fr)_55px] items-center gap-3 text-[13px] sm:text-[14px]">
            <span className="min-w-0 break-words leading-5">{name}</span>
            <div className="h-2.5 bg-[#F1E8EA]" aria-hidden="true"><div className="h-full bg-[#890022]" style={{width: `${items[0][1] ? count/items[0][1]*100 : 0}%`}}/></div>
            <span className="text-right font-medium tabular-nums">{fmt(count)}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[12px] text-[#66565A]">Counts represent {noun}. All values are shown numerically.</p>
    </section>
  );

  return (
    <div className="space-y-5 text-[#1E1114]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className={`${ebGaramond.className} text-[42px] font-medium leading-none sm:text-[48px]`}>Dashboard</h1>
          <p className="mt-2 text-sm text-[#66565A]">Registry reporting and operational overview · {reportLabel}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Link href="/admin/members" className="inline-flex min-h-10 items-center gap-2 border border-[#D7CACC] bg-white px-3 text-sm"><Search size={16}/> Find member</Link>
          <label className="flex flex-col gap-1 text-xs font-medium">Service Year
            <select value={effectiveYear} onChange={e=>setYear(e.target.value)} className="min-h-10 border border-[#D7CACC] bg-white px-3 text-sm">
              {years.map(y=><option key={y} value={y}>{y}</option>)}
              <option value="All">All years</option>
            </select>
          </label>
          <button type="button" disabled={loading||Boolean(data.error)} onClick={exportReport} className="inline-flex min-h-10 items-center gap-2 border border-[#970E24] px-3 text-sm font-medium text-[#970E24] disabled:opacity-50"><Download size={15}/> Export CSV</button>
          <button type="button" onClick={()=>setReload(x=>x+1)} aria-label="Refresh dashboard" className="grid min-h-10 w-10 place-items-center border border-[#D7CACC] bg-white"><RefreshCw size={16}/></button>
        </div>
      </div>

      {data.error && <p role="alert" className="border-l-4 border-red-700 bg-red-50 px-4 py-3 text-sm">Could not load complete reporting data: {data.error}. Figures are withheld rather than showing partial results.</p>}
      {loading && <p role="status" className="py-5 text-sm text-[#66565A]">Loading complete registry records…</p>}
      {!loading && !data.error && <>
        <Link href="/admin/verify" className="flex items-center justify-between gap-3 border border-[#D7CACC] bg-[#F7F2F3] px-4 py-3 text-sm hover:border-[#970E24]">
          <span><strong className="tabular-nums">{fmt(summary.pending)}</strong> members have at least one ministry pending verification. Open the Quick-Scan Matrix.</span><ArrowRight size={17} className="shrink-0"/>
        </Link>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {([{label:"Total Members",value:current.length,href:"/admin/members"},...breakdown.map(s=>({label:s.label,value:s.count,href:s.key==="Pending Verification"?"/admin/members?attention=pending":"/admin/members"}))]).map(item=>(
            <Link key={item.label} href={item.href} className="group border border-[#E6DADC] border-t-[3px] border-t-[#890022] bg-white p-4 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#890022]">
              <p className={`${ebGaramond.className} text-[38px] font-medium tabular-nums leading-none`}>{fmt(item.value)}</p>
              <p className="mt-2 text-[13px] font-medium leading-5">{item.label}</p>
            </Link>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={panel}>
            <h2 className="text-[16px] font-semibold">Members by status</h2>
            <p className="mt-1 text-[12px] text-[#66565A]">One status per person, prioritizing Renewed, then New, Pending and Inactive.</p>
            <div role="img" aria-label={breakdown.map(s=>`${s.label}: ${s.count}`).join("; ")} className="mt-5 flex h-4 overflow-hidden bg-[#F1E8EA]">
              {breakdown.map(s=><div key={s.key} style={{width:`${current.length?s.count/current.length*100:0}%`,background:s.color}}/>)}
            </div>
            <table className="mt-4 w-full text-sm"><caption className="sr-only">Status counts and proportions</caption><tbody>{breakdown.map(s=><tr key={s.key} className="border-b border-[#F0E8EA]"><th scope="row" className="py-2 text-left font-normal"><span className="mr-2 inline-block h-2 w-2" style={{background:s.color}}/>{s.label}</th><td className="py-2 text-right font-medium tabular-nums">{fmt(s.count)}</td><td className="w-16 py-2 text-right text-[#66565A] tabular-nums">{current.length?(100*s.count/current.length).toFixed(1):"0.0"}%</td></tr>)}</tbody></table>
          </section>
          <section className={panel}>
            <h2 className="text-[16px] font-semibold">Recommendation letter coverage</h2>
            <p className="mt-1 text-[12px] text-[#66565A]">Measured across ministry assignments, not distinct people.</p>
            <p className={`${ebGaramond.className} mt-5 text-[40px] leading-none`}>{summary.membershipCount?(summary.covered/summary.membershipCount*100).toFixed(1):"0.0"}%</p>
            <p className="mt-2 text-sm">{fmt(summary.covered)} of {fmt(summary.membershipCount)} assignments have a document link</p>
            <div className="mt-5 h-3 bg-[#F1E8EA]" role="progressbar" aria-label="Recommendation document coverage" aria-valuemin={0} aria-valuemax={summary.membershipCount} aria-valuenow={summary.covered}><div className="h-full bg-[#890022]" style={{width:`${summary.membershipCount?summary.covered/summary.membershipCount*100:0}%`}}/></div>
            <p className="mt-5 text-[12px] leading-5 text-[#66565A]">Document presence is not the same as document validation. Renewal cohort progress requires historical eligibility data and is deliberately not estimated here.</p>
          </section>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {chart(summary.parishes,10,"Members by parish","distinct members")}
          {chart(summary.ministries,20,"Members by ministry","ministry assignments; a member may serve in several ministries")}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={panel}>
            <h2 className="text-[16px] font-semibold">Service year comparison</h2>
            <p className="mt-1 text-[12px] text-[#66565A]">Member records grouped by their stored service year; not historical membership snapshots.</p>
            <table className="mt-4 w-full text-sm"><thead><tr className="border-b border-[#E6DADC] text-left"><th className="py-2 font-medium">Service Year</th><th className="py-2 text-right font-medium">Members</th></tr></thead><tbody>{years.slice(0,8).map(y=><tr key={y} className="border-b border-[#F0E8EA]"><th scope="row" className="py-2 text-left font-normal">{y}</th><td className="py-2 text-right font-medium tabular-nums">{fmt(data.members.filter(m=>m.service_year===y).length)}</td></tr>)}</tbody></table>
            <p className="mt-4 text-xs text-[#66565A]">Verified year-end status comparisons will require historical snapshots.</p>
          </section>
          <section className={panel}>
            <div className="flex items-center justify-between gap-3"><h2 className="text-[16px] font-semibold">Recent activity</h2><Link href="/admin/audit" className="text-sm font-medium text-[#890022] underline underline-offset-2">Audit Trail</Link></div>
            <div className="mt-4 divide-y divide-[#F0E8EA]">{data.activities.length ? data.activities.map(log=><div key={log.id} className="flex items-start justify-between gap-4 py-3 text-sm"><span>{log.admin_action}</span><time dateTime={log.timestamp} className="shrink-0 text-xs text-[#66565A]">{new Date(log.timestamp).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}</time></div>):<p className="py-4 text-sm text-[#66565A]">No audit entries available.</p>}</div>
          </section>
        </div>
        <p className="text-xs leading-5 text-[#66565A]">Reporting note: member status categories are mutually exclusive here for charting, even if a person has multiple ministry statuses. The Members page remains the source for individual ministry-level decisions.</p>
      </>}
    </div>
  );
}
