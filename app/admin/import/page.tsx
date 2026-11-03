"use client";

import { normalizeApprovedMinistries } from "@/lib/registration-ministry-validation";
import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import Papa from "papaparse";
import { ebGaramond } from "@/app/fonts";
import {
  stageBatchRecords,
  importMemberBatch,
  stageRenewalBatch,
  type BatchResult,
  type IncomingRecord,
  type StagedDuplicate,
  type DuplicateMatchType,
  type RenewalBatchStagingResult,
  type RenewalReviewItem,
} from "@/lib/duplicate-check";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { saveRenewalReviewCases } from "@/lib/renewal-review-queue";
import { MINISTRIES, PARISHES, shortMinistry } from "@/lib/constants";
import { canonicalParish } from "@/lib/parish-normalization";
import type {
  Member,
  MemberMinistry,
  MemberStatus,
  RecommendationRenewalBatch,
  RecommendationRenewalMembership,
} from "@/lib/types";
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
  FileCheck2,
  History,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  RefreshCw,
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

type Tab = "import" | "renewal" | "history" | "pending";

type RenewalHistoryBatch = RecommendationRenewalBatch & {
  memberships: RecommendationRenewalMembership[];
};

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


function getRenewalReviewLabel(item: RenewalReviewItem): string {
  switch (item.reason) {
    case "multiple_exact_members":
      return "Multiple exact member matches";
    case "missing_membership":
      return "Member found, ministry membership missing";
    case "same_name_different_parish":
      return "Same name found in a different parish";
    case "similar_name":
      return "Similar name requires review";
    case "duplicate_csv_membership":
      return "Repeated membership in renewal CSV";
    default:
      return "Needs manual review";
  }
}

function getDefaultNextRenewalDate(renewalDate: string): string {
  // Match PostgreSQL calendar-year arithmetic, including leap-day clamping.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(renewalDate)) return "";
  const date = new Date(`${renewalDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== renewalDate) {
    return "";
  }
  const year = date.getUTCFullYear() + 1;
  const month = date.getUTCMonth();
  const day = Math.min(date.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
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
  // Backwards-compatible entry points while renewal processing is consolidated.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "renewal" || requested === "history" || requested === "pending") {
      setActiveTab(requested);
    }
  }, []);

  const inputRef = useRef<HTMLInputElement>(null);

  // Renewal import state
  const renewalCsvInputRef = useRef<HTMLInputElement>(null);
  const renewalLetterInputRef = useRef<HTMLInputElement>(null);
  const [renewalRows, setRenewalRows] = useState<ParsedRow[]>([]);
  const [renewalCsvName, setRenewalCsvName] = useState("");
  const [renewalParseError, setRenewalParseError] = useState<string | null>(null);
  const [renewalLetter, setRenewalLetter] = useState<File | null>(null);
  const [renewalStaging, setRenewalStaging] = useState<RenewalBatchStagingResult | null>(null);
  const [reviewQueueSaving, setReviewQueueSaving] = useState(false);
  const [reviewQueueSaved, setReviewQueueSaved] = useState<{ saved: number; alreadyOpen: number } | null>(null);
  const [reviewQueueError, setReviewQueueError] = useState<string | null>(null);
  const [renewalProcessing, setRenewalProcessing] = useState(false);
  const [renewalActionError, setRenewalActionError] = useState<string | null>(null);
  const [renewalSelected, setRenewalSelected] = useState<Set<string>>(new Set());
  const [renewalDate, setRenewalDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [nextRenewalDate, setNextRenewalDate] = useState(() =>
    getDefaultNextRenewalDate(new Date().toISOString().slice(0, 10))
  );
  const [renewalNotes, setRenewalNotes] = useState("");
  const [renewalSuccess, setRenewalSuccess] = useState<{
    renewed: number;
    batchId: string;
  } | null>(null);

  // Renewal history state
  const [renewalHistory, setRenewalHistory] = useState<RenewalHistoryBatch[]>([]);
  const [renewalHistoryLoading, setRenewalHistoryLoading] = useState(false);
  const [renewalHistoryError, setRenewalHistoryError] = useState<string | null>(null);
  const [expandedHistoryBatchId, setExpandedHistoryBatchId] = useState<string | null>(null);
  const [openingHistoryDocumentId, setOpeningHistoryDocumentId] = useState<string | null>(null);

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
          const parish = canonicalParish(rawParish) ?? "";
          const ministry = (r.ministry ?? "").trim();
          const ministryParts = ministry.split(/[;,/]+/).map((part) => part.trim()).filter(Boolean);
          const approvedMinistries = normalizeApprovedMinistries(ministryParts);
          if (!approvedMinistries.valid) {
            skipped.push(`${firstName || "?"} ${lastName || "?"} (invalid ministry: ${approvedMinistries.unknown.join(", ") || "missing"})`);
            continue;
          }
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
          valid.push({ first_name: firstName, last_name: lastName, parish, ministry: approvedMinistries.ministries.join("; ") });
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

  const loadRenewalHistory = useCallback(async () => {
    setRenewalHistoryLoading(true);
    setRenewalHistoryError(null);

    const { data: batchRows, error: batchError } = await supabase
      .from("recommendation_renewal_batches")
      .select("*")
      .order("processed_at", { ascending: false })
      .limit(100);

    if (batchError) {
      setRenewalHistory([]);
      setRenewalHistoryError(batchError.message);
      setRenewalHistoryLoading(false);
      return;
    }

    const batches = (batchRows as RecommendationRenewalBatch[]) ?? [];
    if (batches.length === 0) {
      setRenewalHistory([]);
      setRenewalHistoryLoading(false);
      return;
    }

    const batchIds = batches.map((batch) => batch.id);
    const { data: membershipRows, error: membershipError } = await supabase
      .from("recommendation_renewal_memberships")
      .select("*")
      .in("batch_id", batchIds)
      .order("member_name");

    if (membershipError) {
      setRenewalHistory([]);
      setRenewalHistoryError(membershipError.message);
      setRenewalHistoryLoading(false);
      return;
    }

    const memberships =
      (membershipRows as RecommendationRenewalMembership[]) ?? [];
    const byBatch = new Map<string, RecommendationRenewalMembership[]>();

    for (const membership of memberships) {
      const current = byBatch.get(membership.batch_id) ?? [];
      current.push(membership);
      byBatch.set(membership.batch_id, current);
    }

    setRenewalHistory(
      batches.map((batch) => ({
        ...batch,
        memberships: byBatch.get(batch.id) ?? [],
      }))
    );
    setRenewalHistoryLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (activeTab === "history") {
      void loadRenewalHistory();
    }
  }, [activeTab, loadRenewalHistory]);

  const openRenewalHistoryDocument = async (batch: RecommendationRenewalBatch) => {
    setOpeningHistoryDocumentId(batch.id);
    setRenewalHistoryError(null);

    const { data, error } = await supabase.storage
      .from("member-documents")
      .createSignedUrl(batch.document_url, 3600);

    setOpeningHistoryDocumentId(null);

    if (error || !data?.signedUrl) {
      setRenewalHistoryError(
        error?.message ?? "Unable to generate a secure document link."
      );
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const handleRenewalCsv = useCallback((file: File) => {
    setRenewalParseError(null);
    setRenewalStaging(null);
    setReviewQueueSaved(null);
    setReviewQueueError(null);
    setRenewalActionError(null);
    setRenewalSuccess(null);
    setRenewalSelected(new Set());
    setRenewalCsvName(file.name);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setRenewalParseError("Please upload a .csv file.");
      return;
    }

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
          const parish = canonicalParish(rawParish) ?? "";
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
              `${firstName} ${lastName} (exceeds ${MAX_ROWS.toLocaleString()}-row limit)`
            );
            continue;
          }

          valid.push({
            first_name: firstName,
            last_name: lastName,
            parish,
            ministry,
          });
        }

        setRenewalRows(valid);

        if (skipped.length > 0) {
          setRenewalParseError(
            `${skipped.length} row(s) skipped: ${skipped.slice(0, 5).join(", ")}` +
              (skipped.length > 5 ? ` ...and ${skipped.length - 5} more` : "")
          );
        }
      },
      error: (err) => setRenewalParseError(err.message),
    });
  }, []);

  const resetRenewalWorkflow = () => {
    setRenewalRows([]);
    setRenewalCsvName("");
    setRenewalParseError(null);
    setRenewalLetter(null);
    setRenewalStaging(null);
    setReviewQueueSaved(null);
    setReviewQueueError(null);
    setRenewalActionError(null);
    setRenewalSelected(new Set());
    setRenewalNotes("");
    setRenewalSuccess(null);
    if (renewalCsvInputRef.current) renewalCsvInputRef.current.value = "";
    if (renewalLetterInputRef.current) renewalLetterInputRef.current.value = "";
  };

  const stageRenewalRoster = async () => {
    if (renewalRows.length === 0) return;

    setRenewalProcessing(true);
    setReviewQueueSaved(null);
    setReviewQueueError(null);
    setRenewalActionError(null);
    setRenewalSuccess(null);

    const parishSet = new Set(renewalRows.map((row) => row.parish));
    if (parishSet.size !== 1) {
      setRenewalProcessing(false);
      setRenewalActionError(
        "A renewal batch must contain exactly one parish because one shared recommendation letter is applied to the batch."
      );
      return;
    }

    try {
      const result = await stageRenewalBatch(
        renewalRows.map((row) => ({
          first_name: row.first_name,
          last_name: row.last_name,
          parish: row.parish,
          ministry: row.ministry,
        }))
      );

      setRenewalStaging(result);
      setRenewalSelected(
        new Set(result.renewable.map((item) => item.membership.id))
      );
    } catch (error) {
      setRenewalActionError(
        error instanceof Error ? error.message : "Unable to stage renewal roster."
      );
    } finally {
      setRenewalProcessing(false);
    }
  };

  const saveStagedReviewCases = async () => {
    if (!renewalStaging || reviewQueueSaved !== null || reviewQueueSaving) return;
    setReviewQueueSaving(true);
    setReviewQueueError(null);
    try {
      const result = await saveRenewalReviewCases(renewalStaging, renewalCsvName || "Renewal roster");
      setReviewQueueSaved(result);
    } catch (cause) {
      setReviewQueueError(cause instanceof Error ? cause.message : "Unable to save review cases.");
    } finally {
      setReviewQueueSaving(false);
    }
  };

  const toggleRenewalMembership = (membershipId: string) => {
    setRenewalSelected((previous) => {
      const next = new Set(previous);
      if (next.has(membershipId)) next.delete(membershipId);
      else next.add(membershipId);
      return next;
    });
  };

  const toggleAllRenewableMemberships = () => {
    if (!renewalStaging) return;

    const ids = renewalStaging.renewable.map((item) => item.membership.id);
    const allSelected =
      ids.length > 0 && ids.every((id) => renewalSelected.has(id));

    setRenewalSelected(allSelected ? new Set() : new Set(ids));
  };

  const processRenewalBatch = async () => {
    if (!renewalStaging) return;

    const selectedIds = renewalStaging.renewable
      .map((item) => item.membership.id)
      .filter((id) => renewalSelected.has(id));

    if (selectedIds.length === 0) {
      setRenewalActionError("Select at least one exact membership to renew.");
      return;
    }

    if (!renewalLetter) {
      setRenewalActionError(
        "Upload the shared recommendation letter before processing the renewal."
      );
      return;
    }

    if (!renewalDate || !nextRenewalDate) {
      setRenewalActionError("Renewal date and next renewal date are required.");
      return;
    }

    if (nextRenewalDate < renewalDate) {
      setRenewalActionError(
        "The next renewal date cannot be earlier than the renewal date."
      );
      return;
    }

    const selectedItems = renewalStaging.renewable.filter((item) =>
      renewalSelected.has(item.membership.id)
    );
    const parishes = Array.from(
      new Set(selectedItems.map((item) => item.existing.parish))
    );

    if (parishes.length !== 1) {
      setRenewalActionError(
        "Selected renewal memberships must belong to exactly one parish."
      );
      return;
    }

    setRenewalProcessing(true);
    setRenewalActionError(null);

    const batchId = crypto.randomUUID();
    const ext = renewalLetter.name.includes(".")
      ? renewalLetter.name.split(".").pop()?.toLowerCase() || "pdf"
      : "pdf";
    const storagePath = `batch-renewals/${batchId}/recommendation-letter.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("member-documents")
      .upload(storagePath, renewalLetter, {
        upsert: false,
        contentType: renewalLetter.type || undefined,
      });

    if (uploadError) {
      setRenewalProcessing(false);
      setRenewalActionError(uploadError.message);
      return;
    }

    const { error: renewalError } = await supabase.rpc(
      "process_recommendation_renewal_batch",
      {
        p_batch_id: batchId,
        p_parish: parishes[0],
        p_ministry: null,
        p_document_url: storagePath,
        p_renewal_date: renewalDate,
        p_next_renewal_date: nextRenewalDate,
        p_membership_ids: selectedIds,
        p_notes: renewalNotes.trim() || null,
      }
    );

    if (renewalError) {
      await supabase.storage.from("member-documents").remove([storagePath]);
      setRenewalProcessing(false);
      setRenewalActionError(renewalError.message);
      return;
    }

    setRenewalProcessing(false);
    setRenewalSuccess({ renewed: selectedIds.length, batchId });
    setRenewalSelected(new Set());
    void loadRenewalHistory();
  };

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
    <div className="w-full space-y-5 pb-16 text-[#1E1114]">
      <div>
        <h1 className={`${ebGaramond.className} text-[42px] font-medium leading-none text-[#1E1114] sm:text-[48px]`}>
          Bulk Registration Import &amp; Legacy Renewals
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Import new member rosters and reconcile duplicates. The existing renewal processor is retained here temporarily while its workflow is consolidated into the Renewal Processing Desk.
        </p>
      </div>
      <div className="border border-[#E6DADB] bg-[#F8F1F3] px-4 py-3 text-sm text-[#5D3540]">
        For renewal batches, start at <Link href="/admin/renewal-batches" className="font-semibold text-[#890022] underline underline-offset-2">Renewal Processing Desk</Link>. This page preserves existing CSV renewal validation, document handling and history while the consolidated workflow is being completed.
      </div>
      {/* Tab bar */}
      <div className="grid grid-cols-2 gap-0 border border-[#E6DADB] border-t-[3px] border-t-[#890022] bg-white p-1 sm:flex sm:flex-wrap">
        <button
          onClick={() => setActiveTab("import")}
          className={`inline-flex items-center justify-center gap-1.5 border-0 px-3 py-2.5 text-[13px] font-semibold transition-colors ${
            activeTab === "import"
              ? "bg-[#890022] text-white"
              : "text-[#6D5960] hover:bg-[#F7EFF1] hover:text-[#890022]"
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
          onClick={() => setActiveTab("renewal")}
          className={`inline-flex items-center justify-center gap-1.5 border-0 px-3 py-2.5 text-[13px] font-semibold transition-colors ${
            activeTab === "renewal"
              ? "bg-[#890022] text-white"
              : "text-[#6D5960] hover:bg-[#F7EFF1] hover:text-[#890022]"
          }`}
        >
          <FileCheck2 className="h-4 w-4" />
          Renewal Import
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`inline-flex items-center justify-center gap-1.5 border-0 px-3 py-2.5 text-[13px] font-semibold transition-colors ${
            activeTab === "history"
              ? "bg-[#890022] text-white"
              : "text-[#6D5960] hover:bg-[#F7EFF1] hover:text-[#890022]"
          }`}
        >
          <History className="h-4 w-4" />
          Renewal History
        </button>
        <button
          onClick={() => setActiveTab("pending")}
          className={`inline-flex items-center justify-center gap-1.5 border-0 px-3 py-2.5 text-[13px] font-semibold transition-colors ${
            activeTab === "pending"
              ? "bg-[#890022] text-white"
              : "text-[#6D5960] hover:bg-[#F7EFF1] hover:text-[#890022]"
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
            <div className="rounded-none border-2 border-amber-400 bg-amber-50 p-5 shadow-sm">
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
                      className="inline-flex items-center gap-1.5 rounded-none bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
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
                      className="inline-flex items-center gap-1.5 rounded-none border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 transition-colors"
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
            <div className="rounded-none border border-[#E6DADB] border-t-[3px] border-t-[#890022] bg-white p-5 shadow-none">
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
                      className="mt-3 inline-flex items-center gap-1.5 rounded-none bg-[#890022] px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 transition-colors"
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
                    className={`mt-3 ${summary.duplicates > 0 ? "ml-2" : ""} inline-flex items-center gap-1.5 rounded-none border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors`}
                  >
                    <X className="h-3.5 w-3.5" />
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          <div>
            <h1 className={`${ebGaramond.className} text-[29px] leading-tight font-semibold tracking-tight text-[#211018] flex items-center gap-2`}>
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

          <div className="rounded-none border border-[#E6DADB] border-t-[3px] border-t-[#890022] bg-white p-5 shadow-none space-y-4">
            <div className="rounded-none border border-primary/20 bg-primary/5 p-4">
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
                className="mt-3 w-full max-w-xs rounded-none border border-input bg-background px-3 py-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
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
              className={`rounded-none border-2 border-dashed p-8 text-center transition-colors ${
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
                className="mt-4 inline-flex items-center gap-2 rounded-none border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
              >
                <Upload className="h-4 w-4" />
                Choose File
              </button>
            </div>

            {parseError && (
              <div className="flex items-start gap-2 rounded-none bg-amber-50 px-3 py-2.5 text-sm text-amber-800 ring-1 ring-inset ring-amber-600/20">
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
                <div className="max-h-48 overflow-y-auto rounded-none border border-border scrollbar-thin">
                  <table className="w-full text-xs">
                    <thead className="bg-[#FBF7F8] sticky top-0">
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
                    className="rounded-none border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={runImport}
                    disabled={processing}
                    className="inline-flex items-center gap-2 rounded-none bg-[#890022] px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-sm"
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
            <div className="rounded-none border border-[#E6DADB] border-t-[3px] border-t-[#890022] bg-white p-5 shadow-none space-y-3">
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
            <div className="rounded-none border border-[#E6DADB] border-t-[3px] border-t-[#890022] bg-white p-5 shadow-none space-y-4">
              <h2 className="text-sm font-semibold">Import Results</h2>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-none bg-emerald-50 p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-700">
                    {stats.created}
                  </p>
                  <p className="text-xs text-emerald-700">Created</p>
                </div>
                <div className="rounded-none bg-amber-50 p-3 text-center">
                  <p className="text-2xl font-bold text-amber-700">
                    {stats.duplicates}
                  </p>
                  <p className="text-xs text-amber-700">Routed to Merges</p>
                </div>
                <div className="rounded-none bg-rose-50 p-3 text-center">
                  <p className="text-2xl font-bold text-rose-700">
                    {stats.errors}
                  </p>
                  <p className="text-xs text-rose-700">Errors</p>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-none border border-border scrollbar-thin">
                <table className="w-full text-xs">
                  <thead className="bg-[#FBF7F8] sticky top-0">
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
      {/* RENEWAL IMPORT TAB */}
      {/* ============================================================ */}
      {activeTab === "renewal" && (
        <div className="space-y-5">
          <div>
            <h1 className={`${ebGaramond.className} text-[29px] leading-tight font-semibold tracking-tight text-[#211018] flex items-center gap-2`}>
              <FileCheck2 className="h-6 w-6 text-primary" />
              Parish Recommendation Renewal
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Upload one parish renewal roster CSV and one shared recommendation
              letter. Exact existing member + ministry matches can be renewed in
              place; ambiguous and unmatched rows are held for review and are not
              changed automatically.
            </p>
          </div>

          {renewalSuccess && (
            <div className="rounded-none border border-emerald-300 bg-emerald-50 p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 mt-0.5 text-emerald-700 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-emerald-900">
                    Renewal batch completed
                  </p>
                  <p className="mt-1 text-sm text-emerald-800">
                    {renewalSuccess.renewed} ministry membership
                    {renewalSuccess.renewed === 1 ? "" : "s"} renewed. Review and
                    unmatched rows were not modified.
                  </p>
                  <button
                    type="button"
                    onClick={resetRenewalWorkflow}
                    className="mt-3 rounded-none border border-emerald-400 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
                  >
                    Start another renewal batch
                  </button>
                </div>
              </div>
            </div>
          )}

          {renewalActionError && (
            <div className="flex items-start gap-2 rounded-none bg-destructive/10 px-4 py-3 text-sm text-destructive ring-1 ring-inset ring-destructive/20">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{renewalActionError}</span>
            </div>
          )}

          {!renewalSuccess && (
            <>
              <div className="rounded-none border border-[#E6DADB] border-t-[3px] border-t-[#890022] bg-white p-5 shadow-none space-y-5">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold">1. Renewal roster CSV</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Required columns: First Name, Last Name, Parish, Ministry.
                        The file must contain exactly one parish.
                      </p>
                    </div>
                    <input
                      ref={renewalCsvInputRef}
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleRenewalCsv(file);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => renewalCsvInputRef.current?.click()}
                      disabled={renewalProcessing}
                      className="inline-flex items-center gap-2 rounded-none border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
                    >
                      <FileSpreadsheet className="h-4 w-4" />
                      {renewalCsvName || "Choose renewal CSV"}
                    </button>
                    {renewalRows.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {renewalRows.length.toLocaleString()} valid row
                        {renewalRows.length === 1 ? "" : "s"} ready to stage.
                      </p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold">
                        2. Shared recommendation letter
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        This document becomes the current recommendation letter
                        for every confirmed membership in the batch.
                      </p>
                    </div>
                    <input
                      ref={renewalLetterInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp"
                      className="hidden"
                      onChange={(e) =>
                        setRenewalLetter(e.target.files?.[0] ?? null)
                      }
                    />
                    <button
                      type="button"
                      onClick={() => renewalLetterInputRef.current?.click()}
                      disabled={renewalProcessing}
                      className="inline-flex items-center gap-2 rounded-none border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
                    >
                      <Upload className="h-4 w-4" />
                      {renewalLetter?.name || "Choose recommendation letter"}
                    </button>
                  </div>
                </div>

                {renewalParseError && (
                  <div className="flex items-start gap-2 rounded-none bg-amber-50 px-3 py-2.5 text-sm text-amber-800 ring-1 ring-inset ring-amber-600/20">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{renewalParseError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="renewal-date"
                      className="text-sm font-semibold"
                    >
                      Renewal date
                    </label>
                    <input
                      id="renewal-date"
                      type="date"
                      value={renewalDate}
                      disabled={renewalProcessing}
                      onChange={(e) => {
                        setRenewalDate(e.target.value);
                        setNextRenewalDate(
                          getDefaultNextRenewalDate(e.target.value)
                        );
                      }}
                      className="mt-2 w-full rounded-none border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="renewal-next-date"
                      className="text-sm font-semibold"
                    >
                      Next renewal / expiration date
                    </label>
                    <input
                      id="renewal-next-date"
                      type="date"
                      value={nextRenewalDate}
                      min={renewalDate || undefined}
                      disabled={renewalProcessing}
                      onChange={(e) => setNextRenewalDate(e.target.value)}
                      className="mt-2 w-full rounded-none border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="renewal-notes"
                    className="text-sm font-semibold"
                  >
                    Processing notes (optional)
                  </label>
                  <textarea
                    id="renewal-notes"
                    rows={3}
                    value={renewalNotes}
                    disabled={renewalProcessing}
                    onChange={(e) => setRenewalNotes(e.target.value)}
                    placeholder="Optional note about this parish renewal cycle..."
                    className="mt-2 w-full rounded-none border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  {(renewalRows.length > 0 || renewalStaging) && (
                    <button
                      type="button"
                      onClick={resetRenewalWorkflow}
                      disabled={renewalProcessing}
                      className="rounded-none border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={stageRenewalRoster}
                    disabled={renewalProcessing || renewalRows.length === 0}
                    className="inline-flex items-center gap-2 rounded-none bg-[#890022] px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
                  >
                    {renewalProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Layers className="h-4 w-4" />
                    )}
                    Stage Renewal Roster
                  </button>
                </div>
              </div>

              {renewalStaging && (
                <div className="space-y-5">
                  {(renewalStaging.review.length + renewalStaging.unmatched.length) > 0 && (
                    <div className="border border-[#DEC6CD] border-t-[3px] border-t-[#890022] bg-[#F8F1F3] p-4">
                      <h2 className="text-sm font-semibold text-[#582D3A]">Save renewal exceptions for later review</h2>
                      <p className="mt-1 text-xs leading-5 text-[#69535A]">
                        Needs Review and Unmatched are temporary results until saved. Save them to the dedicated renewal queue so you can return later. This does not merge, create, or renew any member.
                      </p>
                      {reviewQueueError && <p role="alert" className="mt-2 text-xs font-medium text-[#890022]">{reviewQueueError}</p>}
                      {reviewQueueSaved !== null ? (
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <p role="status" className="text-sm font-semibold text-[#582D3A]">{reviewQueueSaved.saved} new cases saved; {reviewQueueSaved.alreadyOpen} already in the open queue.</p>
                          <Link href="/admin/renewal-reviews" className="text-xs font-semibold text-[#890022] underline underline-offset-2">Open Renewal Review Queue</Link>
                        </div>
                      ) : (
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <button type="button" onClick={() => void saveStagedReviewCases()}
                            disabled={reviewQueueSaving}
                            className="inline-flex min-h-10 items-center gap-2 bg-[#890022] px-4 text-sm font-semibold text-white disabled:opacity-50">
                            {reviewQueueSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                            Save {renewalStaging.review.length + renewalStaging.unmatched.length} Review Cases
                          </button>
                          <Link href="/admin/renewal-reviews" className="text-xs font-semibold text-[#890022] underline underline-offset-2">View existing reviews</Link>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-none border border-emerald-200 bg-emerald-50 p-4">
                      <p className="text-2xl font-bold text-emerald-700">
                        {renewalStaging.renewable.length}
                      </p>
                      <p className="text-xs font-semibold text-emerald-800">
                        Ready to Renew
                      </p>
                    </div>
                    <div className="rounded-none border border-amber-200 bg-amber-50 p-4">
                      <p className="text-2xl font-bold text-amber-700">
                        {renewalStaging.review.length}
                      </p>
                      <p className="text-xs font-semibold text-amber-800">
                        Needs Review
                      </p>
                    </div>
                    <div className="rounded-none border border-slate-200 bg-slate-50 p-4">
                      <p className="text-2xl font-bold text-slate-700">
                        {renewalStaging.unmatched.length}
                      </p>
                      <p className="text-xs font-semibold text-slate-800">
                        Unmatched
                      </p>
                    </div>
                  </div>

                  <div className="rounded-none border border-[#E6DADB] border-t-[3px] border-t-[#890022] bg-white shadow-none overflow-hidden">
                    <div className="flex items-center justify-between gap-3 border-b border-border bg-emerald-50/60 px-4 py-3">
                      <div>
                        <h2 className="text-sm font-semibold text-emerald-900">
                          Ready to Renew
                        </h2>
                        <p className="text-xs text-emerald-800">
                          Exact existing member + exact existing ministry.
                          Checked rows will be renewed in place.
                        </p>
                      </div>
                      {renewalStaging.renewable.length > 0 && (
                        <label className="inline-flex items-center gap-2 text-xs font-medium text-emerald-900">
                          <input
                            type="checkbox"
                            checked={
                              renewalStaging.renewable.length > 0 &&
                              renewalStaging.renewable.every((item) =>
                                renewalSelected.has(item.membership.id)
                              )
                            }
                            onChange={toggleAllRenewableMemberships}
                            disabled={renewalProcessing}
                            className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                          />
                          Select all exact matches
                        </label>
                      )}
                    </div>

                    {renewalStaging.renewable.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No exact existing membership matches were found.
                      </div>
                    ) : (
                      <div className="max-h-80 overflow-y-auto divide-y divide-border">
                        {renewalStaging.renewable.map((item) => {
                          const checked = renewalSelected.has(item.membership.id);
                          return (
                            <label
                              key={item.membership.id}
                              className={`flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted/30 ${
                                checked ? "bg-primary/5" : ""
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={renewalProcessing}
                                onChange={() =>
                                  toggleRenewalMembership(item.membership.id)
                                }
                                className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-ring"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="font-medium">
                                    {item.existing.first_name}{" "}
                                    {item.existing.last_name}
                                  </span>
                                  <code className="text-[11px] text-muted-foreground">
                                    {item.existing.uid}
                                  </code>
                                </span>
                                <span className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                  <span>{item.existing.parish}</span>
                                  <span>•</span>
                                  <span>{item.membership.ministry}</span>
                                  <span>•</span>
                                  <span>{item.membership.status}</span>
                                  {item.membership.expiration_date && (
                                    <>
                                      <span>•</span>
                                      <span>
                                        current expiry{" "}
                                        {new Date(
                                          `${item.membership.expiration_date}T00:00:00`
                                        ).toLocaleDateString()}
                                      </span>
                                    </>
                                  )}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="rounded-none border border-[#E6DADB] border-t-[3px] border-t-[#890022] bg-white shadow-none overflow-hidden">
                    <div className="border-b border-border bg-amber-50/70 px-4 py-3">
                      <h2 className="text-sm font-semibold text-amber-900">
                        Needs Review
                      </h2>
                      <p className="text-xs text-amber-800">
                        These rows are excluded from batch processing. Review them
                        manually before deciding whether they represent a transfer,
                        new ministry assignment, typo, or repeated CSV entry.
                      </p>
                    </div>
                    {renewalStaging.review.length === 0 ? (
                      <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                        No ambiguous rows.
                      </div>
                    ) : (
                      <div className="max-h-72 overflow-y-auto divide-y divide-border">
                        {renewalStaging.review.map((item, index) => (
                          <div key={`${item.incoming.first_name}-${item.incoming.last_name}-${item.normalizedMinistry}-${index}`} className="px-4 py-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium">
                                  {item.incoming.first_name}{" "}
                                  {item.incoming.last_name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {item.incoming.parish} •{" "}
                                  {item.normalizedMinistry}
                                </p>
                              </div>
                              <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800">
                                {getRenewalReviewLabel(item)}
                              </span>
                            </div>
                            {item.candidates.length > 0 && (
                              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                {item.candidates.slice(0, 3).map((candidate) => (
                                  <p key={candidate.member.id}>
                                    Possible: {candidate.member.first_name}{" "}
                                    {candidate.member.last_name} (
                                    {candidate.member.uid}) —{" "}
                                    {candidate.member.parish}
                                    {candidate.matchType === "similar_name"
                                      ? ` — ${Math.round(candidate.similarity * 100)}% similar`
                                      : ""}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-none border border-[#E6DADB] border-t-[3px] border-t-[#890022] bg-white shadow-none overflow-hidden">
                    <div className="border-b border-border bg-muted/50 px-4 py-3">
                      <h2 className="text-sm font-semibold">Unmatched</h2>
                      <p className="text-xs text-muted-foreground">
                        No registry member matched these rows. Renewal mode does
                        not create new members automatically.
                      </p>
                    </div>
                    {renewalStaging.unmatched.length === 0 ? (
                      <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                        No unmatched rows.
                      </div>
                    ) : (
                      <div className="max-h-64 overflow-y-auto divide-y divide-border">
                        {renewalStaging.unmatched.map((item, index) => (
                          <div
                            key={`${item.incoming.first_name}-${item.incoming.last_name}-${item.normalizedMinistry}-${index}`}
                            className="px-4 py-3"
                          >
                            <p className="text-sm font-medium">
                              {item.incoming.first_name}{" "}
                              {item.incoming.last_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {item.incoming.parish} • {item.normalizedMinistry}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-none border-2 border-primary/20 bg-primary/5 p-5 shadow-sm">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold">
                          Confirm batch renewal
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {renewalSelected.size} exact membership
                          {renewalSelected.size === 1 ? "" : "s"} selected. Their
                          previous recommendation letters will be archived before
                          the shared letter becomes current. Review and unmatched
                          rows will not be changed.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={processRenewalBatch}
                        disabled={
                          renewalProcessing ||
                          renewalSelected.size === 0 ||
                          !renewalLetter
                        }
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-none bg-[#890022] px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
                      >
                        {renewalProcessing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        Renew selected memberships
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* RENEWAL HISTORY TAB */}
      {/* ============================================================ */}
      {activeTab === "history" && (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className={`${ebGaramond.className} text-[29px] leading-tight font-semibold tracking-tight text-[#211018] flex items-center gap-2`}>
                <History className="h-6 w-6 text-primary" />
                Renewal History
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Durable audit history for parish recommendation renewal batches,
                including the shared document, processing dates, and the exact
                ministry memberships covered by each batch.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadRenewalHistory()}
              disabled={renewalHistoryLoading}
              className="inline-flex shrink-0 items-center gap-2 rounded-none border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
            >
              <RefreshCw
                className={`h-4 w-4 ${renewalHistoryLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>

          {renewalHistoryError && (
            <div className="flex items-start gap-2 rounded-none bg-destructive/10 px-4 py-3 text-sm text-destructive ring-1 ring-inset ring-destructive/20">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{renewalHistoryError}</span>
            </div>
          )}

          {renewalHistoryLoading ? (
            <div className="flex items-center justify-center rounded-none border border-[#E6DADB] border-t-[3px] border-t-[#890022] bg-white py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : renewalHistory.length === 0 ? (
            <div className="rounded-none border border-dashed border-border py-16 text-center">
              <History className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">
                No renewal batches recorded yet.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Completed recommendation renewal batches will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {renewalHistory.map((batch) => {
                const expanded = expandedHistoryBatchId === batch.id;
                const ministryCount = new Set(
                  batch.memberships.map((membership) => membership.ministry)
                ).size;

                return (
                  <div
                    key={batch.id}
                    className="rounded-none border border-[#E6DADB] border-t-[3px] border-t-[#890022] bg-white shadow-none overflow-hidden"
                  >
                    <div className="p-4 sm:p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-sm font-semibold">
                              {batch.parish}
                            </h2>
                            {batch.ministry && (
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                                {shortMinistry(batch.ministry)}
                              </span>
                            )}
                            {!batch.ministry && ministryCount > 1 && (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                {ministryCount} ministries
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span>
                              Processed{" "}
                              <strong className="font-medium text-foreground">
                                {new Date(batch.processed_at).toLocaleString()}
                              </strong>
                            </span>
                            <span>
                              Renewal{" "}
                              <strong className="font-medium text-foreground">
                                {new Date(`${batch.renewal_date}T00:00:00`).toLocaleDateString()}
                              </strong>
                            </span>
                            <span>
                              Next due{" "}
                              <strong className="font-medium text-foreground">
                                {new Date(`${batch.next_renewal_date}T00:00:00`).toLocaleDateString()}
                              </strong>
                            </span>
                            <span>
                              <strong className="font-medium text-foreground">
                                {batch.memberships.length}
                              </strong>{" "}
                              membership{batch.memberships.length === 1 ? "" : "s"}
                            </span>
                          </div>

                          {batch.notes && (
                            <p className="text-xs text-muted-foreground">
                              {batch.notes}
                            </p>
                          )}

                          <p className="text-[11px] text-muted-foreground">
                            Processor:{" "}
                            <code>
                              {batch.processed_by
                                ? `${batch.processed_by.slice(0, 8)}…`
                                : "not recorded"}
                            </code>
                            {" "}· Batch ID:{" "}
                            <code>{batch.id.slice(0, 8)}…</code>
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void openRenewalHistoryDocument(batch)}
                            disabled={openingHistoryDocumentId === batch.id}
                            className="inline-flex items-center gap-1.5 rounded-none border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
                          >
                            {openingHistoryDocumentId === batch.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ExternalLink className="h-3.5 w-3.5" />
                            )}
                            View letter
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedHistoryBatchId(expanded ? null : batch.id)
                            }
                            className="inline-flex items-center gap-1.5 rounded-none border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                          >
                            {expanded ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                            {expanded ? "Hide members" : "View members"}
                          </button>
                        </div>
                      </div>
                    </div>

                    {expanded && (
                      <div className="border-t border-border bg-muted/20">
                        {batch.memberships.length === 0 ? (
                          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                            No membership snapshots were recorded for this batch.
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[760px] text-xs">
                              <thead className="bg-[#FBF7F8]">
                                <tr className="text-left">
                                  <th className="px-4 py-2.5 font-semibold">
                                    Member
                                  </th>
                                  <th className="px-4 py-2.5 font-semibold">
                                    UID
                                  </th>
                                  <th className="px-4 py-2.5 font-semibold">
                                    Ministry
                                  </th>
                                  <th className="px-4 py-2.5 font-semibold">
                                    Previous
                                  </th>
                                  <th className="px-4 py-2.5 font-semibold">
                                    Result
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {batch.memberships.map((membership) => (
                                  <tr key={membership.id}>
                                    <td className="px-4 py-2.5 font-medium">
                                      {membership.member_name}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <code className="text-[11px] text-muted-foreground">
                                        {membership.member_uid}
                                      </code>
                                    </td>
                                    <td className="px-4 py-2.5">
                                      {membership.ministry}
                                    </td>
                                    <td className="px-4 py-2.5 text-muted-foreground">
                                      <div className="space-y-0.5">
                                        <p>{membership.previous_status ?? "—"}</p>
                                        {membership.previous_expiration_date && (
                                          <p>
                                            Exp.{" "}
                                            {new Date(
                                              `${membership.previous_expiration_date}T00:00:00`
                                            ).toLocaleDateString()}
                                          </p>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <div className="space-y-0.5">
                                        <p className="font-medium text-[#2563A6]">
                                          {membership.result_status}
                                        </p>
                                        <p className="text-muted-foreground">
                                          Exp.{" "}
                                          {new Date(
                                            `${membership.result_expiration_date}T00:00:00`
                                          ).toLocaleDateString()}
                                        </p>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* PENDING MERGES TAB */}
      {/* ============================================================ */}
      {activeTab === "pending" && (
        <div className="space-y-5">
          <div>
            <h1 className={`${ebGaramond.className} text-[29px] leading-tight font-semibold tracking-tight text-[#211018] flex items-center gap-2`}>
              <GitMerge className="h-6 w-6 text-primary" />
              Registration Import — Pending Duplicate Merges
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Only duplicates held during new-member registration imports appear here. Renewal CSV rows marked Needs Review are separate staging results, not saved to this queue.
            </p>
          </div>

          {actionError && (
            <div className="flex items-start gap-2 rounded-none bg-destructive/10 px-4 py-3 text-sm text-destructive ring-1 ring-inset ring-destructive/20">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {pendingMerges.length === 0 ? (
            <div className="rounded-none border border-dashed border-border py-16 text-center">
              <Inbox className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">
                No pending merges.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Duplicate entries intercepted during import will appear here
                for side-by-side reconciliation.
              </p>
              {mergeSummary && (
                <div className="mt-6 inline-flex items-center gap-4 rounded-none border border-border bg-card px-5 py-3 shadow-sm">
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
              <div className="flex items-center justify-between rounded-none border border-[#E6DADB] border-t-[3px] border-t-[#890022] bg-white px-5 py-3 shadow-none">
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
                    <div className="rounded-none border border-border bg-muted/20 p-5 shadow-sm">
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
                    <div className="rounded-none border-2 border-dashed border-primary/40 bg-primary/5 p-5 shadow-sm">
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
                      className="inline-flex items-center justify-center gap-2 rounded-none bg-[#890022] px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-sm"
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
                      className="inline-flex items-center justify-center gap-2 rounded-none border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-60"
                    >
                      <UserX className="h-4 w-4" />
                      Keep Separate — insert as new record
                    </button>
                    <button
                      onClick={resolveDiscard}
                      disabled={actionLoading}
                      className="inline-flex items-center justify-center gap-2 rounded-none border border-border px-4 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-60"
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
      className={`rounded-none px-3 py-2 ${
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
