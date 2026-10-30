"use client";

import { useEffect, useState } from "react";
import SeasonGridWorkspace from "@/components/season-grid-workspace";
import Link from "next/link";
import { ClipboardCheck, FileCheck2, GitMerge, History, RefreshCw, Upload, Users } from "lucide-react";
import { ebGaramond } from "@/app/fonts";
import { CenteredAdminLoader } from "@/components/admin-centered-loader";
import CsvImportPage from "@/app/admin/import/page";
import { CsvImportWorkspaceContext, type CsvImportTab } from "@/lib/verification-workspace-context";
import QuickScanMatrixPage from "@/app/admin/verify/page";
import RenewalReviewsPage from "@/app/admin/renewal-reviews/page";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type WorkspaceTab = "registrations" | "renewals" | "reviews" | "history";
type ReviewView = "approvals" | "duplicates" | "renewal";

const WORKSPACE_TABS: Array<{
  key: WorkspaceTab;
  label: string;
  description: string;
  icon: typeof Upload;
}> = [
  { key: "registrations", label: "New Registrations", description: "Upload rosters and review new registrations.", icon: Upload },
  { key: "renewals", label: "Renewals", description: "Process returning members and their recommendation letters.", icon: RefreshCw },
  { key: "reviews", label: "Pending Review", description: "Approve members and resolve registration exceptions.", icon: ClipboardCheck },
  { key: "history", label: "History", description: "Review registration imports and completed renewal batches.", icon: History },
];

type ImportHistoryRow = {
  id: string;
  file_name: string | null;
  row_count: number;
  unique_inserted: number;
  duplicates_routed: number;
  status: string;
  created_at: string;
};

function RegistrationImportHistory() {
  const supabase = getSupabaseBrowserClient();
  const [rows, setRows] = useState<ImportHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const result = await supabase
        .from("import_batches")
        .select("id,file_name,row_count,unique_inserted,duplicates_routed,status,created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (cancelled) return;
      setError(result.error?.message ?? null);
      setRows(result.error ? [] : ((result.data ?? []) as ImportHistoryRow[]));
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [supabase]);

  return (
    <section className="border border-[#E6DADC] border-t-[3px] border-t-[#890022] bg-white p-4 sm:p-6">
      <h2 className="text-xl font-semibold text-[#27191D]">New registration imports</h2>
      <p className="mt-1 text-sm text-[#66575C]">Latest 30 saved CSV import batches. Audit Trail retains the detailed history.</p>
      {loading ? (
        <CenteredAdminLoader label="Loading registration history…" className="min-h-[260px]" />
      ) : error ? (
        <p className="mt-4 text-sm text-[#A32439]" role="alert">Registration history unavailable: {error}</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-[#66575C]">No saved registration batches yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-left text-sm">
            <thead className="border-b border-[#E6DADC] text-[#66575C]">
              <tr><th className="py-2 pr-4">Date</th><th className="py-2 pr-4">CSV file</th><th className="py-2 pr-4">Rows</th><th className="py-2 pr-4">Imported</th><th className="py-2 pr-4">Flagged</th><th className="py-2">Status</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-[#EEE5E7]">
                  <td className="py-3 pr-4 whitespace-nowrap">{new Date(row.created_at).toLocaleDateString("en-PH")}</td>
                  <td className="py-3 pr-4 break-all">{row.file_name || "Unnamed CSV"}</td>
                  <td className="py-3 pr-4 tabular-nums">{row.row_count}</td>
                  <td className="py-3 pr-4 tabular-nums">{row.unique_inserted}</td>
                  <td className="py-3 pr-4 tabular-nums">{row.duplicates_routed}</td>
                  <td className="py-3">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function LegacyVerificationWorkspacePage() {
  const [tab, setTab] = useState<WorkspaceTab>("registrations");
  const [reviewView, setReviewView] = useState<ReviewView>("approvals");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("tab");
    if (requested === "registrations" || requested === "renewals" || requested === "reviews" || requested === "history") {
      setTab(requested);
    }
    const view = params.get("view");
    if (view === "approvals" || view === "duplicates" || view === "renewal") setReviewView(view);
  }, []);

  const navigate = (nextTab: WorkspaceTab, nextView?: ReviewView) => {
    setTab(nextTab);
    if (nextView) setReviewView(nextView);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    if (nextTab === "reviews") url.searchParams.set("view", nextView ?? reviewView);
    else url.searchParams.delete("view");
    window.history.replaceState(window.history.state, "", url.pathname + url.search);
  };

  const onImportTabChange = (next: CsvImportTab) => {
    if (next === "import") navigate("registrations");
    if (next === "renewal") navigate("renewals");
    if (next === "history") navigate("history");
    if (next === "pending") navigate("reviews", "duplicates");
  };

  // Keep this one import component mounted across tabs: its staged duplicate
  // results exist in browser state and must survive switching to Pending Review.
  const csvTab: CsvImportTab =
    tab === "registrations" ? "import" :
    tab === "renewals" ? "renewal" :
    tab === "history" ? "history" : "pending";
  const showCsv = tab !== "reviews" || reviewView === "duplicates";

  return (
    <div className="space-y-5 pb-10 text-[#1E1114]">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#890022]">Member Registration Desk</p>
        <h1 className={ebGaramond.className + " mt-1 text-[42px] font-medium leading-none sm:text-[48px]"}>Verification</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6B5C62]">
          Process member rosters, recommendation letters, approvals, and exceptions from one workspace.
          New registrations remain pending until verified.
        </p>
      </header>

      <nav className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Verification workflow">
        {WORKSPACE_TABS.map((entry) => {
          const Icon = entry.icon;
          const selected = tab === entry.key;
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => navigate(entry.key)}
              aria-current={selected ? "page" : undefined}
              className={"flex min-h-[92px] items-start gap-3 border border-t-[3px] p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#970E24] " +
                (selected ? "border-[#890022] bg-[#FBF3F5]" : "border-[#E6DADC] bg-white hover:border-[#A96A77]")}
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#890022]" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{entry.label}</span>
                <span className="mt-1 block text-xs leading-5 text-[#6B5C62]">{entry.description}</span>
              </span>
            </button>
          );
        })}
      </nav>

      {tab === "renewals" && (
        <p className="border-l-[3px] border-[#890022] bg-[#F8F1F3] px-4 py-3 text-sm leading-6 text-[#5D3540]">
          Renewal processing is available below. To prepare a draft roster without applying changes,{" "}
          <Link href="/admin/renewal-batches" className="font-semibold underline">open the existing draft batch desk</Link>.
        </p>
      )}

      {tab === "reviews" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2" aria-label="Review categories">
            {([
              { key: "approvals" as const, label: "Member Approvals", icon: Users },
              { key: "duplicates" as const, label: "Duplicate Checks", icon: GitMerge },
              { key: "renewal" as const, label: "Renewal Exceptions", icon: FileCheck2 },
            ]).map((view) => {
              const Icon = view.icon;
              return (
                <button
                  key={view.key}
                  type="button"
                  onClick={() => navigate("reviews", view.key)}
                  aria-pressed={reviewView === view.key}
                  className={"inline-flex min-h-11 items-center gap-2 border px-4 py-2 text-sm font-semibold " +
                    (reviewView === view.key ? "border-[#890022] bg-[#890022] text-white" : "border-[#D9C9CC] bg-white text-[#890022] hover:bg-[#FBF3F5]")}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {view.label}
                </button>
              );
            })}
          </div>
          {reviewView === "duplicates" && (
            <p className="text-sm leading-6 text-[#6B5C62]">
              Review duplicate entries staged during this import session. For saved duplicate flags,{" "}
              <Link href="/admin/duplicate-review-preview" className="font-semibold text-[#890022] underline">open the existing duplicate queue preview</Link>.
            </p>
          )}
        </div>
      )}

      {tab === "history" && <RegistrationImportHistory />}

      <div hidden={!showCsv} aria-hidden={!showCsv}>
        <CsvImportWorkspaceContext.Provider value={{
          embedded: true,
          workspaceTab: csvTab,
          onWorkspaceTabChange: onImportTabChange,
        }}>
          <CsvImportPage />
        </CsvImportWorkspaceContext.Provider>
      </div>

      {tab === "reviews" && reviewView === "approvals" && <QuickScanMatrixPage />}
      {tab === "reviews" && reviewView === "renewal" && <RenewalReviewsPage />}
    </div>
  );
}


// The new workflow remains disabled until private season RPC authorization is approved.
export default function VerificationWorkspacePage() {
  return process.env.NEXT_PUBLIC_SEASON_GRID_ENABLED === "enabled"
    ? <SeasonGridWorkspace />
    : <LegacyVerificationWorkspacePage />;
}
