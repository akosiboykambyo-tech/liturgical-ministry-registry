import { validateRegistrationIntake } from "./registration-intake-validation";
import { normalizeApprovedMinistries } from "./registration-ministry-validation";
import { draftDuplicateReview, type CandidateIdentity, type RegistrationSource } from "./registration-review-draft";

export type SecureIntakeRequest = {
  source: RegistrationSource;
  first_name: string;
  last_name: string;
  parish: string;
  ministries: string[];
  service_year: number;
  requestKey: string;
};
export type SecureIntakeDecision =
  | { action: "create"; normalized: SecureIntakeRequest }
  | { action: "review"; normalized: SecureIntakeRequest; candidateMemberIds: string[]; reasons: string[] };

/**
 * Decision contract only; the caller MUST supply a complete authorized
 * candidate snapshot. This never inserts members or grants authorization.
 */
export function prepareSecureIntake(
  input: SecureIntakeRequest,
  candidates: readonly CandidateIdentity[],
): SecureIntakeDecision {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestKey))
    throw new Error("A valid idempotency UUID is required.");
  if (!Number.isInteger(input.service_year) || input.service_year < 2000 || input.service_year > 2100)
    throw new Error("Invalid service year.");
  const validated = validateRegistrationIntake(input);
  if (!validated.valid) throw new Error(validated.errors.join(" "));
  const ministries = normalizeApprovedMinistries(validated.normalized.ministries);
  if (!ministries.valid) throw new Error("Unapproved ministry.");
  const normalized = { ...input, ...validated.normalized, ministries: ministries.ministries };
  const review = draftDuplicateReview({ source: input.source, incoming: normalized, candidates });
  if (review.needsReview) {
    return { action: "review", normalized, candidateMemberIds: review.candidateMemberIds, reasons: review.reasons };
  }
  return { action: "create", normalized };
}
