import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { MINISTRIES, shortMinistry } from "@/lib/constants";
import type { Member, MemberMinistry } from "@/lib/types";


const MEMBER_PAGE_SIZE = 1000;

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

async function createMemberMinistries(
  memberId: string,
  ministries: string[]
): Promise<string | null> {
  if (ministries.length === 0) return null;

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("member_ministries")
    .insert(buildMembershipRows(memberId, ministries));

  return error?.message ?? null;
}

export interface DuplicateMatch {
  existing: Member;
  isDuplicate: boolean;
  matchType: "exact" | "similar_name" | "same_name_different_parish";
  similarity?: number;
}

/**
 * Calculate Levenshtein distance between two strings.
 * Used for fuzzy name matching to catch misspellings.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  for (let i = 0; i <= aLower.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bLower.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= aLower.length; i++) {
    for (let j = 1; j <= bLower.length; j++) {
      if (aLower[i - 1] === bLower[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[aLower.length][bLower.length];
}

/**
 * Calculate similarity ratio between two strings (0-1).
 * Higher values indicate more similar strings.
 */
function similarityRatio(a: string, b: string): number {
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

/**
 * Check if two names are similar enough to be potential duplicates.
 * Threshold: 80% similarity for names with 4+ chars, exact for shorter.
 */
function areNamesSimilar(name1: string, name2: string): boolean {
  const n1 = name1.toLowerCase().trim();
  const n2 = name2.toLowerCase().trim();

  if (n1 === n2) return true;

  // Numeric suffixes are meaningful identity data. For example,
  // "Subject 3" and "Subject 4" (or "Juan II" and "Juan III" when written
  // numerically) should not be treated as misspellings of each other.
  const digits1 = n1.match(/\d+/g)?.join("|") ?? "";
  const digits2 = n2.match(/\d+/g)?.join("|") ?? "";
  if (digits1 !== digits2 && (digits1 || digits2)) return false;

  // For short names (3 chars or less), require exact match
  if (n1.length <= 3 || n2.length <= 3) return false;

  // For longer names, allow fuzzy matching with 80% similarity threshold
  return similarityRatio(n1, n2) >= 0.8;
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

      const firstSimilar = areNamesSimilar(trimmedFirst, m.first_name);
      const lastSimilar = areNamesSimilar(trimmedLast, m.last_name);

      // Both first AND last name must be similar to be flagged
      if (firstSimilar && lastSimilar) {
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
  const supabase = getSupabaseBrowserClient();

  const dupes = await findDuplicateMembers(
    data.first_name,
    data.last_name,
    data.parish
  );

  if (dupes.length > 0) {
    // Park in pending-merge queue. Do not create the member.
    const match = dupes[0];
    const existing = match.existing;
    const { data: flag, error } = await supabase
      .from("duplicate_flags")
      .insert({
        existing_member_id: existing.id,
        incoming_first_name: data.first_name,
        incoming_last_name: data.last_name,
        incoming_parish: data.parish,
        incoming_ministries: data.ministries,
        incoming_data: { ...data, matchType: match.matchType, similarity: match.similarity },
        resolved: false,
      })
      .select("id")
      .single();
    if (error) return { status: "error", error: error.message };
    return { status: "duplicate", existing, flagId: flag!.id, matchType: match.matchType };
  }

  const { data: member, error } = await supabase
    .from("members")
    .insert({
      first_name: data.first_name,
      last_name: data.last_name,
      parish: data.parish,
      ministries: data.ministries,
      service_year: data.service_year,
      notes: data.notes ?? null,
      status: "Pending Verification",
      uid: "PENDING", // trigger overwrites
    })
    .select("*")
    .single();

  if (error) return { status: "error", error: error.message };

  const createdMember = member as Member;
  const membershipError = await createMemberMinistries(
    createdMember.id,
    data.ministries
  );

  if (membershipError) {
    await supabase.from("members").delete().eq("id", createdMember.id);
    return {
      status: "error",
      error: `Member creation was rolled back because ministry memberships could not be created: ${membershipError}`,
    };
  }

  return { status: "created", member: createdMember };
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
export async function importMemberBatch(
  batch: IncomingMemberData[],
  startIndex: number
): Promise<BatchResult[]> {
  if (batch.length === 0) return [];
  const supabase = getSupabaseBrowserClient();

  const results: BatchResult[] = new Array(batch.length);

  const insertPayload = batch.map((data) => buildInsertRow(data));

  // Fast path: try one bulk insert for the whole batch.
  const { data: inserted, error: insErr } = await supabase
    .from("members")
    .insert(insertPayload)
    .select("*");

  if (!insErr && inserted) {
    const createdMembers = inserted as Member[];
    const membershipRows = createdMembers.flatMap((member, index) =>
      buildMembershipRows(member.id, batch[index]?.ministries ?? [])
    );

    const { error: membershipError } = membershipRows.length
      ? await supabase.from("member_ministries").insert(membershipRows)
      : { error: null };

    if (membershipError) {
      const createdIds = createdMembers.map((member) => member.id);
      if (createdIds.length > 0) {
        await supabase.from("members").delete().in("id", createdIds);
      }

      const message =
        `Batch creation was rolled back because ministry memberships could not be created: ${membershipError.message}`;

      for (let j = 0; j < batch.length; j++) {
        results[j] = {
          index: startIndex + j,
          status: "error",
          error: message,
        };
      }

      return results;
    }

    // Bulk insert and relationship creation both succeeded.
    for (let j = 0; j < batch.length; j++) {
      const created = createdMembers[j];
      results[j] = created
        ? { index: startIndex + j, status: "created" }
        : {
            index: startIndex + j,
            status: "error",
            error: "No row returned on insert",
          };
    }
    return results;
  }

  // If the failure is a unique-constraint violation (23505), fall back to
  // per-row inserts so we can isolate the duplicates and keep the others.
  // Any other error is treated as fatal for the whole batch.
  const isUniqueViolation =
    (insErr as { code?: string } | null)?.code === "23505";

  if (!isUniqueViolation) {
    const msg = insErr?.message ?? "Insert failed";
    for (let j = 0; j < batch.length; j++) {
      results[j] = { index: startIndex + j, status: "error", error: msg };
    }
    return results;
  }

  // Slow path: 23505 was raised on the bulk insert. Insert one row at a time
  // so colliding rows are classified as "duplicate" and skipped, while every
  // other row is still created. Within-batch duplicates (the same person
  // appearing twice in the same CSV) are also caught here.
  for (let i = 0; i < batch.length; i++) {
    const data = batch[i];
    const { data: row, error: rowErr } = await supabase
      .from("members")
      .insert(buildInsertRow(data))
      .select("*")
      .single();
    if (rowErr) {
      const code = (rowErr as { code?: string }).code;
      if (code === "23505") {
        results[i] = {
          index: startIndex + i,
          status: "duplicate",
          error: undefined,
        };
      } else {
        results[i] = {
          index: startIndex + i,
          status: "error",
          error: rowErr.message,
        };
      }
    } else {
      const createdMember = row as Member;
      const membershipError = await createMemberMinistries(
        createdMember.id,
        data.ministries
      );

      if (membershipError) {
        await supabase.from("members").delete().eq("id", createdMember.id);
        results[i] = {
          index: startIndex + i,
          status: "error",
          error: `Member creation was rolled back because ministry memberships could not be created: ${membershipError}`,
        };
      } else {
        results[i] = { index: startIndex + i, status: "created" };
      }
    }
  }

  return results;
}
