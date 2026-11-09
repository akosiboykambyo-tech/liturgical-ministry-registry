"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, ClipboardCheck, FileCheck2, Files, GitMerge, History,
  Plus, RefreshCw, ShieldCheck, Upload, Users, X,
} from "@/components/phosphor-icons";
import { ebGaramond } from "@/app/fonts";
import { CenteredAdminLoader } from "@/components/admin-centered-loader";
import { SubmissionsOverview } from "./submissions-overview";
import { registrationUi } from "./registration-ui";
import { UnifiedReviewOverview } from "./review-overview";
import RenewalBatchPreparationPage from "@/app/admin/renewal-batches/page";
import CsvImportPage from "@/app/admin/import/page";
import { CsvImportWorkspaceContext, type CsvImportTab } from "@/lib/verification-workspace-context";
import { RegistrationEmbeddedContext, RegistrationReviewSearchContext } from "@/lib/registration-embedded-context";
import QuickScanMatrixPage from "@/app/admin/verify/page";
import RenewalReviewsPage from "@/app/admin/renewal-reviews/page";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type WorkspaceView = "submissions" | "reviews" | "history";
type SubmissionKind = "new" | "renewal";
type ReviewKind = "all" | "approvals" | "duplicates" | "renewal";
type HistoryKind = "registration" | "renewal";

const VIEWS: Array<{ key: WorkspaceView; label: string; icon: typeof Files }> = [
  { key: "submissions", label: "Submissions", icon: Files },
  { key: "reviews", label: "Review Queue", icon: ClipboardCheck },
  { key: "history", label: "History", icon: History },
];

const REVIEW_FILTERS: Array<{ key: ReviewKind; label: string; icon: typeof Files }> = [
  { key: "all", label: "All cases", icon: ClipboardCheck },
  { key: "approvals", label: "Member Approvals", icon: Users },
  { key: "duplicates", label: "Duplicate Checks", icon: GitMerge },
  { key: "renewal", label: "Renewal Exceptions", icon: FileCheck2 },
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
    <section className={registrationUi.panel}>
      <h3 className={ebGaramond.className + " text-[30px] font-medium text-[#27191D]"}>Registration imports</h3>
      <p className="mt-1 text-sm text-[#66575C]">
        The latest 30 recorded CSV import batches. Detailed administrator actions remain in the Audit Trail.
      </p>
      {loading ? (
        <CenteredAdminLoader label="Loading registration history…" className="min-h-[200px]" />
      ) : error ? (
        <p className="mt-4 text-sm text-[#A32439]" role="alert">History unavailable: {error}</p>
      ) : rows.length === 0 ? (
        <div className={"mt-4 " + registrationUi.empty}>
          <p className="text-sm font-medium text-[#35262D]">No completed registration imports yet.</p>
          <p className="mt-1 text-xs text-[#66575C]">Imported CSV batches will appear here when recorded.</p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[650px] border-collapse text-left text-sm">
            <thead className="border-b border-[#E6DADC] bg-[#FBF9F9] text-xs uppercase tracking-wide text-[#66575C]">
              <tr>
                <th className="p-3">Date</th><th className="p-3">CSV file</th>
                <th className="p-3">Rows</th><th className="p-3">Imported</th>
                <th className="p-3">Flagged</th><th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className="border-b border-[#EEE5E7]">
                  <td className="p-3 whitespace-nowrap">{new Date(row.created_at).toLocaleDateString("en-PH")}</td>
                  <td className="p-3 break-all">{row.file_name || "Unnamed CSV"}</td>
                  <td className="p-3 tabular-nums">{row.row_count}</td>
                  <td className="p-3 tabular-nums">{row.unique_inserted}</td>
                  <td className="p-3 tabular-nums">{row.duplicates_routed}</td>
                  <td className="p-3">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function VerificationWorkspacePage() {
  const [view, setView] = useState<WorkspaceView>("submissions");
  const [submissionKind, setSubmissionKind] = useState<SubmissionKind>("new");
  const [reviewKind, setReviewKind] = useState<ReviewKind>("all");
  const [reviewSearch, setReviewSearch] = useState("");
  const [pendingDuplicateCount, setPendingDuplicateCount] = useState(0);
  const [historyKind, setHistoryKind] = useState<HistoryKind>("registration");
  const [newSubmissionOpen, setNewSubmissionOpen] = useState(false);
  const [intakeActive, setIntakeActive] = useState(false);
  const [advancedRosterOpen, setAdvancedRosterOpen] = useState(false);
  const [criticalOperation, setCriticalOperation] = useState(false);
  const [navigationNotice, setNavigationNotice] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("tab");
    if (requested === "reviews" || requested === "history" || requested === "submissions") {
      setView(requested);
    } else if (requested === "renewals") {
      setView("submissions");
      setSubmissionKind("renewal");
      setIntakeActive(true);
    } else if (requested === "registrations") {
      setView("submissions");
      setSubmissionKind("new");
      setIntakeActive(true);
    }
    if (params.get("mode") === "intake") setIntakeActive(true);
    if (params.get("advanced") === "1") {
      setView("submissions"); setSubmissionKind("renewal"); setIntakeActive(true); setAdvancedRosterOpen(true);
    }
    const kind = params.get("type");
    if (kind === "new" || kind === "renewal") setSubmissionKind(kind);
    const category = params.get("view");
    if (category === "all" || category === "approvals" || category === "duplicates" || category === "renewal") {
      setReviewKind(category);
    }
    if (category === "registration" || category === "renewal") {
      setHistoryKind(category);
    }
  }, []);

  useEffect(() => {
    if (!criticalOperation) return;
    const preventExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventExit);
    return () => window.removeEventListener("beforeunload", preventExit);
  }, [criticalOperation]);

  const onCriticalOperationChange = useCallback((active: boolean) => {
    setCriticalOperation(active);
  }, []);

  const startIntake = (kind: SubmissionKind) => {
    if (criticalOperation) {
      setNavigationNotice("Finish the current processing operation before starting another submission.");
      return;
    }
    setNewSubmissionOpen(false);
    setView("submissions");
    setSubmissionKind(kind);
    setIntakeActive(true);
    setNavigationNotice("");
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "submissions");
    url.searchParams.set("type", kind);
    url.searchParams.set("mode", "intake");
    url.searchParams.delete("view");
    url.searchParams.delete("advanced");
    window.history.replaceState(window.history.state, "", url.pathname + url.search);
  };

  // Keep the existing importer mounted so session-staged duplicate data remains available.
  const navigate = (next: WorkspaceView, selection?: string, fromImport = false) => {
    if (criticalOperation && !fromImport) {
      setNavigationNotice("A registration or renewal operation is still running. Complete it before changing tasks.");
      return;
    }
    setNavigationNotice("");
    setView(next);
    if (next === "submissions") setIntakeActive(false);
    if (next !== "submissions") setAdvancedRosterOpen(false);
    if (next === "submissions" && (selection === "new" || selection === "renewal")) {
      setSubmissionKind(selection);
    }
    if (next === "reviews" && (selection === "all" || selection === "approvals" || selection === "duplicates" || selection === "renewal")) {
      setReviewKind(selection);
    }
    if (next === "history" && (selection === "registration" || selection === "renewal")) {
      setHistoryKind(selection);
    }

    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    url.searchParams.delete("view");
    url.searchParams.delete("type");
    url.searchParams.delete("mode");
    url.searchParams.delete("advanced");
    if (next === "submissions") {
      url.searchParams.set("type", selection === "new" || selection === "renewal" ? selection : submissionKind);
    } else if (next === "reviews") {
      url.searchParams.set("view", selection === "all" || selection === "approvals" || selection === "duplicates" || selection === "renewal" ? selection : reviewKind);
    } else {
      url.searchParams.set("view", selection === "registration" || selection === "renewal" ? selection : historyKind);
    }
    window.history.replaceState(window.history.state, "", url.pathname + url.search);
  };

  const onImportTabChange = (next: CsvImportTab) => {
    if (next === "import") startIntake("new");
    if (next === "renewal") startIntake("renewal");
    if (next === "history") navigate("history", "renewal", true);
    if (next === "pending") navigate("reviews", "duplicates", true);
  };

  const csvTab: CsvImportTab =
    view === "submissions" ? (submissionKind === "new" ? "import" : "renewal") :
    view === "history" ? "history" : "pending";
  const showCsv = (view === "submissions" && intakeActive) ||
    (view === "history" && historyKind === "renewal") ||
    (view === "reviews" && reviewKind === "duplicates");

  return (
    <div className="min-w-0 space-y-6 pb-10 text-[#1E1114]">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#890022]">MEMBER MANAGEMENT</p>
        <h1 className={ebGaramond.className + " mt-1 text-[42px] font-medium leading-none sm:text-[48px]"}>Registration</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5F4A4F]">
          Review registrations, process renewals, and manage member verification.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2 border-b border-[#E6DADC] pb-3" aria-label="Registration workspace">
        {VIEWS.map(entry => {
          const Icon = entry.icon;
          const selected = view === entry.key;
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => navigate(entry.key)}
              aria-current={selected ? "page" : undefined}
              aria-disabled={criticalOperation && !selected}
              className={"inline-flex min-h-11 items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#970E24] " +
                (selected ? "bg-[#890022] text-white" : "border border-[#E6DADC] bg-white text-[#890022] hover:bg-[#FBF3F4]")}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />{entry.label}
            </button>
          );
        })}
      </nav>

      {navigationNotice && (
        <p role="alert" className={registrationUi.caution}>
          {navigationNotice}
        </p>
      )}

      {view === "submissions" && (
        <section className="space-y-5" aria-label="Parish submissions">
          {!intakeActive ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className={ebGaramond.className + " text-[30px] font-medium leading-tight"}>Parish Submissions</h2>
                  <p className="mt-1 text-sm text-[#5F4A4F]">Prepare a new parish roster or review previously recorded batches.</p>
                </div>
                <button type="button" disabled={criticalOperation} onClick={() => setNewSubmissionOpen(true)}
                  className={registrationUi.primary}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> New submission
                </button>
              </div>
              <SubmissionsOverview
                disabled={criticalOperation}
                onStart={startIntake}
                onHistory={(kind) => navigate("history", kind)}
              />
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <button type="button" onClick={() => navigate("submissions")}
                    className="mb-2 inline-flex items-center gap-2 text-xs font-semibold text-[#890022] hover:underline">
                    <ArrowRight className="h-3.5 w-3.5 rotate-180" aria-hidden="true" /> Back to submissions
                  </button>
                  <h2 className={ebGaramond.className + " text-[30px] font-medium leading-tight"}>
                    {submissionKind === "new" ? "New Registration" : "Parish Recommendation Renewal"}
                  </h2>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-[#5F4A4F]">
                    {submissionKind === "new"
                      ? "Upload and validate a parish roster. Confirmed imports currently create Pending Verification records."
                      : "Upload the existing parish roster and signed recommendation letter, then review eligible ministry assignments."}
                  </p>
                </div>
                {submissionKind === "renewal" && (
                  <button type="button" onClick={() => setAdvancedRosterOpen(true)}
                    className={registrationUi.secondary}>
                    <Users className="h-4 w-4" aria-hidden="true" /> Prepare roster manually
                  </button>
                )}
              </div>
              {submissionKind === "new" && (
                <p className={registrationUi.info}>
                  <strong>Current processing rule:</strong> The import is not a persistent draft. The final confirmation writes Pending Verification records.
                  The proposed save-draft → review → authorize workflow requires a separate audited backend implementation.
                </p>
              )}
            </>
          )}
        </section>
      )}

      {view === "reviews" && (
        <section className="space-y-4" aria-label="Registration review queue">
          <div>
            <h2 className={ebGaramond.className + " text-[30px] font-medium leading-tight"}>Review Queue</h2>
            <p className="mt-1 text-sm text-[#5F4A4F]">
              Review member approvals, staged duplicate checks, and saved renewal exceptions from one location.
            </p>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Case type filters">
            {REVIEW_FILTERS.map(entry => {
              const Icon = entry.icon;
              return (
                <button key={entry.key} type="button" onClick={() => { setReviewSearch(""); navigate("reviews", entry.key); }}
                  aria-pressed={reviewKind === entry.key}
                  className={"inline-flex min-h-11 items-center gap-2 border px-3 py-2 text-sm font-semibold " +
                    (reviewKind === entry.key ? "border-[#890022] bg-[#890022] text-white" : "border-[#E6DADC] bg-white text-[#890022] hover:bg-[#FBF3F4]")}>
                  <Icon className="h-4 w-4" aria-hidden="true" />{entry.label}
                </button>
              );
            })}
          </div>
          {reviewKind === "duplicates" && (
            <p className={registrationUi.caution}>
              Registration import duplicate cases are retained in this browser session only.
              Saved renewal exceptions use the existing persistent review queue.
            </p>
          )}
        </section>
      )}

      {view === "history" && (
        <section className="space-y-4" aria-label="Registration history">
          <div>
            <h2 className={ebGaramond.className + " text-[30px] font-medium leading-tight"}>History</h2>
            <p className="mt-1 text-sm text-[#5F4A4F]">Separate registration and renewal histories, available in one workspace.</p>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="History type">
            <button type="button" onClick={() => navigate("history", "registration")} aria-pressed={historyKind === "registration"}
              className={"min-h-11 border px-4 py-2 text-sm font-semibold " + (historyKind === "registration" ? "border-[#890022] bg-[#890022] text-white" : "border-[#E6DADC] bg-white text-[#6A5960]")}>
              Registration
            </button>
            <button type="button" onClick={() => navigate("history", "renewal")} aria-pressed={historyKind === "renewal"}
              className={"min-h-11 border px-4 py-2 text-sm font-semibold " + (historyKind === "renewal" ? "border-[#890022] bg-[#890022] text-white" : "border-[#E6DADC] bg-white text-[#6A5960]")}>
              Renewal
            </button>
          </div>
          {historyKind === "registration" && <RegistrationImportHistory />}
        </section>
      )}

      {view === "reviews" && reviewKind === "all" && (
        <UnifiedReviewOverview
          pendingDuplicateCount={pendingDuplicateCount}
          onOpen={(kind, memberSearch = "") => {
            setReviewSearch(memberSearch);
            navigate("reviews", kind);
          }}
        />
      )}
      {view === "reviews" && reviewKind !== "all" && (
        <button type="button" className="inline-flex items-center gap-2 text-xs font-semibold text-[#890022] hover:underline"
          onClick={() => { setReviewSearch(""); navigate("reviews", "all"); }}>
          <ArrowRight className="h-3.5 w-3.5 rotate-180" aria-hidden="true" /> Back to all cases
        </button>
      )}

      {/* Preserve the single live CSV component instance across view changes:
          session-only duplicate review data must not be discarded. */}
      <div hidden={!showCsv} aria-hidden={!showCsv} className={showCsv ? "min-w-0" : ""}>
        <CsvImportWorkspaceContext.Provider value={{
          embedded: true,
          workspaceTab: csvTab,
          onWorkspaceTabChange: onImportTabChange,
          onCriticalOperationChange,
          onPendingDuplicateCountChange: setPendingDuplicateCount,
        }}>
          <CsvImportPage />
        </CsvImportWorkspaceContext.Provider>
      </div>

      <RegistrationEmbeddedContext.Provider value={true}>
        <RegistrationReviewSearchContext.Provider value={reviewSearch}>
          {view === "reviews" && reviewKind === "approvals" && <QuickScanMatrixPage />}
          {view === "reviews" && reviewKind === "renewal" && <RenewalReviewsPage />}
        </RegistrationReviewSearchContext.Provider>
      </RegistrationEmbeddedContext.Provider>

      {advancedRosterOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[#210F16]/60" onMouseDown={event => {
          if (event.target === event.currentTarget) setAdvancedRosterOpen(false);
        }}>
          <section role="dialog" aria-modal="true" aria-label="Advanced renewal roster preparation"
            className="h-full w-full max-w-[1020px] overflow-y-auto bg-[#FBF9F9] px-4 py-5 shadow-2xl sm:px-7 sm:py-7">
            <div className="mb-5 flex items-start justify-between gap-3 border-b border-[#E6DADC] pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#890022]">REGISTRATION · ADVANCED TOOL</p>
                <h2 className={ebGaramond.className + " mt-1 text-[30px] font-medium leading-tight"}>Prepare Renewal Roster</h2>
                <p className="mt-1 text-sm text-[#5F4A4F]">Select existing registry members and export a draft CSV without changing member records.</p>
              </div>
              <button type="button" onClick={() => setAdvancedRosterOpen(false)}
                aria-label="Close renewal roster preparation"
                className="rounded-md p-2 text-[#785762] hover:bg-[#F7EFF1]">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <RegistrationEmbeddedContext.Provider value={true}>
              <RenewalBatchPreparationPage />
            </RegistrationEmbeddedContext.Provider>
          </section>
        </div>
      )}

      {newSubmissionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#210F16]/60 p-4"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setNewSubmissionOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-label="Choose submission type"
            className="w-full max-w-lg border border-[#E6DADC] bg-white p-5 shadow-xl sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#890022]">MEMBER MANAGEMENT</p>
                <h2 className={ebGaramond.className + " mt-1 text-3xl"}>New Submission</h2>
                <p className="mt-2 text-sm text-[#5F4A4F]">Choose the existing administrative process to open.</p>
              </div>
              <button type="button" onClick={() => setNewSubmissionOpen(false)} aria-label="Close submission chooser"
                className="rounded-md p-2 text-[#785762] hover:bg-[#F7EFF1]">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {([
                { kind: "new" as const, label: "New Registration", description: "Process a parish CSV roster as pending registrations.", icon: Upload },
                { kind: "renewal" as const, label: "Renewal", description: "Review an existing parish roster for ministry renewals.", icon: RefreshCw },
              ]).map(item => {
                const Icon = item.icon;
                return (
                  <button type="button" key={item.kind} onClick={() => {
                      setNewSubmissionOpen(false);
                      startIntake(item.kind);
                    }}
                    className="flex min-h-[140px] flex-col gap-2 border border-[#E6DADC] bg-[#FBF9F9] p-4 text-left hover:border-[#970E24] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#970E24]">
                    <Icon className="h-6 w-6 text-[#890022]" aria-hidden="true" />
                    <span className="font-semibold text-[#28191E]">{item.label}</span>
                    <span className="text-xs leading-5 text-[#5F4A4F]">{item.description}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-4 text-xs leading-5 text-[#5F4A4F]">
              Your selection opens a dedicated CSV intake screen. No registry records are created until you explicitly confirm processing.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
