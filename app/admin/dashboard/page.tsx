"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, CalendarClock, ClipboardCheck, CopyCheck, Download,
  FileCheck2, FileWarning, RefreshCw, Search, ShieldCheck,
  Upload, UserPlus, Users,
} from "@/components/phosphor-icons";
import { ebGaramond } from "@/app/fonts";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Member, MemberMinistry } from "@/lib/types";

type MemberRow = Pick<Member, "id">;
type Assignment = Pick<MemberMinistry, "member_id" | "status" | "document_url" | "expiration_date">;
type DashboardData = {
  members: MemberRow[];
  assignments: Assignment[];
  savedDuplicateFlags: number | null;
  error: string | null;
};

const EMPTY: DashboardData = {
  members: [],
  assignments: [],
  savedDuplicateFlags: null,
  error: null,
};

const fmt = (value: number) => new Intl.NumberFormat("en-PH").format(value);
const csvCell = (value: string | number) => '"' + String(value).replace(/"/g, '""') + '"';
const isVerified = (status: Assignment["status"]) => status === "New" || status === "Renewed";

function isoLocalDate(daysFromToday = 0) {
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysFromToday);
  const year = day.getFullYear();
  const month = String(day.getMonth() + 1).padStart(2, "0");
  const date = String(day.getDate()).padStart(2, "0");
  return [year, month, date].join("-");
}

export default function AdminDashboardPage() {
  const supabase = getSupabaseBrowserClient();
  const [data, setData] = useState<DashboardData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        // Count and page through all records. Never display a partially loaded
        // total as if it represented the complete registry.
        const loadAll = async <T,>(table: string, columns: string): Promise<T[]> => {
          const pageSize = 1000;
          const { count, error: countError } = await supabase
            .from(table)
            .select("id", { count: "exact", head: true });
          if (countError || count === null) {
            throw new Error(countError?.message || "Registry count unavailable for " + table);
          }
          const pages = Math.ceil(count / pageSize);
          const chunks: T[][] = new Array(pages);
          let next = 0;
          const worker = async () => {
            while (next < pages) {
              const index = next++;
              const start = index * pageSize;
              const { data: rows, error } = await supabase
                .from(table)
                .select(columns)
                .order("id", { ascending: true })
                .range(start, start + pageSize - 1);
              if (error) throw new Error(error.message);
              const expected = Math.min(pageSize, count - start);
              if ((rows ?? []).length !== expected) {
                throw new Error("Registry records changed while loading. Refresh to recalculate totals.");
              }
              chunks[index] = (rows ?? []) as T[];
            }
          };
          await Promise.all(
            Array.from({ length: Math.min(5, pages) }, () => worker())
          );
          return chunks.flat();
        };

        const [members, assignments, flags] = await Promise.all([
          loadAll<MemberRow>("members", "id"),
          loadAll<Assignment>("member_ministries", "id,member_id,status,document_url,expiration_date"),
          supabase
            .from("duplicate_flags")
            .select("id", { count: "exact", head: true })
            .eq("resolved", false),
        ]);

        if (!cancelled) {
          setData({
            members,
            assignments,
            // A missing permission must not be misrepresented as zero cases.
            savedDuplicateFlags: flags.error ? null : flags.count,
            error: null,
          });
        }
      } catch (cause) {
        if (!cancelled) {
          setData({
            ...EMPTY,
            error: cause instanceof Error ? cause.message : "Could not load registry totals.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [supabase, refresh]);

  const summary = useMemo(() => {
    const today = isoLocalDate();
    const withinThirtyDays = isoLocalDate(30);
    const memberIds = new Set(data.members.map((member) => member.id));
    const assignments = data.assignments.filter((assignment) => memberIds.has(assignment.member_id));
    const activePeople = new Set<string>();
    const pendingPeople = new Set<string>();

    let waitingForLetter = 0;
    let readyToReview = 0;
    let needsRenewal = 0;
    let missingValidity = 0;
    let verifiedMissingLetter = 0;

    for (const assignment of assignments) {
      const hasLetter = Boolean(assignment.document_url);
      const hasDate = Boolean(assignment.expiration_date);

      if (assignment.status === "Pending Verification") {
        pendingPeople.add(assignment.member_id);
        if (hasLetter) readyToReview++;
        else waitingForLetter++;
      }
      if (isVerified(assignment.status)) {
        if (!hasLetter) verifiedMissingLetter++;
        if (!hasDate) missingValidity++;
        if (hasDate && assignment.expiration_date! <= withinThirtyDays) needsRenewal++;
        // Active registration requires a verified assignment, a stored
        // recommendation letter and an explicit unexpired validity date.
        if (hasLetter && hasDate && assignment.expiration_date! >= today) {
          activePeople.add(assignment.member_id);
        }
      }
    }

    return {
      people: data.members.length,
      assignments: assignments.length,
      active: activePeople.size,
      pending: pendingPeople.size,
      waitingForLetter,
      readyToReview,
      needsRenewal,
      missingValidity,
      verifiedMissingLetter,
    };
  }, [data.members, data.assignments]);

  const downloadSummary = () => {
    const rows: (string | number)[][] = [
      ["COWL-DOK Registry Dashboard", "All service years"],
      ["Metric", "Count"],
      ["Unique people", summary.people],
      ["Ministry assignments", summary.assignments],
      ["Active members", summary.active],
      ["Members pending verification", summary.pending],
      ["Saved unresolved duplicate flags", data.savedDuplicateFlags ?? "Unavailable"],
      ["Renewal attention (assignments)", summary.needsRenewal],
      ["Pending assignments awaiting a letter", summary.waitingForLetter],
      ["Pending assignments with a letter", summary.readyToReview],
      ["Verified assignments missing an expiration date", summary.missingValidity],
      ["Verified assignments missing a letter", summary.verifiedMissingLetter],
    ];
    const file = new Blob(
      ["\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8" }
    );
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "cowl-dok-registry-overview.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const metrics = [
    {
      label: "Active Members",
      value: fmt(summary.active),
      note: "People with a verified, documented and unexpired assignment",
      icon: Users,
      accent: "#0B5C5A",
      href: "/admin/members",
      linkLabel: "View members",
    },
    {
      label: "Pending Verification",
      value: fmt(summary.pending),
      note: "People awaiting approval in at least one ministry",
      icon: ShieldCheck,
      accent: "#3B5278",
      href: "/admin/members?attention=pending",
      linkLabel: "View pending",
    },
    {
      label: "Duplicate Reviews",
      value: data.savedDuplicateFlags === null ? "—" : fmt(data.savedDuplicateFlags),
      note: "Saved unresolved flags; current CSV matches are reviewed during import",
      icon: CopyCheck,
      accent: "#890022",
      href: "/admin/import?tab=pending",
      linkLabel: "Open import reviews",
    },
    {
      label: "Renewal Attention",
      value: fmt(summary.needsRenewal),
      note: "Verified ministry assignments expired or expiring in 30 days",
      icon: CalendarClock,
      accent: "#7A4E00",
      href: "/admin/renewal-batches",
      linkLabel: "Open renewals",
    },
  ];

  const actions = [
    {
      label: "Add a Member",
      note: "Enter an individual registration",
      href: "/admin/members/add",
      icon: UserPlus,
    },
    {
      label: "Bulk Registration",
      note: "Upload and validate CSV entries",
      href: "/admin/import",
      icon: Upload,
    },
    {
      label: "Verify Members",
      note: "Review pending registrations",
      href: "/admin/verify",
      icon: ClipboardCheck,
    },
    {
      label: "Review Duplicates",
      note: "Inspect matches flagged on import",
      href: "/admin/import?tab=pending",
      icon: CopyCheck,
    },
  ];

  return (
    <div className="space-y-6 pb-8 text-[#1E1114] sm:space-y-8">
      <h1 className="sr-only">Dashboard</h1>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={ebGaramond.className + " text-[18px] font-medium uppercase tracking-[0.08em] text-[#5F4A4F]"} style={{ fontVariant: "small-caps" }}>
          Registry at a glance
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/members" className="inline-flex min-h-11 items-center gap-2 border border-[#E6DADC] bg-white px-4 text-[15px] font-medium text-[#1E1114] hover:border-[#970E24] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#970E24]">
            <Search size={17} aria-hidden="true" /> Find a Member
          </Link>
          <button type="button" onClick={downloadSummary} disabled={loading || Boolean(data.error)} className="inline-flex min-h-11 items-center gap-2 border border-[#970E24] bg-white px-4 text-[15px] font-semibold text-[#970E24] hover:bg-[#FBF3F4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#970E24] disabled:opacity-50">
            <Download size={17} aria-hidden="true" /> Export Summary
          </button>
          <button type="button" onClick={() => setRefresh((value) => value + 1)} aria-label="Refresh dashboard" className="grid h-11 w-11 place-items-center border border-[#E6DADC] bg-white text-[#890022] hover:border-[#970E24] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#970E24]">
            <RefreshCw size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      {data.error && !loading && (
        <div role="alert" className="border-l-4 border-[#B00020] bg-[#FBEFEF] px-5 py-4 text-[15px] text-[#1E1114]">
          The dashboard could not load complete registry data: {data.error}. No partial figures are shown.
        </div>
      )}
      {loading && <p role="status" className="py-8 text-[17px] text-[#5F4A4F]">Loading registry overview…</p>}

      {!loading && !data.error && (
        <>
          <section aria-label="Registry summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <Link key={metric.label} href={metric.href} className="group flex min-h-[230px] flex-col border border-[#E6DADC] border-t-[3px] bg-white px-5 py-5 transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#970E24]" style={{ borderTopColor: metric.accent }}>
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-[15px] font-semibold text-[#1E1114]">{metric.label}</span>
                    <Icon size={23} style={{ color: metric.accent }} aria-hidden="true" />
                  </div>
                  <p className={ebGaramond.className + " mt-4 text-[50px] font-medium leading-none tabular-nums"} style={{ color: metric.accent }}>
                    {metric.value}
                  </p>
                  <p className="mt-3 flex-1 text-[14px] leading-6 text-[#5F4A4F]">{metric.note}</p>
                  <span className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#970E24] group-hover:underline">
                    {metric.linkLabel} <ArrowRight size={15} aria-hidden="true" />
                  </span>
                </Link>
              );
            })}
          </section>

          {summary.people === 0 && (
            <section className="border border-[#E6DADC] bg-white p-6 sm:p-8" aria-labelledby="getting-started">
              <h2 id="getting-started" className={ebGaramond.className + " text-[34px] font-medium leading-tight sm:text-[44px]"}>
                Ready for your first registration
              </h2>
              <p className="mt-3 max-w-2xl text-[17px] leading-8 text-[#5F4A4F]">
                Start with an individual member or upload a CSV roster. New registrations should remain pending until their documents have been reviewed.
              </p>
              <Link href="/admin/members/add" className="mt-5 inline-flex min-h-11 items-center gap-2 bg-[#970E24] px-5 text-[15px] font-semibold text-white hover:bg-[#890022] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#970E24]">
                <UserPlus size={17} aria-hidden="true" /> Add First Member
              </Link>
            </section>
          )}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section className="border border-[#E6DADC] border-t-[3px] border-t-[#890022] bg-white p-5 sm:p-6" aria-labelledby="quick-actions">
              <h2 id="quick-actions" className={ebGaramond.className + " text-[34px] font-medium leading-tight sm:text-[44px]"}>
                Quick Actions
              </h2>
              <p className="mt-1 text-[16px] leading-7 text-[#5F4A4F]">The everyday tasks of managing the registry.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {actions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Link key={action.href} href={action.href} className="group flex min-h-[116px] items-start gap-3 border border-[#E6DADC] bg-[#FBF9F9] p-4 hover:border-[#970E24] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#970E24]">
                      <span className="grid h-10 w-10 shrink-0 place-items-center bg-[#F4EFEF] text-[#890022]"><Icon size={20} aria-hidden="true" /></span>
                      <span className="min-w-0">
                        <span className="block text-[16px] font-semibold text-[#1E1114]">{action.label}</span>
                        <span className="mt-1 block text-[14px] leading-6 text-[#5F4A4F]">{action.note}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>

            <section className="border border-[#E6DADC] border-t-[3px] border-t-[#890022] bg-white p-5 sm:p-6" aria-labelledby="requires-attention">
              <h2 id="requires-attention" className={ebGaramond.className + " text-[34px] font-medium leading-tight sm:text-[44px]"}>
                Requires Attention
              </h2>
              <p className="mt-1 text-[16px] leading-7 text-[#5F4A4F]">Document and verification tasks at ministry-assignment level.</p>
              <div className="mt-5 divide-y divide-[#E6DADC]">
                {[
                  { label: "Awaiting recommendation letter", count: summary.waitingForLetter, icon: FileWarning, href: "/admin/verify" },
                  { label: "Documents ready for review", count: summary.readyToReview, icon: FileCheck2, href: "/admin/verify" },
                  { label: "Verified but missing validity date", count: summary.missingValidity, icon: CalendarClock, href: "/admin/members" },
                  { label: "Verified but missing recommendation letter", count: summary.verifiedMissingLetter, icon: FileWarning, href: "/admin/members" },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.label} href={item.href} className="flex min-h-16 items-center justify-between gap-3 py-3 hover:bg-[#FBF9F9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#970E24]">
                      <span className="flex min-w-0 items-center gap-3 text-[15px] text-[#1E1114]">
                        <Icon size={19} className="shrink-0 text-[#890022]" aria-hidden="true" />
                        <span>{item.label}</span>
                      </span>
                      <span className="min-w-9 shrink-0 bg-[#F4EFEF] px-2 py-1 text-center text-[15px] font-semibold tabular-nums text-[#5F4A4F]">{fmt(item.count)}</span>
                    </Link>
                  );
                })}
              </div>
              <p className="mt-4 text-[14px] leading-6 text-[#5F4A4F]">
                Counts here represent ministry assignments. A person serving in two ministries may need two separate reviews.
              </p>
            </section>
          </div>
          <div className="flex flex-col gap-2 border-t border-[#E6DADC] pt-4 text-[14px] leading-6 text-[#5F4A4F] sm:flex-row sm:items-start sm:justify-between">
            <p className="max-w-3xl">
              An active member is counted only when an assignment is verified, has a stored recommendation letter and has a known unexpired validity date. Pending and active counts can overlap when different ministries have different statuses. The duplicate figure covers saved flags only; CSV staging reviews are not yet a persistent unified queue.
            </p>
            <Link href="/admin/audit" className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-[#0B5C5A] underline-offset-4 hover:underline">
              View Audit Trail <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
