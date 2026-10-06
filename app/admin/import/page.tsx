"use client";

import { useState, useRef, useCallback } from "react";
import Papa from "papaparse";
import {
  stageBatchRecords,
  importMemberBatch,
  type BatchResult,
  type IncomingRecord,
  type StagedDuplicate,
  type DuplicateMatchType,
} from "@/lib/duplicate-check";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { MINISTRIES, PARISHES, shortMinistry } from "@/lib/constants";
import type { Member, MemberMinistry, MemberStatus } from "@/lib/types";
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Download,
  X,
  GitMerge,
  UserCheck,
  UserX,
  Trash2,
  ArrowRight,
  Inbox,
  Layers,
  ShieldAlert,
  Copy,
} from "lucide-react";

const MAX_ROWS = 3000;
const BATCH_SIZE = 500;
const RESULTS_PREVIEW_LIMIT = 50;

interface ParsedRow {
  first_name: string;
  last_name: string;
  parish: string;
  ministry: string;
}

interface RowResult {
  row: number;
  name: string;
  status: "created" | "duplicate" | "error";
  message: string;
}

interface ImportSummary {
  created: number;
  duplicates: number;
  errors: number;
  total: number;
}

interface Progress {
  current: number;
  total: number;
  phase: string;
}

type Tab = "import" | "pending";

function normalizeMinistries(raw: string): string[] {
  const ministries: string[] = [];
  for (const part of raw.split(/[;,/]+/)) {
    const clean = part.trim();
    if (!clean) continue;
    const match = MINISTRIES.find(
      (m) =>
        m.toLowerCase() === clean.toLowerCase() ||
        shortMinistry(m).toLowerCase() === clean.toLowerCase()
    );
    ministries.push(match ?? `Other (${clean})`);
  }
  return ministries.length > 0 ? ministries : ["Other"];
}

async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getMatchTypeBadge(matchType: DuplicateMatchType): {
  label: string;
  className: string;
  icon: typeof AlertTriangle;
} {
  switch (matchType) {
    case "exact":
      return {
        label: "Exact Match (DB)",
        className: "bg-rose-50 text-rose-700 ring-rose-600/20",
        icon: AlertTriangle,
      };
    case "same_name_different_parish":
      return {
        label: "Same Name, Different Parish (DB)",
        className: "bg-amber-50 text-amber-700 ring-amber-600/20",
        icon: AlertTriangle,
      };
    case "similar_name":
      return {
        label: "Similar Name — Possible Misspelling (DB)",
        className: "bg-sky-50 text-sky-700 ring-sky-600/20",
        icon: AlertTriangle,
      };
    case "internal_batch_exact":
      return {
        label: "Duplicate Within This CSV (Exact)",
        className: "bg-violet-50 text-violet-700 ring-violet-600/20",
        icon: Copy,
      };
    case "internal_batch_fuzzy":
      return {
        label: "Duplicate Within This CSV (Fuzzy)",
        className: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
        icon: Copy,
      };
    default:
      return {
        label: "Potential Duplicate",
        className: "bg-muted text-muted-foreground ring-border",
        icon: AlertTriangle,
      };
  }
}

export default function CsvImportPage() {
  const supabase = getSupabaseBrowserClient();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [fileHash, setFileHash] = useState<string>("");
  const [serviceYear, setServiceYear] = useState(new Date().getFullYear());
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<RowResult[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("import");
  const inputRef = useRef<HTMLInputElement>(null);

  // Idempotency state
  const [idempotencyWarning, setIdempotencyWarning] = useState<{
    fileName: string;
    createdAt: string;
    uniqueInserted: number;
    duplicatesRouted: number;
  } | null>(null);
  const [overrideIdempotency, setOverrideIdempotency] = useState(false);

  // Staging state
  const [pendingMerges, setPendingMerges] = useState<StagedDuplicate[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [mergeSummary, setMergeSummary] = useState<{
    merged: number;
    keptSeparate: number;
    discarded: number;
  } | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setParseError(null);
    setResults([]);
    setProgress(null);
    setSummary(null);
    setIdempotencyWarning(null);
    setOverrideIdempotency(false);
    setFileName(file.name);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParseError("Please upload a .csv file.");
      return;
    }

    // Compute hash for idempotency check
    const hash = await computeFileHash(file);
    setFileHash(hash);

    Papa.parse<ParsedRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) =>
        h.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, "_"),
      complete: (res) => {
        const valid: ParsedRow[] = [];
        const skipped: string[] = [];
        for (const r of res.data as ParsedRow[]) {
          const firstName = (r.first_name ?? "").trim();
          const lastName = (r.last_name ?? "").trim();
          const rawParish = (r.parish ?? "").trim();
          const normalizedParish = rawParish.normalize("NFC");
          const parish = PARISHES.find(
            (candidate) => candidate.normalize("NFC") === normalizedParish
          ) ?? "";
          const ministry = (r.ministry ?? "").trim();
          if (!firstName || !lastName || !rawParish || !ministry) {
            skipped.push(`${firstName || "?"} ${lastName || "?"}`.trim());
            continue;
          }

          if (!parish) {
            skipped.push(
              `${firstName} ${lastName} (invalid parish: "${rawParish}")`
            );
            continue;
          }
          if (valid.length >= MAX_ROWS) {
            skipped.push(
              `${firstName} ${lastName} (exceeds 3,000-row limit)`
            );
            continue;
          }
          valid.push({ first_name: firstName, last_name: lastName, parish, ministry });
        }
        setRows(valid);
        if (skipped.length > 0) {
          setParseError(
            `${skipped.length} row(s) skipped: ${skipped.slice(0, 5).join(", ")}` +
              (skipped.length > 5 ? ` ...and ${skipped.length - 5} more` : "")
          );
        }
      },
      error: (err) => setParseError(err.message),
    });
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  // ============================================================
  // STAGING + IMPORT FLOW
  // ============================================================
  const runImport = async () => {
    if (rows.length === 0) return;
    setProcessing(true);
    setResults([]);
    setActionError(null);
    setMergeSummary(null);

    const incomingRecords: IncomingRecord[] = rows.map((r) => ({
      first_name: r.first_name,
      last_name: r.last_name,
      parish: r.parish,
      ministry: r.ministry,
    }));

    setProgress({
      current: 0,
      total: incomingRecords.length,
      phase: "Checking for duplicates against existing registry and within batch...",
    });
    await new Promise((r) => setTimeout(r, 0));

    // Step 1: Stage — intercept all records before any DB insertion
    const stagingResult = await stageBatchRecords(
      incomingRecords,
      fileHash,
      serviceYear
    );
    const { unique, duplicates } = stagingResult;

    // Idempotency check — warn if this exact file was already imported
    if (stagingResult.alreadyImported && !overrideIdempotency) {
      setIdempotencyWarning({
        fileName: stagingResult.alreadyImported.fileName,
        createdAt: stagingResult.alreadyImported.createdAt,
        uniqueInserted: stagingResult.alreadyImported.uniqueInserted,
        duplicatesRouted: stagingResult.alreadyImported.duplicatesRouted,
      });
      setProcessing(false);
      setProgress(null);
      return;
    }

    setProgress({
      current: unique.length,
      total: incomingRecords.length,
      phase: `Found ${unique.length} unique, ${duplicates.length} duplicate (${duplicates.filter((d) => d.source === "internal_batch").length} within batch, ${duplicates.filter((d) => d.source === "db").length} in DB)`,
    });
    await new Promise((r) => setTimeout(r, 0));

    // Step 2: Record the import batch for idempotency tracking
    const { data: batchRecord } = await supabase
      .from("import_batches")
      .insert({
        file_hash: fileHash,
        file_name: fileName,
        row_count: incomingRecords.length,
        unique_inserted: 0,
        duplicates_routed: duplicates.length,
        status: "processing",
      })
      .select("id")
      .single();

    const batchId = (batchRecord as { id: string } | null)?.id;

    // Step 3: Insert unique records immediately (auto-generates UIDs)
    const out: RowResult[] = [];
    const batchCount = Math.ceil(unique.length / BATCH_SIZE);
    for (let b = 0; b < batchCount; b++) {
      const batchStart = b * BATCH_SIZE;
      const slice = unique.slice(batchStart, batchStart + BATCH_SIZE);

      setProgress({
        current: batchStart,
        total: unique.length,
        phase: `Inserting unique records — batch ${b + 1} of ${batchCount}`,
      });
      await new Promise((r) => setTimeout(r, 0));

      const batchResults: BatchResult[] = await importMemberBatch(
        slice,
        batchStart
      );

      for (let i = 0; i < batchResults.length; i++) {
        const res = batchResults[i];
        const name = `${slice[i].first_name} ${slice[i].last_name}`;
        if (res.status === "created") {
          out.push({
            row: res.index + 2,
            name,
            status: "created",
            message: "Created",
          });
        } else {
          out.push({
            row: res.index + 2,
            name,
            status: "error",
            message: res.error ?? "Unknown error",
          });
        }
      }

      setProgress({
        current: batchStart + slice.length,
        total: unique.length,
        phase: `Completed batch ${b + 1} of ${batchCount}`,
      });
    }

    // Step 4: Update the import batch record
    if (batchId) {
      await supabase
        .from("import_batches")
        .update({
          unique_inserted: out.filter((r) => r.status === "created").length,
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", batchId);
    }

    setResults(out);
    setSummary({
      created: out.filter((r) => r.status === "created").length,
      duplicates: duplicates.length,
      errors: out.filter((r) => r.status === "error").length,
      total: out.length + duplicates.length,
    });
    setProgress(null);
    setProcessing(false);
    setRows([]);
    setFileName("");
    setFileHash("");
    setOverrideIdempotency(false);

    // Step 5: Route duplicates to pendingMerges queue
    if (duplicates.length > 0) {
      setPendingMerges(duplicates);
      setCurrentIndex(0);
      setActiveTab("pending");
    }
  };

  // ============================================================
  // RECONCILIATION ACTIONS
  // ============================================================
  const currentDuplicate = pendingMerges[currentIndex];

  const resolveMerge = async () => {
    if (!currentDuplicate || !currentDuplicate.existing) return;
    setActionLoading(true);
    setActionError(null);

    const { existing, incoming } = currentDuplicate;
    const incomingMinistries = normalizeMinistries(incoming.ministry);
    const mergedMinistries = Array.from(
      new Set([...existing.ministries, ...incomingMinistries])
    );

    const { data: existingMembershipRows, error: membershipLoadError } =
      await supabase
        .from("member_ministries")
        .select("id,ministry")
        .eq("member_id", existing.id);

    if (membershipLoadError) {
      setActionError(membershipLoadError.message);
      setActionLoading(false);
      return;
    }

    const existingMinistryNames = new Set(
      ((existingMembershipRows as Pick<MemberMinistry, "id" | "ministry">[]) ?? [])
        .map((membership) => membership.ministry)
    );

    const missingMinistries = incomingMinistries.filter(
      (ministry) => !existingMinistryNames.has(ministry)
    );

    if (missingMinistries.length > 0) {
      const { error: membershipInsertError } = await supabase
        .from("member_ministries")
        .insert(
          missingMinistries.map((ministry) => ({
            member_id: existing.id,
            ministry,
            status: "Pending Verification" as MemberStatus,
            start_date: null,
            expiration_date: null,
            renewal_date: null,
            document_url: null,
            document_uploaded_at: null,
            archived_documents: [],
          }))
        );

      if (membershipInsertError) {
        setActionError(membershipInsertError.message);
        setActionLoading(false);
        return;
      }
    }

    // Keep legacy member fields synchronized temporarily for screens that have
    // not yet migrated, without resetting existing per-ministry rows.
    const { error } = await supabase
      .from("members")
      .update({
        ministries: mergedMinistries,
        status: "Pending Verification" as MemberStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) {
      if (missingMinistries.length > 0) {
        await supabase
          .from("member_ministries")
          .delete()
          .eq("member_id", existing.id)
          .in("ministry", missingMinistries);
      }

      setActionError(error.message);
      setActionLoading(false);
      return;
    }

    advanceQueue("merged");
  };

  const resolveKeepSeparate = async () => {
    if (!currentDuplicate) return;
    setActionLoading(true);
    setActionError(null);

    const { incoming } = currentDuplicate;
    const ministries = normalizeMinistries(incoming.ministry);

    const { data: createdMember, error } = await supabase
      .from("members")
      .insert({
        first_name: incoming.first_name.trim(),
        last_name: incoming.last_name.trim(),
        parish: incoming.parish.trim(),
        ministries,
        service_year: serviceYear,
        status: "Pending Verification",
        uid: "PENDING",
      })
      .select("*")
      .single();

    if (error) {
      // Graceful handling of DB-level unique constraint violation (23505)
      if (error.code === "23505") {
        setActionError(
          "Database rejected this insert: a member with the same name, parish, and ministry already exists. This is the database's last line of defense. Try 'Merge' instead, or 'Discard' to drop this record."
        );
      } else {
        setActionError(error.message);
      }
      setActionLoading(false);
      return;
    }

    const member = createdMember as Member;
    const { error: membershipError } = await supabase
      .from("member_ministries")
      .insert(
        ministries.map((ministry) => ({
          member_id: member.id,
          ministry,
          status: "Pending Verification" as MemberStatus,
          start_date: null,
          expiration_date: null,
          renewal_date: null,
          document_url: null,
          document_uploaded_at: null,
          archived_documents: [],
        }))
      );

    if (membershipError) {
      await supabase.from("members").delete().eq("id", member.id);
      setActionError(
        `Member creation was rolled back because ministry memberships could not be created: ${membershipError.message}`
      );
      setActionLoading(false);
      return;
    }

    advanceQueue("separate");
  };

  const resolveDiscard = () => {
    if (!currentDuplicate) return;
    setActionLoading(true);
    setActionError(null);
    advanceQueue("discarded");
  };

  const advanceQueue = (
    action: "merged" | "separate" | "discarded"
  ) => {
    setMergeSummary((prev) => {
      const base = prev ?? { merged: 0, keptSeparate: 0, discarded: 0 };
      if (action === "merged") return { ...base, merged: base.merged + 1 };
      if (action === "separate")
        return { ...base, keptSeparate: base.keptSeparate + 1 };
      return { ...base, discarded: base.discarded + 1 };
    });

    const remaining = pendingMerges.length - currentIndex - 1;
    if (remaining > 0) {
      setCurrentIndex((i) => i + 1);
      setActionLoading(false);
    } else {
      setPendingMerges([]);
      setCurrentIndex(0);
      setActionLoading(false);
    }
  };

  const downloadTemplate = () => {
    const csv =
      "First Name,Last Name,Parish,Ministry\n" +
      'Juan,Dela Cruz,San Agustin Parish,Mother Butler Guild\n' +
      'Maria,Santos,Immaculate Conception Parish,Ministry of Lectors and Commentators\n';
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "liturgical-ministry-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const stats = {
    created: results.filter((r) => r.status === "created").length,
    duplicates: results.filter((r) => r.status === "duplicate").length,
    errors: results.filter((r) => r.status === "error").length,
  };

  const progressPct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : 0;

  // ============================================================
  // FIELD DIFF HELPER
  // ============================================================
  const incomingMinistries = currentDuplicate
    ? normalizeMinistries(currentDuplicate.incoming.ministry)
    : [];

  const currentMatchBadge = currentDuplicate
    ? getMatchTypeBadge(currentDuplicate.matchType)
    : null;

  const fieldsDiff = [
    {
      label: "UID",
      existing: currentDuplicate?.existing?.uid ?? "— (none, internal batch duplicate)",
      incoming: "— (auto-generated on insert)",
      isDiff: false,
      muted: true,
    },
    {
      label: "Name",
      existing: currentDuplicate?.existing
        ? `${currentDuplicate.existing.first_name} ${currentDuplicate.existing.last_name}`
        : `${currentDuplicate?.incoming.first_name} ${currentDuplicate?.incoming.last_name}`,
      incoming: currentDuplicate
        ? `${currentDuplicate.incoming.first_name} ${currentDuplicate.incoming.last_name}`
        : "",
      isDiff: currentDuplicate?.existing
        ? `${currentDuplicate.existing.first_name} ${currentDuplicate.existing.last_name}`.toLowerCase() !==
          `${currentDuplicate.incoming.first_name} ${currentDuplicate.incoming.last_name}`.toLowerCase()
        : false,
    },
    {
      label: "Parish",
      existing: currentDuplicate?.existing?.parish ?? currentDuplicate?.incoming.parish ?? "",
      incoming: currentDuplicate?.incoming.parish ?? "",
      isDiff: currentDuplicate?.existing
        ? currentDuplicate.existing.parish.toLowerCase() !==
          currentDuplicate.incoming.parish.toLowerCase()
        : false,
    },
    {
      label: "Ministry",
      existing: currentDuplicate?.existing?.ministries.join(", ") ?? incomingMinistries.join(", "),
      incoming: incomingMinistries.join(", "),
      isDiff: currentDuplicate?.existing
        ? currentDuplicate.existing.ministries.join(", ").toLowerCase() !==
          incomingMinistries.join(", ").toLowerCase()
        : false,
    },
    {
      label: "Membership Status",
      existing: currentDuplicate?.existing?.status ?? "—",
      incoming: "Pending Verification",
      isDiff: currentDuplicate?.existing
        ? currentDuplicate.existing.status !== "Pending Verification"
        : false,
    },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Tab bar */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-sm">
        <button
          onClick={() => setActiveTab("import")}
          className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "import"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Upload className="h-4 w-4" />
          Import
          {pendingMerges.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {pendingMerges.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("pending")}
          className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "pending"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <GitMerge className="h-4 w-4" />
          Pending Merges
          {pendingMerges.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {pendingMerges.length}
            </span>
          )}
        </button>
      </div>

      {/* ============================================================ */}
      {/* IMPORT TAB */}
      {/* ============================================================ */}
      {activeTab === "import" && (
        <>
          {/* Idempotency warning */}
          {idempotencyWarning && (
            <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                  <ShieldAlert className="h-5 w-5 text-amber-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold text-amber-900">
                    This CSV was already imported
                  </h2>
                  <p className="mt-1 text-sm text-amber-800">
                    A batch with the exact same content was uploaded on{" "}
                    <strong>
                      {new Date(idempotencyWarning.createdAt).toLocaleString()}
                    </strong>{" "}
                    ({idempotencyWarning.uniqueInserted} members inserted,{" "}
                    {idempotencyWarning.duplicatesRouted} duplicates routed).
                    Re-importing the same file may create unintended duplicates.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => {
                        setOverrideIdempotency(true);
                        setIdempotencyWarning(null);
                        runImport();
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
                    >
                      <ShieldAlert className="h-3.5 w-3.5" />
                      Override — Import Anyway
                    </button>
                    <button
                      onClick={() => {
                        setIdempotencyWarning(null);
                        setRows([]);
                        setFileName("");
                        setFileHash("");
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                      Cancel Import
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {summary && !processing && (
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                  <CheckCircle2 className="h-5 w-5 text-emerald-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold text-foreground">
                    Staging Complete
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Inserted{" "}
                    <strong className="text-emerald-700">
                      {summary.created.toLocaleString()}
                    </strong>{" "}
                    new member{summary.created === 1 ? "" : "s"}
                    {summary.duplicates > 0 && (
                      <>
                        {" "}· Routed{" "}
                        <strong className="text-amber-700">
                          {summary.duplicates.toLocaleString()}
                        </strong>{" "}
                        duplicate record{summary.duplicates === 1 ? "" : "s"} to
                        the Pending Merges queue
                      </>
                    )}
                    {summary.errors > 0 && (
                      <>
                        {" "}·{" "}
                        <strong className="text-rose-700">
                          {summary.errors.toLocaleString()}
                        </strong>{" "}
                        error{summary.errors === 1 ? "" : "s"}
                      </>
                    )}
                    {" "}of{" "}
                    <strong>{summary.total.toLocaleString()}</strong> total
                    record{summary.total === 1 ? "" : "s"}.
                  </p>
                  {summary.duplicates > 0 && (
                    <button
                      onClick={() => setActiveTab("pending")}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      <GitMerge className="h-3.5 w-3.5" />
                      Review {summary.duplicates} Pending Merge
                      {summary.duplicates === 1 ? "" : "s"}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setSummary(null);
                      setResults([]);
                    }}
                    className={`mt-3 ${summary.duplicates > 0 ? "ml-2" : ""} inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors`}
                  >
                    <X className="h-3.5 w-3.5" />
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Upload className="h-6 w-6 text-primary" />
              Bulk CSV Import
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Import members at the start of the liturgical year. Supports up to{" "}
              {MAX_ROWS.toLocaleString()} rows per file. All imported records
              default to{" "}
              <span className="font-medium text-amber-700">
                Pending Verification
              </span>
              . Duplicate matches are intercepted using a composite key of
              first name + last name + parish, with fuzzy matching for
              misspellings and internal batch deduplication.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-5 shadow-sm space-y-4">
            <div className="rounded-md border border-primary/20 bg-primary/5 p-4">
              <label htmlFor="import-service-year" className="text-sm font-semibold">
                Service Year <span className="text-destructive">*</span>
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                Select the liturgical service year for all members in this CSV.
                This year will be recorded on each member and used for UID generation.
              </p>
              <select
                id="import-service-year"
                value={serviceYear}
                onChange={(e) => setServiceYear(Number(e.target.value))}
                disabled={processing}
                className="mt-3 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                {Array.from(
                  { length: 3 },
                  (_, index) => new Date().getFullYear() - 1 + index
                ).map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border bg-muted/30"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <FileSpreadsheet className="mx-auto h-10 w-10 text-muted-foreground/60" />
              <p className="mt-3 text-sm font-medium">
                {fileName ? fileName : "Drop your CSV here or click to browse"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Required columns: First Name, Last Name, Parish, Ministry — up to{" "}
                {MAX_ROWS.toLocaleString()} rows
              </p>
              <button
                onClick={() => inputRef.current?.click()}
                className="mt-4 inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
              >
                <Upload className="h-4 w-4" />
                Choose File
              </button>
            </div>

            {parseError && (
              <div className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2.5 text-sm text-amber-800 ring-1 ring-inset ring-amber-600/20">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{parseError}</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                onClick={downloadTemplate}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <Download className="h-3.5 w-3.5" />
                Download CSV template
              </button>
              {rows.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {rows.length.toLocaleString()} valid row(s) ready to stage
                </span>
              )}
            </div>

            {rows.length > 0 && (
              <div className="space-y-3">
                <div className="max-h-48 overflow-y-auto rounded-md border border-border scrollbar-thin">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/60 sticky top-0">
                      <tr className="text-left">
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">Parish</th>
                        <th className="px-3 py-2 font-medium">Ministry</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.slice(0, RESULTS_PREVIEW_LIMIT).map((r, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5">
                            {r.first_name} {r.last_name}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {r.parish}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {r.ministry}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > RESULTS_PREVIEW_LIMIT && (
                    <p className="px-3 py-2 text-xs text-muted-foreground bg-muted/30">
                      ...and{" "}
                      {(rows.length - RESULTS_PREVIEW_LIMIT).toLocaleString()}{" "}
                      more (not rendered for performance)
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => {
                      setRows([]);
                      setFileName("");
                      setFileHash("");
                    }}
                    className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={runImport}
                    disabled={processing}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-sm"
                  >
                    {processing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Staging...
                      </>
                    ) : (
                      <>
                        <Layers className="h-4 w-4" /> Stage & Import{" "}
                        {rows.length.toLocaleString()} Members
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {processing && progress && (
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  {progress.phase}
                </h2>
                <span className="text-xs font-medium text-muted-foreground">
                  {progressPct}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Processing {progress.current.toLocaleString()} of{" "}
                {progress.total.toLocaleString()}
              </p>
            </div>
          )}

          {results.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm space-y-4">
              <h2 className="text-sm font-semibold">Import Results</h2>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md bg-emerald-50 p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-700">
                    {stats.created}
                  </p>
                  <p className="text-xs text-emerald-700">Created</p>
                </div>
                <div className="rounded-md bg-amber-50 p-3 text-center">
                  <p className="text-2xl font-bold text-amber-700">
                    {stats.duplicates}
                  </p>
                  <p className="text-xs text-amber-700">Routed to Merges</p>
                </div>
                <div className="rounded-md bg-rose-50 p-3 text-center">
                  <p className="text-2xl font-bold text-rose-700">
                    {stats.errors}
                  </p>
                  <p className="text-xs text-rose-700">Errors</p>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-md border border-border scrollbar-thin">
                <table className="w-full text-xs">
                  <thead className="bg-muted/60 sticky top-0">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">Row</th>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {results.slice(0, RESULTS_PREVIEW_LIMIT).map((r) => (
                      <tr key={r.row}>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {r.row}
                        </td>
                        <td className="px-3 py-1.5">{r.name}</td>
                        <td className="px-3 py-1.5">
                          {r.status === "created" && (
                            <span className="inline-flex items-center gap-1 text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" /> Created
                            </span>
                          )}
                          {r.status === "duplicate" && (
                            <span className="inline-flex items-center gap-1 text-amber-700">
                              <AlertTriangle className="h-3 w-3" /> Duplicate
                            </span>
                          )}
                          {r.status === "error" && (
                            <span className="inline-flex items-center gap-1 text-rose-700">
                              <X className="h-3 w-3" /> Error
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {r.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {results.length > RESULTS_PREVIEW_LIMIT && (
                  <p className="px-3 py-2 text-xs text-muted-foreground bg-muted/30">
                    Showing first {RESULTS_PREVIEW_LIMIT} of{" "}
                    {results.length.toLocaleString()} results.
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ============================================================ */}
      {/* PENDING MERGES TAB */}
      {/* ============================================================ */}
      {activeTab === "pending" && (
        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <GitMerge className="h-6 w-6 text-primary" />
              Pending Merges — Reconciliation Queue
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Duplicate records intercepted during batch import. Compare the
              existing profile against the incoming upload record, then choose
              an action. The queue advances automatically after each decision.
            </p>
          </div>

          {actionError && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive ring-1 ring-inset ring-destructive/20">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {pendingMerges.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-16 text-center">
              <Inbox className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">
                No pending merges.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Duplicate entries intercepted during import will appear here
                for side-by-side reconciliation.
              </p>
              {mergeSummary && (
                <div className="mt-6 inline-flex items-center gap-4 rounded-md border border-border bg-card px-5 py-3 shadow-sm">
                  <span className="text-xs font-medium text-emerald-700">
                    Merged: {mergeSummary.merged}
                  </span>
                  <span className="text-xs font-medium text-blue-700">
                    Kept Separate: {mergeSummary.keptSeparate}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    Discarded: {mergeSummary.discarded}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Queue progress */}
              <div className="flex items-center justify-between rounded-lg border border-border bg-card px-5 py-3 shadow-sm">
                <span className="text-sm font-medium">
                  Duplicate {currentIndex + 1} of {pendingMerges.length}
                </span>
                <div className="flex items-center gap-3">
                  {mergeSummary && (
                    <span className="text-xs text-muted-foreground">
                      M: {mergeSummary.merged} · KS:{" "}
                      {mergeSummary.keptSeparate} · D:{" "}
                      {mergeSummary.discarded}
                    </span>
                  )}
                  <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{
                        width: `${((currentIndex + 1) / pendingMerges.length) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Side-by-side comparison */}
              {currentDuplicate && (
                <div className="space-y-4">
                  {/* Match type badge */}
                  {currentMatchBadge && (
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${currentMatchBadge.className}`}
                      >
                        <currentMatchBadge.icon className="h-3.5 w-3.5" />
                        {currentMatchBadge.label}
                        {currentDuplicate.similarity < 1 && (
                          <span className="ml-1 text-[10px] opacity-75">
                            ({Math.round(currentDuplicate.similarity * 100)}% similar)
                          </span>
                        )}
                      </span>
                      {currentDuplicate.source === "internal_batch" && (
                        <span className="text-xs text-muted-foreground">
                          No DB record exists — this is a duplicate within the uploaded CSV itself
                        </span>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* LEFT: Existing DB record */}
                    <div className="rounded-lg border border-border bg-muted/20 p-5 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4 flex items-center gap-1.5">
                        <UserCheck className="h-4 w-4" />
                        {currentDuplicate.existing
                          ? "Existing Profile (in DB)"
                          : "Existing Profile (earlier CSV row)"}
                      </p>
                      <div className="space-y-3">
                        {fieldsDiff.map((f) => (
                          <DiffField
                            key={f.label}
                            label={f.label}
                            value={f.existing}
                            isDiff={f.isDiff}
                            muted={f.muted}
                          />
                        ))}
                      </div>
                    </div>

                    {/* RIGHT: Incoming upload record */}
                    <div className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-5 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-4 flex items-center gap-1.5">
                        <UserX className="h-4 w-4" />
                        Incoming Upload Record
                      </p>
                      <div className="space-y-3">
                        {fieldsDiff.map((f) => (
                          <DiffField
                            key={f.label}
                            label={f.label}
                            value={f.incoming}
                            isDiff={f.isDiff}
                            muted={f.muted}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Field diff legend */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                      Highlighted fields differ between records
                    </span>
                  </div>

                  {/* Action buttons — Merge disabled for internal_batch duplicates with no existing record */}
                  <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border">
                    <button
                      onClick={resolveMerge}
                      disabled={actionLoading || !currentDuplicate.existing}
                      className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-sm"
                      title={
                        !currentDuplicate.existing
                          ? "Merge is unavailable for internal batch duplicates (no existing DB record to merge into)"
                          : ""
                      }
                    >
                      {actionLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <GitMerge className="h-4 w-4" />
                      )}
                      Merge — update existing with incoming ministry & status
                    </button>
                    <button
                      onClick={resolveKeepSeparate}
                      disabled={actionLoading}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-60"
                    >
                      <UserX className="h-4 w-4" />
                      Keep Separate — insert as new record
                    </button>
                    <button
                      onClick={resolveDiscard}
                      disabled={actionLoading}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-60"
                    >
                      <Trash2 className="h-4 w-4" />
                      Discard — drop incoming record
                    </button>
                  </div>

                  {/* Next preview */}
                  {currentIndex + 1 < pendingMerges.length && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
                      <ArrowRight className="h-3.5 w-3.5" />
                      Next in queue:{" "}
                      <span className="font-medium">
                        {pendingMerges[currentIndex + 1].incoming.first_name}{" "}
                        {pendingMerges[currentIndex + 1].incoming.last_name}
                      </span>{" "}
                      — {pendingMerges[currentIndex + 1].incoming.parish}
                      {pendingMerges[currentIndex + 1].source === "internal_batch" && (
                        <span className="text-violet-600"> (within CSV)</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// DIFF FIELD COMPONENT
// ============================================================
function DiffField({
  label,
  value,
  isDiff,
  muted,
}: {
  label: string;
  value: string;
  isDiff: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`rounded-md px-3 py-2 ${
        isDiff
          ? "bg-amber-50 ring-1 ring-inset ring-amber-400/40"
          : "bg-background/50"
      }`}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-0.5 text-sm font-medium ${
          muted ? "text-muted-foreground italic" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
