/**
 * Shared, offline-safe validation contract for individual and CSV intake.
 * This checks required identity fields only; it does NOT establish identity,
 * validate approved ministry values, assign a UID, or access the database.
 */
export type RegistrationIdentity = {
  first_name: string;
  last_name: string;
  parish: string;
};

export type RegistrationIntakeFields = RegistrationIdentity & {
  ministries: readonly string[];
};

export type RegistrationValidationResult =
  | { valid: true; normalized: RegistrationIntakeFields }
  | { valid: false; errors: string[] };

export function validateRegistrationIntake(
  input: RegistrationIntakeFields
): RegistrationValidationResult {
  const first_name = typeof input.first_name === "string" ? input.first_name.trim().replace(/\s+/g, " ") : "";
  const last_name = typeof input.last_name === "string" ? input.last_name.trim().replace(/\s+/g, " ") : "";
  const parish = typeof input.parish === "string" ? input.parish.trim().replace(/\s+/g, " ") : "";
  const ministries = Array.isArray(input.ministries)
    ? input.ministries.filter((item): item is string => typeof item === "string").map((item) => item.trim().replace(/\s+/g, " "))
    : [];

  const errors: string[] = [];
  if (!first_name) errors.push("First name is required.");
  if (!last_name) errors.push("Last name is required.");
  if (!parish) errors.push("Parish is required.");
  if (ministries.length === 0 || ministries.some((item) => !item.trim()) ||
      (Array.isArray(input.ministries) && ministries.length !== input.ministries.length)) {
    errors.push("At least one valid ministry is required.");
  }
  if (errors.length) return { valid: false, errors };
  return { valid: true, normalized: { first_name, last_name, parish, ministries: Array.from(new Set(ministries)) } };
}
