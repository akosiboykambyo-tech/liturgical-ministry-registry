/**
 * REVIEW-ONLY helper for the proposed v2 CSV contract.
 * No registration UI calls this file. It does not create a request UUID:
 * the importer must persist one random UUID per logical record and reuse it
 * after uncertain responses, never silently generate a new retry identity.
 *
 * Source identity is a file SHA-256 digest plus the first 1-based physical CSV
 * data row for this logical member. With a header on row 1, the first row is 2.
 */
export function csvRegistrationSourceKey(
  fileSha256: string,
  firstPhysicalRow: number,
): string {
  if (typeof fileSha256 !== "string" || !/^[0-9a-f]{64}$/i.test(fileSha256)) {
    throw new Error("Expected a SHA-256 file digest.");
  }
  if (!Number.isSafeInteger(firstPhysicalRow) ||
      firstPhysicalRow < 2 || firstPhysicalRow > 999999999) {
    throw new Error("Expected a valid physical CSV data-row number.");
  }
  return `sha256:${fileSha256.toLowerCase()}:row:${firstPhysicalRow}`;
}

/**
 * Multiple CSV rows representing one person should share one registration
 * source identity, keyed to their earliest physical row in the original file.
 * Sorting/grouping must not change that row index or regenerate the UUID.
 */
export function csvRegistrationGroupSourceKey(
  fileSha256: string,
  physicalRows: readonly number[],
): string {
  if (!physicalRows.length) throw new Error("CSV group must contain source rows.");
  for (const row of physicalRows) {
    if (!Number.isSafeInteger(row) || row < 2 || row > 999999999) {
      throw new Error("Invalid CSV source row.");
    }
  }
  return csvRegistrationSourceKey(fileSha256, Math.min(...physicalRows));
}
