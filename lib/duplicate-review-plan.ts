/**
 * Pure decision planning for duplicate-review cases.
 * This module does not write to the registry and never assigns a UID.
 * The future server-side workflow must authorize and atomically apply a plan.
 */
export type ReviewDecision =
  | "use_existing"
  | "transfer_parish"
  | "create_distinct"
  | "discard";

export type ReviewCandidate = {
  id: string;
  uid: string;
  parish: string;
  ministries: readonly string[];
};

export type ReviewIncoming = {
  parish: string;
  ministries: readonly string[];
};

export type ReviewPlan =
  | { kind: "attach_assignments"; memberId: string; uid: string; newMinistries: string[] }
  | { kind: "transfer_and_attach"; memberId: string; uid: string; fromParish: string; toParish: string; newMinistries: string[] }
  | { kind: "new_identity"; status: "Pending Verification" }
  | { kind: "discard" };

export type ReviewResult =
  | { valid: true; plan: ReviewPlan }
  | { valid: false; error: string };

const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();

export function planDuplicateReview(input: {
  decision: ReviewDecision;
  incoming: ReviewIncoming;
  existing?: ReviewCandidate | null;
  notes: string;
}): ReviewResult {
  const { decision, incoming, existing, notes } = input;
  if (!notes.trim() || notes.trim().length < 10) {
    return { valid: false, error: "Provide at least ten characters explaining the decision." };
  }
  if (!incoming.parish.trim() || incoming.ministries.length === 0 ||
    incoming.ministries.some((name) => !name.trim())) {
    return { valid: false, error: "Incoming parish and ministry assignments are required." };
  }
  if (decision === "discard") return { valid: true, plan: { kind: "discard" } };
  if (decision === "create_distinct") {
    return { valid: true, plan: { kind: "new_identity", status: "Pending Verification" } };
  }
  if (!existing?.id || !existing.uid || !existing.parish.trim()) {
    return { valid: false, error: "An existing member must be selected for this decision." };
  }

  const known = new Set(existing.ministries.map(normalize));
  const newMinistries = Array.from(
    new Map(incoming.ministries.map((name) => [normalize(name), name.trim()])).entries()
  ).filter(([name]) => !known.has(name)).map(([, label]) => label);

  if (decision === "use_existing") {
    if (normalize(existing.parish) !== normalize(incoming.parish)) {
      return { valid: false, error: "Different parishes require a transfer review or a distinct-identity decision." };
    }
    return { valid: true, plan: { kind: "attach_assignments", memberId: existing.id, uid: existing.uid, newMinistries } };
  }
  if (decision === "transfer_parish") {
    if (normalize(existing.parish) === normalize(incoming.parish)) {
      return { valid: false, error: "The parish is unchanged; use the existing identity decision." };
    }
    return {
      valid: true,
      plan: {
        kind: "transfer_and_attach",
        memberId: existing.id,
        uid: existing.uid,
        fromParish: existing.parish,
        toParish: incoming.parish.trim(),
        newMinistries,
      },
    };
  }
  return { valid: false, error: "Unsupported review decision." };
}
