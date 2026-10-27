/**
 * Recover expired access tokens in the certificate workspace without changing
 * RLS permissions or repeatedly retrying other failures.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Result = { error: { message: string; code?: string } | null };

export class AdminReauthenticationRequiredError extends Error {
  constructor() {
    super("Your admin session has expired. Please sign out and sign in again.");
    this.name = "AdminReauthenticationRequiredError";
  }
}
export function isExpiredJwtError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" &&
    /(?:\bjwt\s+expired\b|\bexpired\s+jwt\b|\baccess\s+token\s+expired\b)/i.test(message);
}

let refreshInFlight: Promise<boolean> | null = null;

async function renewSession(client: SupabaseClient) {
  if (!refreshInFlight) {
    const attempt = client.auth.refreshSession()
      .then(({ data, error }) => !error && Boolean(data.session?.access_token))
      .catch(() => false);
    refreshInFlight = attempt;
    void attempt.finally(() => {
      if (refreshInFlight === attempt) refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function withCertificateSessionRecovery<T extends Result>(
  client: SupabaseClient, query: () => Promise<T>
): Promise<T> {
  const initial = await query();
  if (!isExpiredJwtError(initial.error)) return initial;
  if (!(await renewSession(client))) throw new AdminReauthenticationRequiredError();
  const retried = await query();
  if (isExpiredJwtError(retried.error)) throw new AdminReauthenticationRequiredError();
  return retried;
}
