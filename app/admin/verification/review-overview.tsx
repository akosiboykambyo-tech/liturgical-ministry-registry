"use client";

import { useEffect, useMemo, useState } from "react";
import { ebGaramond } from "@/app/fonts";
import { ArrowRight, ClipboardCheck, FileCheck2, GitMerge, Search, Users } from "@/components/phosphor-icons";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { listRenewalReviews } from "@/lib/renewal-review-queue";

type CaseKind = "approvals" | "duplicates" | "renewal";
type ReviewCase = {
  id: string; kind: CaseKind; title: string; parish: string; description: string;
  search: string; created: string;
};
type PendingMember = { id: string; first_name: string; last_name: string; parish: string; created_at: string };

const names: Record<CaseKind,string> = {
  approvals: "Member approval",
  duplicates: "Duplicate check",
  renewal: "Renewal exception",
};

export function UnifiedReviewOverview({
  onOpen, pendingDuplicateCount = 0,
}: {
  onOpen: (kind: CaseKind, search?: string) => void;
  pendingDuplicateCount?: number;
}) {
  const [approvalCases, setApprovalCases] = useState<ReviewCase[]>([]);
  const [renewalCases, setRenewalCases] = useState<ReviewCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const supabase = getSupabaseBrowserClient();
      const [membersResult, renewalsResult] = await Promise.allSettled([
        supabase.from("members")
          .select("id,first_name,last_name,parish,created_at")
          .eq("status", "Pending Verification")
          .order("created_at", { ascending: false })
          .limit(100),
        listRenewalReviews("open"),
      ]);
      if (cancelled) return;
      const problems: string[] = [];
      if (membersResult.status === "fulfilled" && !membersResult.value.error) {
        setApprovalCases(((membersResult.value.data ?? []) as PendingMember[]).map(m => ({
          id: m.id, kind: "approvals" as const, title: m.first_name + " " + m.last_name,
          parish: m.parish, description: "Pending registration verification",
          search: m.first_name + " " + m.last_name, created: m.created_at,
        })));
      } else {
        problems.push("Member approval cases are unavailable. Use Member Approvals to retry.");
      }
      if (renewalsResult.status === "fulfilled") {
        setRenewalCases(renewalsResult.value.map(r => ({
          id: r.id, kind: "renewal" as const, title: r.first_name + " " + r.last_name,
          parish: r.parish, description: r.reason.replace(/_/g, " "),
          search: r.first_name + " " + r.last_name, created: r.created_at,
        })));
      } else {
        problems.push("Saved renewal exceptions could not be loaded. Use Renewal Exceptions to check permissions or retry.");
      }
      setErrors(problems);
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const cases = useMemo(() => [...approvalCases, ...renewalCases].sort(
    (a,b) => b.created.localeCompare(a.created)
  ).filter(c => (c.title+" "+c.parish+" "+c.description+" "+names[c.kind])
    .toLowerCase().includes(search.toLowerCase())),[approvalCases,renewalCases,search]);

  return <section className="min-w-0 space-y-4" aria-label="Open review cases">
    <div className="grid gap-3 sm:grid-cols-3">
      {([
        { kind: "approvals" as const, icon: Users, count: approvalCases.length, caption: "Pending verification" },
        { kind: "renewal" as const, icon: FileCheck2, count: renewalCases.length, caption: "Saved open exceptions" },
        { kind: "duplicates" as const, icon: GitMerge, count: pendingDuplicateCount, caption: "Current import session" },
      ]).map(item => {
        const Icon = item.icon;
        return <button key={item.kind} type="button" onClick={() => onOpen(item.kind)}
          className="flex items-start justify-between gap-3 rounded-md border border-[#E6DADC] bg-white p-4 text-left hover:border-[#B88694] hover:bg-[#FEFAFB]">
          <div><p className="text-xs font-semibold text-[#67545C]">{names[item.kind]}</p>
            <p className={ebGaramond.className+" mt-1 text-[29px] font-medium tabular-nums"}>{loading && item.kind !== "duplicates" ? "…" : item.count}</p>
            <p className="mt-1 text-xs text-[#74616A]">{item.caption}</p>
          </div>
          <Icon className="h-5 w-5 text-[#890022]" aria-hidden="true"/>
        </button>;
      })}
    </div>
    {errors.map(error => <p role="alert" key={error} className="rounded-md border border-[#E3D0D5] bg-[#FBF3F5] px-4 py-3 text-xs text-[#7B3548]">{error}</p>)}
    <div className="rounded-md border border-[#E6DADC] bg-white p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className={ebGaramond.className+" text-[27px] font-medium"}>Open Cases</h3>
          <p className="mt-1 text-sm text-[#6B5C62]">Registration approvals and persistent renewal exceptions, together in one list.</p>
        </div>
        <label className="relative block w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#846E77]" aria-hidden="true"/>
          <span className="sr-only">Search review cases</span>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            className="min-h-10 w-full rounded-md border border-[#DCCFD3] bg-white py-2 pl-9 pr-3 text-sm focus:border-[#890022] focus:outline-none"
            placeholder="Search open cases"/>
        </label>
      </div>
      {loading ? <p role="status" className="py-6 text-sm text-[#6B5C62]">Loading review cases…</p> :
      cases.length === 0 ? <div className="rounded-md border border-dashed border-[#DCCFD3] px-4 py-6">
        <p className="text-sm font-medium">No matching open cases.</p>
        <p className="mt-1 text-xs text-[#6B5C62]">Try a different search or open a review category to inspect its full history.</p>
      </div> :
      <div className="overflow-x-auto">
        <table className="w-full min-w-[670px] text-left text-sm">
          <thead className="border-y border-[#E6DADC] bg-[#FBF9F9] text-xs uppercase tracking-wide text-[#6B5C62]">
            <tr><th className="p-3">Member / parish</th><th className="p-3">Case type</th><th className="p-3">Reason</th><th className="p-3">Action</th></tr>
          </thead>
          <tbody>{cases.map(item=><tr key={item.kind+item.id} className="border-b border-[#EEE5E7]">
            <td className="px-3 py-3"><p className="font-semibold">{item.title}</p><p className="mt-1 text-xs text-[#74616A]">{item.parish}</p></td>
            <td className="px-3 py-3 text-[#4D3540]">{names[item.kind]}</td>
            <td className="px-3 py-3 text-xs text-[#6B5C62]">{item.description}</td>
            <td className="px-3 py-3"><button type="button" onClick={()=>onOpen(item.kind,item.search)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#890022] hover:underline">Review <ArrowRight className="h-3.5 w-3.5"/></button></td>
          </tr>)}</tbody>
        </table>
      </div>}
      {approvalCases.length >= 100 && <p className="mt-3 text-xs text-[#7C5966]">Showing the latest 100 pending approvals here; open Member Approvals for the full processing interface.</p>}
      {renewalCases.length >= 500 && <p className="mt-3 text-xs text-[#7C5966]">Renewal review source currently limits results to 500; server pagination remains a later backend requirement.</p>}
      <div className="mt-4 rounded-md bg-[#F8F3F5] px-4 py-3 text-xs leading-5 text-[#70545F]">
        Registration import duplicates are still temporary in the active browser session. They are handled under Duplicate Checks until the persistent queue is implemented.
      </div>
    </div>
  </section>;
}
