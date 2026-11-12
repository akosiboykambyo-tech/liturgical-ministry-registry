import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { registryAdminWrite } from "@/lib/registry-admin-writes";
import { MINISTRIES, shortMinistry } from "@/lib/constants";
import type { Member, MemberMinistry } from "@/lib/types";
import { areNamesSimilar, similarityRatio, classifyIdentityMatch } from "@/lib/registration-matching";


const MEMBER_PAGE_SIZE = 1000;
const MEMBER_MINISTRY_PAGE_SIZE = 1000;

async function fetchAllMembers(): Promise<Member[]> {
  const supabase = getSupabaseBrowserClient();
  const all: Member[] = [];

  for (let from = 0; ; from += MEMBER_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("members")
      .select("*")
      .range(from, from + MEMBER_PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    const batch = (data as Member[]) ?? [];
    all.push(...batch);

    if (batch.length < MEMBER_PAGE_SIZE) break;
  }

  return all;
}

async function fetchAllMemberMinistries(): Promise<MemberMinistry[]> {
  const supabase = getSupabaseBrowserClient();
  const all: MemberMinistry[] = [];

  for (let from = 0; ; from += MEMBER_MINISTRY_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("member_ministries")
      .select("*")
      .range(from, from + MEMBER_MINISTRY_PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    const batch = (data as MemberMinistry[]) ?? [];
    all.push(...batch);

    if (batch.length < MEMBER_MINISTRY_PAGE_SIZE) break;
  }

  return all;
}

function buildMembershipRows(
  memberId: string,
  ministries: string[]
): Array<
  Pick<
    MemberMinistry,
    | "member_id"
    | "ministry"
    | "status"
    | "start_date"
    | "expiration_date"
    | "renewal_date"
    | "document_url"
    | "document_uploaded_at"
    | "archived_documents"
  >
> {
  return ministries.map((ministry) => ({
    member_id: memberId,
    ministry,
    status: "Pending Verification",
    start_date: null,
    expiration_date: null,
    renewal_date: null,
    document_url: null,
    document_uploaded_at: null,
    archived_documents: [],
  }));
}

export interface DuplicateMatch {
  existing: Member;
  isDuplicate: boolean;
  matchType: "exact" | "similar_name" | "same_name_different_parish";
  similarity?: number;
}

/**
 * Cross-Ministry Duplicate Detection (Interception Layer).
 *
 * Detection rules:
 * 1. EXACT MATCH: Same first name, last name, and parish (case-insensitive)
 * 2. SAME NAME, DIFFERENT PARISH: Same first and last name but different parish
 *    (member may have transferred or been entered twice)
 * 3. SIMILAR NAME: Names that are 80%+ similar (catches misspellings like "Juan" vs "Juhn")
 *
 * When matched, we do NOT auto-merge or overwrite - the entry is intercepted
 * and routed to the Pending Merges queue for manual review.
 *
 * Returns the list of existing members that potentially collide with the incoming record.
 */
export async function findDuplicateMembers(
  firstName: string,
  lastName: string,
  parish: string
): Promise<DuplicateMatch[]> {
  const supabase = getSupabaseBrowserClient();
  const matches: DuplicateMatch[] = [];
  const trimmedFirst = firstName.trim();
  const trimmedLast = lastName.trim();
  const trimmedParish = parish.trim();

  // Guard: never run a duplicate query with empty values — that produces
  // false positives on an empty database (ilike "" matches everything).
  if (!trimmedFirst || !trimmedLast || !trimmedParish) {
    return [];
  }

  // 1. Exact match: same first name, last name, and parish
  const { data: exactMatches, error: exactError } = await supabase
    .from("members")
    .select("*")
    .ilike("first_name", trimmedFirst)
    .ilike("last_name", trimmedLast)
    .ilike("parish", trimmedParish);

  if (!exactError && exactMatches) {
    for (const m of exactMatches as Member[]) {
      matches.push({
        existing: m,
        isDuplicate: true,
        matchType: "exact",
        similarity: 1,
      });
    }
  }

  // 2. Same name, different parish (potential transfer or duplicate entry)
  const { data: sameNameDiffParish, error: parishError } = await supabase
    .from("members")
    .select("*")
    .ilike("first_name", trimmedFirst)
    .ilike("last_name", trimmedLast)
    .not("parish", "ilike", trimmedParish);

  if (!parishError && sameNameDiffParish) {
    for (const m of sameNameDiffParish as Member[]) {
      // Avoid duplicates if already matched
      if (!matches.some((x) => x.existing.id === m.id)) {
        matches.push({
          existing: m,
          isDuplicate: true,
          matchType: "same_name_different_parish",
          similarity: 1,
        });
      }
    }
  }

  // 3. Similar names (fuzzy matching) - fetch all and filter client-side
  // This catches misspellings like "Juan" vs "Juhn", "Dela Cruz" vs "Dela Crz"
  let allMembers: Member[] = [];
  try {
    allMembers = await fetchAllMembers();
  } catch {
    allMembers = [];
  }

  if (allMembers.length > 0) {
    for (const m of allMembers) {
      // Skip if already in matches
      if (matches.some((x) => x.existing.id === m.id)) continue;

      const identityMatch = classifyIdentityMatch(
        { first_name: trimmedFirst, last_name: trimmedLast, parish: trimmedParish },
        m
      );

      // Exact/parish matches were already collected above.
      if (identityMatch === "similar_name") {
        const avgSimilarity =
          (similarityRatio(trimmedFirst, m.first_name) +
            similarityRatio(trimmedLast, m.last_name)) /
          2;

        matches.push({
          existing: m,
          isDuplicate: true,
          matchType: "similar_name",
          similarity: avgSimilarity,
        });
      }
    }
  }

  // Sort by similarity (highest first) and match type priority
  return matches.sort((a, b) => {
    // Exact matches come first
    if (a.matchType === "exact" && b.matchType !== "exact") return -1;
    if (b.matchType === "exact" && a.matchType !== "exact") return 1;
    // Then same name different parish
    if (a.matchType === "same_name_different_parish" && b.matchType === "similar_name") return -1;
    if (b.matchType === "same_name_different_parish" && a.matchType === "similar_name") return 1;
    // Then by similarity
    return (b.similarity ?? 0) - (a.similarity ?? 0);
  });
}

export interface IncomingMemberData {
  first_name: string;
  last_name: string;
  parish: string;
  ministries: string[];
  service_year: number;
  notes?: string | null;
}

/**
 * Attempts to import a single member. If a duplicate is detected, the entry is
 * parked in the `duplicate_flags` queue and returns `{ status: "duplicate" }`
 * instead of creating the member. The admin must manually resolve it.
 */
export async function importSingleMember(
  data: IncomingMemberData
): Promise<
  | { status: "created"; member: Member }
  | { status: "duplicate"; existing: Member; flagId: string; matchType: string }
  | { status: "error"; error: string }
> {
  const dupes = await findDuplicateMembers(
    data.first_name,
    data.last_name,
    data.parish
  );

  if (dupes.length > 0) {
    // Park in pending-merge queue. Do not create the member.
    const match = dupes[0];
    const existing = match.existing;
    const flagged = await registryAdminWrite<{ id: string }>("flag_duplicate", {
      existing_member_id: existing.id,
      incoming_first_name: data.first_name,
      incoming_last_name: data.last_name,
      incoming_parish: data.parish,
      incoming_ministries: data.ministries,
      incoming_data: { ...data, matchType: match.matchType, similarity: match.similarity },
    }).catch((error: Error) => ({ error: error.message }));
    if ("error" in flagged) return { status: "error", error: flagged.error as string };
    return { status: "duplicate", existing, flagId: flagged.id, matchType: match.matchType };
  }

  try {
    const created = await registryAdminWrite<{ member: Member }>("create", { ...data });
    return { status: "created", member: created.member };
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : "Member creation failed" };
  }
}

export interface IncomingRecord {
  first_name: string;
  last_name: string;
  parish: string;
  ministry: string;
}

export type DuplicateSource = "db" | "internal_batch";
export type DuplicateMatchType =
  | "exact"
  | "same_name_different_parish"
  | "similar_name"
  | "internal_batch_exact"
  | "internal_batch_fuzzy";

export interface StagedDuplicate {
  incoming: IncomingRecord;
  existing: Member | null; // null for internal_batch duplicates (no DB record yet)
  matchType: DuplicateMatchType;
  similarity: number;
  source: DuplicateSource;
}

export interface BatchStagingResult {
  unique: IncomingMemberData[];
  duplicates: StagedDuplicate[];
  alreadyImported?: {
    batchId: string;
    fileName: string;
    createdAt: string;
    uniqueInserted: number;
    duplicatesRouted: number;
  };
}

function normalizeMinistriesRaw(raw: string): string[] {
  const ministries: string[] = [];
  for (const part of raw.split(/[;,/]+/)) {
    const clean = part.trim();
    if (!clean) continue;
    const found = MINISTRIES.find(
      (m) =>
        m.toLowerCase() === clean.toLowerCase() ||
        shortMinistry(m).toLowerCase() === clean.toLowerCase()
    );
    ministries.push(found ?? `Other (${clean})`);
  }
  return ministries.length > 0 ? ministries : ["Other"];
}

/**
 * Pre-check a batch of incoming records against:
 *
 * 1. INTERNAL BATCH DUPLICATION — duplicates within the CSV itself.
 *    If two rows in the same file share the same name+parish (exact or fuzzy),
 *    only the first is staged for insertion; the rest are routed to the
 *    duplicates queue with source="internal_batch".
 *
 * 2. DATABASE DUPLICATES — records that match existing members in the DB.
 *    Uses a composite natural key of first_name + last_name + parish.
 *    Three match tiers:
 *      a. EXACT: case-insensitive exact match on all three fields.
 *      b. SAME_NAME_DIFFERENT_PARISH: same name, different parish (transfer?).
 *      c. SIMILAR_NAME: 80%+ Levenshtein similarity on both first and last
 *         name (catches misspellings like "Juan" vs "Juhn").
 *
 * 3. IDEMPOTENCY — if `fileHash` is provided, checks the import_batches table
 *    for a prior completed import of the same file. Returns `alreadyImported`
 *    with the prior batch details so the UI can warn before proceeding.
 *
 * Records that pass all checks are returned in `unique` for immediate
 * insertion (auto-generating their UID). Duplicates are routed to `duplicates`
 * for manual reconciliation in the Pending Merges queue.
 */
export async function stageBatchRecords(
  records: IncomingRecord[],
  fileHash: string | undefined,
  serviceYear: number
): Promise<BatchStagingResult> {
  const supabase = getSupabaseBrowserClient();
  const unique: IncomingMemberData[] = [];
  const duplicates: StagedDuplicate[] = [];

  // --- Idempotency check ---
  let alreadyImported: BatchStagingResult["alreadyImported"] | undefined;
  if (fileHash) {
    const { data: prior } = await supabase
      .from("import_batches")
      .select("id, file_name, created_at, unique_inserted, duplicates_routed, status")
      .eq("file_hash", fileHash)
      .maybeSingle();
    if (prior) {
      alreadyImported = {
        batchId: prior.id as string,
        fileName: (prior.file_name as string) ?? "unknown",
        createdAt: prior.created_at as string,
        uniqueInserted: prior.unique_inserted as number,
        duplicatesRouted: prior.duplicates_routed as number,
      };
    }
  }

  // --- Fetch all existing members once ---
  // Paginate explicitly so duplicate detection is not limited to Supabase's
  // default 1,000 returned rows.
  let allMembers: Member[] = [];
  try {
    allMembers = await fetchAllMembers();
  } catch {
    allMembers = [];
  }

  const dbMembers = allMembers.map((m) => ({
    member: m,
    first: m.first_name.toLowerCase().trim(),
    last: m.last_name.toLowerCase().trim(),
    parish: m.parish.toLowerCase().trim(),
  }));

  // --- Track records already staged as unique in this batch ---
  // Multiple CSV rows for the same person + parish are expected when the
  // person serves in more than one ministry. Those rows are consolidated into
  // one member insert with multiple member_ministries rows.
  const stagedUniqueKeys: Array<{
    first: string;
    last: string;
    parish: string;
    uniqueIndex: number;
  }> = [];

  const stagedDuplicateKeys: Array<{
    first: string;
    last: string;
    parish: string;
    duplicateIndex: number;
  }> = [];

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const first = rec.first_name.toLowerCase().trim();
    const last = rec.last_name.toLowerCase().trim();
    const parish = rec.parish.toLowerCase().trim();
    const ministries = normalizeMinistriesRaw(rec.ministry);

    // --- Check 1: Same person + same parish already staged ---
    // If an earlier row for this person was already routed to DB duplicate
    // review, fold this row's ministry into that same pending-merge item.
    // Reconciliation should happen once per person, not once per ministry row.
    const stagedDuplicate = stagedDuplicateKeys.find(
      (s) => s.first === first && s.last === last && s.parish === parish
    );

    if (stagedDuplicate) {
      const pending = duplicates[stagedDuplicate.duplicateIndex];
      const pendingMinistries = normalizeMinistriesRaw(pending.incoming.ministry);
      const mergedPendingMinistries = Array.from(
        new Set([...pendingMinistries, ...ministries])
      );

      pending.incoming = {
        ...pending.incoming,
        ministry: mergedPendingMinistries.join("; "),
      };

      continue;
    }

    const internalExact = stagedUniqueKeys.find(
      (s) => s.first === first && s.last === last && s.parish === parish
    );

    if (internalExact) {
      const staged = unique[internalExact.uniqueIndex];
      const newMinistries = ministries.filter(
        (ministry) => !staged.ministries.includes(ministry)
      );

      if (newMinistries.length > 0) {
        staged.ministries = Array.from(
          new Set([...staged.ministries, ...newMinistries])
        );
      } else {
        // An exact repeated row with no new ministry is still a duplicate.
        duplicates.push({
          incoming: rec,
          existing: null,
          matchType: "internal_batch_exact",
          similarity: 1,
          source: "internal_batch",
        });
      }

      continue;
    }

    // Then check for fuzzy internal batch dup (same name, different parish
    // or similar name within the same CSV)
    const internalFuzzy = stagedUniqueKeys.find((s) => {
      const sameName = s.first === first && s.last === last;
      const sameNameDiffParish = sameName && s.parish !== parish;
      const similarName =
        areNamesSimilar(s.first, first) && areNamesSimilar(s.last, last);
      return sameNameDiffParish || similarName;
    });
    if (internalFuzzy) {
      const sim =
        (similarityRatio(internalFuzzy.first, first) +
          similarityRatio(internalFuzzy.last, last)) /
        2;
      duplicates.push({
        incoming: rec,
        existing: null,
        matchType: "internal_batch_fuzzy",
        similarity: sim,
        source: "internal_batch",
      });
      continue;
    }

    // --- Check 2: Database duplicates ---
    // Tier 2a: Exact match (case-insensitive on all three fields)
    const exactMatch = dbMembers.find(
      (m) => m.first === first && m.last === last && m.parish === parish
    );
    if (exactMatch) {
      const duplicateIndex = duplicates.length;
      duplicates.push({
        incoming: rec,
        existing: exactMatch.member,
        matchType: "exact",
        similarity: 1,
        source: "db",
      });
      stagedDuplicateKeys.push({ first, last, parish, duplicateIndex });
      continue;
    }

    // Tier 2b: Same name, different parish
    const sameNameDiffParish = dbMembers.find(
      (m) => m.first === first && m.last === last && m.parish !== parish
    );
    if (sameNameDiffParish) {
      const duplicateIndex = duplicates.length;
      duplicates.push({
        incoming: rec,
        existing: sameNameDiffParish.member,
        matchType: "same_name_different_parish",
        similarity: 1,
        source: "db",
      });
      stagedDuplicateKeys.push({ first, last, parish, duplicateIndex });
      continue;
    }

    // Tier 2c: Similar name (fuzzy, 80% threshold on both first and last)
    const similarMatch = dbMembers.find((m) => {
      const firstSim = areNamesSimilar(first, m.first);
      const lastSim = areNamesSimilar(last, m.last);
      return firstSim && lastSim;
    });
    if (similarMatch) {
      const sim =
        (similarityRatio(first, similarMatch.first) +
          similarityRatio(last, similarMatch.last)) /
        2;
      const duplicateIndex = duplicates.length;
      duplicates.push({
        incoming: rec,
        existing: similarMatch.member,
        matchType: "similar_name",
        similarity: sim,
        source: "db",
      });
      stagedDuplicateKeys.push({ first, last, parish, duplicateIndex });
      continue;
    }

    // --- Passed all checks: stage for insertion ---
    const uniqueIndex = unique.length;
    stagedUniqueKeys.push({ first, last, parish, uniqueIndex });
    unique.push({
      first_name: rec.first_name.trim(),
      last_name: rec.last_name.trim(),
      parish: rec.parish.trim(),
      ministries,
      service_year: serviceYear,
    });
  }

  return { unique, duplicates, alreadyImported };
}


export type RenewalReviewReason =
  | "multiple_exact_members"
  | "missing_membership"
  | "same_name_different_parish"
  | "similar_name"
  | "duplicate_csv_membership";

export interface RenewalMatchCandidate {
  member: Member;
  memberships: MemberMinistry[];
  matchType: "exact" | "same_name_different_parish" | "similar_name";
  similarity: number;
}

export interface RenewableMembership {
  incoming: IncomingRecord;
  normalizedMinistry: string;
  existing: Member;
  membership: MemberMinistry;
}

export interface RenewalReviewItem {
  incoming: IncomingRecord;
  normalizedMinistry: string;
  reason: RenewalReviewReason;
  candidates: RenewalMatchCandidate[];
}

export interface RenewalUnmatchedItem {
  incoming: IncomingRecord;
  normalizedMinistry: string;
}

export interface RenewalBatchStagingResult {
  renewable: RenewableMembership[];
  review: RenewalReviewItem[];
  unmatched: RenewalUnmatchedItem[];
  totalMemberships: number;
}

/**
 * Stage a parish/ministry renewal roster without writing anything to the DB.
 *
 * Classification rules:
 * - exact member + exact existing member_ministries row => renewable
 * - exact member + missing ministry membership => manual review
 * - same name in another parish => manual review
 * - fuzzy/similar name => manual review
 * - no registry match => unmatched
 * - repeated same person + parish + ministry within the CSV => manual review
 *
 * This function is intentionally read-only. It never creates members, never
 * creates memberships, and never updates recommendation documents.
 */
export async function stageRenewalBatch(
  records: IncomingRecord[]
): Promise<RenewalBatchStagingResult> {
  const [allMembers, allMemberships] = await Promise.all([
    fetchAllMembers(),
    fetchAllMemberMinistries(),
  ]);

  const membershipsByMemberId = new Map<string, MemberMinistry[]>();
  for (const membership of allMemberships) {
    const current = membershipsByMemberId.get(membership.member_id) ?? [];
    current.push(membership);
    membershipsByMemberId.set(membership.member_id, current);
  }

  const dbMembers = allMembers.map((member) => ({
    member,
    first: member.first_name.toLowerCase().trim(),
    last: member.last_name.toLowerCase().trim(),
    parish: member.parish.toLowerCase().trim(),
  }));

  const renewable: RenewableMembership[] = [];
  const review: RenewalReviewItem[] = [];
  const unmatched: RenewalUnmatchedItem[] = [];
  const seenCsvMemberships = new Set<string>();
  let totalMemberships = 0;

  const buildCandidate = (
    member: Member,
    matchType: RenewalMatchCandidate["matchType"],
    similarity: number
  ): RenewalMatchCandidate => ({
    member,
    memberships: membershipsByMemberId.get(member.id) ?? [],
    matchType,
    similarity,
  });

  for (const record of records) {
    const first = record.first_name.toLowerCase().trim();
    const last = record.last_name.toLowerCase().trim();
    const parish = record.parish.toLowerCase().trim();
    const normalizedMinistries = normalizeMinistriesRaw(record.ministry);

    for (const normalizedMinistry of normalizedMinistries) {
      totalMemberships += 1;

      const csvKey = [
        first,
        last,
        parish,
        normalizedMinistry.toLowerCase().trim(),
      ].join("|");

      if (seenCsvMemberships.has(csvKey)) {
        const exactMembers = dbMembers.filter(
          (entry) =>
            entry.first === first &&
            entry.last === last &&
            entry.parish === parish
        );

        review.push({
          incoming: record,
          normalizedMinistry,
          reason: "duplicate_csv_membership",
          candidates: exactMembers.map((entry) =>
            buildCandidate(entry.member, "exact", 1)
          ),
        });
        continue;
      }

      seenCsvMemberships.add(csvKey);

      const exactMembers = dbMembers.filter(
        (entry) =>
          entry.first === first &&
          entry.last === last &&
          entry.parish === parish
      );

      if (exactMembers.length > 1) {
        review.push({
          incoming: record,
          normalizedMinistry,
          reason: "multiple_exact_members",
          candidates: exactMembers.map((entry) =>
            buildCandidate(entry.member, "exact", 1)
          ),
        });
        continue;
      }

      if (exactMembers.length === 1) {
        const existing = exactMembers[0].member;
        const existingMemberships =
          membershipsByMemberId.get(existing.id) ?? [];

        const exactMembership = existingMemberships.find(
          (membership) =>
            membership.ministry.toLowerCase().trim() ===
            normalizedMinistry.toLowerCase().trim()
        );

        if (exactMembership) {
          renewable.push({
            incoming: record,
            normalizedMinistry,
            existing,
            membership: exactMembership,
          });
        } else {
          review.push({
            incoming: record,
            normalizedMinistry,
            reason: "missing_membership",
            candidates: [buildCandidate(existing, "exact", 1)],
          });
        }

        continue;
      }

      const sameNameDifferentParish = dbMembers.filter(
        (entry) =>
          entry.first === first &&
          entry.last === last &&
          entry.parish !== parish
      );

      if (sameNameDifferentParish.length > 0) {
        review.push({
          incoming: record,
          normalizedMinistry,
          reason: "same_name_different_parish",
          candidates: sameNameDifferentParish.map((entry) =>
            buildCandidate(entry.member, "same_name_different_parish", 1)
          ),
        });
        continue;
      }

      const similarMatches = dbMembers
        .filter((entry) => {
          const firstSimilar = areNamesSimilar(first, entry.first);
          const lastSimilar = areNamesSimilar(last, entry.last);
          return firstSimilar && lastSimilar;
        })
        .map((entry) => {
          const similarity =
            (similarityRatio(first, entry.first) +
              similarityRatio(last, entry.last)) /
            2;

          return buildCandidate(entry.member, "similar_name", similarity);
        })
        .sort((a, b) => b.similarity - a.similarity);

      if (similarMatches.length > 0) {
        review.push({
          incoming: record,
          normalizedMinistry,
          reason: "similar_name",
          candidates: similarMatches,
        });
        continue;
      }

      unmatched.push({
        incoming: record,
        normalizedMinistry,
      });
    }
  }

  return {
    renewable,
    review,
    unmatched,
    totalMemberships,
  };
}

export type BatchResult = {
  index: number;
  status: "created" | "duplicate" | "error";
  error?: string;
};

/** Build the insert payload row expected by the members table. */
function buildInsertRow(data: IncomingMemberData) {
  return {
    first_name: (data.first_name ?? "").trim(),
    last_name: (data.last_name ?? "").trim(),
    parish: (data.parish ?? "").trim(),
    ministries: data.ministries,
    service_year: data.service_year,
    status: "Pending Verification" as const,
    uid: "PENDING", // trigger overwrites with LMD-<year>-####
  };
}

/**
 * Process a batch of incoming members. We first attempt a single bulk INSERT
 * for all rows. If the database rejects the batch with Postgres error code
 * `23505` (unique_violation) — thrown by the unique index on
 * (first_name, last_name, parish, ministries) — we fall back to inserting
 * each row individually so that only the colliding rows are skipped while
 * the valid rows still succeed. This keeps the import resilient: one
 * duplicate never aborts the whole batch.
 */
/** Insert CSV rows using bounded, transactional administrator RPCs. */
export async function importMemberBatch(
  batch: IncomingMemberData[],
  startIndex: number
): Promise<BatchResult[]> {
  if (batch.length === 0) return [];
  const output: BatchResult[] = [];
  // Keep RPC payloads bounded. Each row is atomic; failures never require
  // browser-side cleanup and never leave orphan ministry assignments.
  for (let offset = 0; offset < batch.length; offset += 100) {
    const chunk = batch.slice(offset, offset + 100);
    try {
      const result = await registryAdminWrite<{
        rows: Array<{ status: BatchResult["status"]; error?: string }>;
      }>("create_batch", { rows: chunk });
      if (!Array.isArray(result.rows) || result.rows.length !== chunk.length)
        throw new Error("Incomplete server batch result");
      result.rows.forEach((row, i) => {
        output.push({
          index: startIndex + offset + i,
          status: row.status,
          error: row.error,
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Secure batch import failed";
      chunk.forEach((_, i) => {
        output.push({ index: startIndex + offset + i, status: "error", error: message });
      });
    }
  }
  return output;
}
