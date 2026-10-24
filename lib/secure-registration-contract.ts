import { prepareSecureIntake, type SecureIntakeRequest } from "./secure-registration-decision";

/** Decode and validate the registration body without trusting client candidates. */
export function parseSecureRegistrationRequest(body: unknown): SecureIntakeRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid registration body.");
  const input = body as Record<string, unknown>;
  const source = input.source;
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("Invalid source.");
  const sourceData = source as Record<string, unknown>;
  if ((sourceData.kind !== "individual" && sourceData.kind !== "bulk") ||
      typeof sourceData.reference !== "string") throw new Error("Invalid source.");
  const normalizedSource = sourceData.kind === "bulk"
    ? { kind: "bulk" as const, reference: sourceData.reference, row: sourceData.row as number }
    : { kind: "individual" as const, reference: sourceData.reference };
  if (typeof input.first_name !== "string" || typeof input.last_name !== "string" ||
      typeof input.parish !== "string" || !Array.isArray(input.ministries) ||
      input.ministries.some((x) => typeof x !== "string") ||
      typeof input.service_year !== "number" || typeof input.requestKey !== "string")
    throw new Error("Invalid registration fields.");
  const request: SecureIntakeRequest = {
    source: normalizedSource,
    first_name: input.first_name,
    last_name: input.last_name,
    parish: input.parish,
    ministries: input.ministries,
    service_year: input.service_year,
    requestKey: input.requestKey,
  };
  // Empty candidates are ONLY for input shape validation. Never authorize
  // creation based on this result; authoritative matching belongs inside SQL.
  return prepareSecureIntake(request, []).normalized;
}

export function normalizeAtomicRegistrationResponse(data: unknown):
  | { status: "created" | "replayed"; memberId: string }
  | { status: "review"; reviewId: string } {
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Unexpected registration operation response.");
  const value = data as Record<string, unknown>;
  if ((value.status === "created" || value.status === "replayed") &&
      typeof value.member_id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.member_id))
    return { status: value.status, memberId: value.member_id };
  if (value.status === "review" && typeof value.review_id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.review_id))
    return { status: "review", reviewId: value.review_id };
  throw new Error("Unexpected registration operation response.");
}
