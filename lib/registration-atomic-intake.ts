import { validateRegistrationIntake } from "./registration-intake-validation";
import { normalizeApprovedMinistries } from "./registration-ministry-validation";

/**
 * Proposed atomic registration adapter. It is intentionally NOT connected to
 * Add Member or CSV Import. It makes no database calls without an explicitly
 * supplied RPC transport and an opt-in from the caller.
 *
 * The opt-in is only a development safety latch; real authorization MUST be
 * checked in the database for every request (not in browser configuration).
 */
export type AtomicRegistrationInput = {
  requestKey: string;
  first_name: string;
  last_name: string;
  parish: string;
  ministries: readonly string[];
  service_year: number;
  notes?: string | null;
};

export type AtomicRegistrationArgs = {
  p_request: string;
  p_first: string;
  p_last: string;
  p_parish: string;
  p_ministries: string[];
  p_year: number;
};

export type AtomicRegistrationResult =
  | { status: "created"; memberId: string }
  | { status: "review"; reviewId: string }
  | { status: "replayed"; outcome: "created"; memberId: string }
  | { status: "replayed"; outcome: "review"; reviewId: string };

export type AtomicRegistrationRpc = (
  functionName: "registration_intake_v1",
  args: AtomicRegistrationArgs,
) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

/**
 * Enforce a strict response boundary, including replay outcomes. Never claim
 * that registration succeeded from an empty or malformed RPC response.
 */
export function normalizeAtomicRegistrationResult(value: unknown): AtomicRegistrationResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid atomic registration response.");
  }
  const row = value as Record<string, unknown>;
  if (row.status === "created" && isUuid(row.memberId) && row.reviewId == null) {
    return { status: "created", memberId: row.memberId };
  }
  if (row.status === "review" && isUuid(row.reviewId) && row.memberId == null) {
    return { status: "review", reviewId: row.reviewId };
  }
  if (row.status === "replayed" && row.outcome === "created" &&
      isUuid(row.memberId) && row.reviewId == null) {
    return { status: "replayed", outcome: "created", memberId: row.memberId };
  }
  if (row.status === "replayed" && row.outcome === "review" &&
      isUuid(row.reviewId) && row.memberId == null) {
    return { status: "replayed", outcome: "review", reviewId: row.reviewId };
  }
  throw new Error("Invalid atomic registration response.");
}

/**
 * Prepare exact SQL arguments. Never silently drop the existing Notes field:
 * the current TEST RPC has no such parameter. Block notes-bearing submissions
 * until the reviewed database contract supports storing them atomically.
 */
export function prepareAtomicRegistrationArgs(input: AtomicRegistrationInput): AtomicRegistrationArgs {
  if (!isUuid(input.requestKey)) throw new Error("A stable request UUID is required.");
  if (!Number.isInteger(input.service_year) ||
      input.service_year < 2000 || input.service_year > 2100) {
    throw new Error("Invalid service year.");
  }
  if (input.notes != null && (typeof input.notes !== "string" || input.notes.trim() !== "")) {
    throw new Error("Registration notes are not supported by the reviewed atomic RPC yet.");
  }
  const identity = validateRegistrationIntake(input);
  if (!identity.valid) throw new Error(identity.errors.join(" "));
  const { first_name, last_name, parish } = identity.normalized;
  if (first_name.length > 160 || last_name.length > 160 || parish.length > 200) {
    throw new Error("Registration identity fields exceed allowed limits.");
  }
  const ministries = normalizeApprovedMinistries(input.ministries);
  if (!ministries.valid || ministries.ministries.length !== input.ministries.length ||
      ministries.ministries.length > 6) {
    throw new Error("Select unique approved COWL-DOK ministries.");
  }
  return {
    p_request: input.requestKey,
    p_first: first_name,
    p_last: last_name,
    p_parish: parish,
    p_ministries: ministries.ministries,
    p_year: input.service_year,
  };
}

/**
 * Offline-testable integration seam. No production call site is wired.
 * Callers must retain the same requestKey for retries after uncertain results.
 */
export async function submitAtomicRegistrationForReview(
  input: AtomicRegistrationInput,
  rpc: AtomicRegistrationRpc,
  options: { explicitlyEnabled: boolean },
): Promise<AtomicRegistrationResult> {
  if (!options.explicitlyEnabled) {
    throw new Error("Atomic registration is not enabled for this workflow.");
  }
  const args = prepareAtomicRegistrationArgs(input);
  const response = await rpc("registration_intake_v1", args);
  if (response.error) {
    throw new Error(response.error.code === "23505"
      ? "The request key was reused with different registration details."
      : "Atomic registration could not be completed. No success is confirmed.");
  }
  return normalizeAtomicRegistrationResult(response.data);
}
