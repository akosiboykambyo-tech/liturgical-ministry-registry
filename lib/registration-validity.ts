/**
 * One-year ministry registration validity from verification or renewal.
 * Pure date-only calculation; does not alter current membership records.
 */
export function expirationOneYearAfter(verifiedOrRenewedDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(verifiedOrRenewedDate)) {
    throw new Error("Provide a date in YYYY-MM-DD format.");
  }
  const [year, month, day] = verifiedOrRenewedDate.split("-").map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day));
  if (anchor.getUTCFullYear() !== year || anchor.getUTCMonth() !== month - 1 || anchor.getUTCDate() !== day) {
    throw new Error("Invalid verification or renewal date.");
  }
  const nextYear = year + 1;
  const lastDay = new Date(Date.UTC(nextYear, month, 0)).getUTCDate();
  const result = new Date(Date.UTC(nextYear, month - 1, Math.min(day, lastDay)));
  return result.toISOString().slice(0, 10);
}

export function registrationValidity(
  expiration: string | null,
  today: string
): "pending_or_unknown" | "valid" | "expired" {
  if (!expiration) return "pending_or_unknown";
  const validDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value));
  if (!validDay(expiration) || !validDay(today)) throw new Error("Invalid date.");
  return today <= expiration ? "valid" : "expired";
}
