"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_BATCH = 100;

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/**
 * A private, immutable letter can cover one or several explicitly selected
 * ministry assignments. A batch's assignments must belong to one parish;
 * the database also enforces this rule.
 *
 * Upload is intentionally separate from renewal/verification and never writes
 * member status, registration dates, or expiration dates.
 */
export async function attachRecommendationLetter(
  assignmentIds: string[],
  file: File
): Promise<number> {
  if (
    !Array.isArray(assignmentIds) ||
    assignmentIds.length < 1 ||
    assignmentIds.length > MAX_ATTACHMENTS_PER_BATCH ||
    assignmentIds.some((id) => !UUID.test(id)) ||
    new Set(assignmentIds).size !== assignmentIds.length
  ) {
    throw new Error("Select between 1 and 100 distinct ministry assignments.");
  }

  const extension = EXTENSIONS[file.type];
  if (!extension || file.size < 1 || file.size > MAX_FILE_SIZE) {
    throw new Error("Choose a PDF, JPEG or PNG recommendation letter up to 5 MB.");
  }

  const supabase = getSupabaseBrowserClient();
  const path = `attachments/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("member-documents")
    .upload(path, file, { upsert: false, contentType: file.type });

  if (uploadError) throw new Error(`Private upload failed: ${uploadError.message}`);

  const { data, error } = await supabase.rpc(
    "registry_attach_ministry_letters_v2",
    { p_assignment_ids: assignmentIds, p_document_path: path }
  );

  if (
    error ||
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    data.attached !== true ||
    data.count !== assignmentIds.length
  ) {
    // The RPC may have committed even if its response was lost. Preserve the
    // uploaded object until an administrator can inspect its linkage.
    throw new Error(
      "The attachment could not be confirmed. The private upload was retained. " +
      "Refresh the records to inspect which assignments now show the letter " +
      "before retrying. " +
      (error?.message ?? "")
    );
  }
  return data.count as number;
}
