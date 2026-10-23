import { classifyIdentityMatch, type IdentityDetails, type IdentityMatchKind } from "./registration-matching";
import { validateRegistrationIntake } from "./registration-intake-validation";

/**
 * Offline-only CSV intake preflight. Never creates a member or UID.
 * All potential identity collisions require manual verification.
 */
export type IntakeRow = IdentityDetails & { ministry: string };
export type IntakeIssue = {
  row: number;
  otherRow: number;
  match: IdentityMatchKind;
};
export type IntakeProblem = { row: number; reason: string };
export type IntakePreflight = {
  standaloneRows: number[];
  reviewRows: number[];
  conflicts: IntakeIssue[];
  invalid: IntakeProblem[];
};

export function preflightBatchIntake(rows: readonly IntakeRow[]): IntakePreflight {
  const invalid: IntakeProblem[] = [];
  const validIndices: number[] = [];
  rows.forEach((row, index) => {
    const check = validateRegistrationIntake({
      first_name: row.first_name,
      last_name: row.last_name,
      parish: row.parish,
      ministries: [row.ministry],
    });
    if (!check.valid) invalid.push({ row: index + 1, reason: check.errors.join(" ") });
    else validIndices.push(index);
  });

  const conflicts: IntakeIssue[] = [];
  const review = new Set<number>();
  for (let i = 0; i < validIndices.length; i++) {
    const first = validIndices[i];
    for (let j = i + 1; j < validIndices.length; j++) {
      const second = validIndices[j];
      const match = classifyIdentityMatch(rows[first], rows[second]);
      if (match !== null) {
        // 1-based positions are traceable to parsed data rows.
        conflicts.push({ row: first + 1, otherRow: second + 1, match });
        review.add(first + 1);
        review.add(second + 1);
      }
    }
  }

  return {
    standaloneRows: validIndices.map((index) => index + 1).filter((row) => !review.has(row)),
    reviewRows: Array.from(review).sort((a, b) => a - b),
    conflicts,
    invalid,
  };
}
