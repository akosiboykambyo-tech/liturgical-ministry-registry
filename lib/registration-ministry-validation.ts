import { MINISTRIES, shortMinistry } from "./constants";

/**
 * Offline-only normalization of ministry names for registration previews.
 * Unknown values are rejected, never silently converted to "Other".
 */
export type MinistryNormalization =
  | { valid: true; ministries: string[] }
  | { valid: false; unknown: string[] };

export function normalizeApprovedMinistries(values: readonly string[]): MinistryNormalization {
  const approved: string[] = [];
  const unknown: string[] = [];
  for (const raw of values) {
    if (typeof raw !== "string" || !raw.trim()) {
      unknown.push(typeof raw === "string" ? raw : "(invalid value)");
      continue;
    }
    const key = raw.trim().replace(/\s+/g, " ").toLocaleLowerCase();
    const match = MINISTRIES.find((name) =>
      name.toLocaleLowerCase() === key || shortMinistry(name).toLocaleLowerCase() === key
    );
    if (match) {
      if (!approved.includes(match)) approved.push(match);
    } else {
      unknown.push(raw);
    }
  }
  if (unknown.length || approved.length === 0) return { valid: false, unknown };
  return { valid: true, ministries: approved };
}
