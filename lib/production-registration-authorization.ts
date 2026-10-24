/**
 * Production registration authorization policy (pure / side-effect free).
 * Identity must come from supabase.auth.getUser(accessToken) server-side.
 * A trusted database role lookup must additionally confirm administrator rights;
 * user_metadata, caller-provided roles, and a mere authenticated session are insufficient.
 */
export type RegistryAuthorization = {
  enabled: string | undefined;
  verifiedUserId: string | null;
  activeAdminFromTrustedDatabase: boolean;
  migrationReady: boolean;
};
export type RegistryAuthorizationDecision =
  | { authorized: true }
  | { authorized: false; reason: "disabled" | "unauthenticated" | "forbidden" | "schema_unready" };

export function authorizeRegistryRegistration(input: RegistryAuthorization): RegistryAuthorizationDecision {
  if (input.enabled !== "true") return { authorized: false, reason: "disabled" };
  if (!input.verifiedUserId || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(input.verifiedUserId))
    return { authorized: false, reason: "unauthenticated" };
  if (!input.activeAdminFromTrustedDatabase) return { authorized: false, reason: "forbidden" };
  if (!input.migrationReady) return { authorized: false, reason: "schema_unready" };
  return { authorized: true };
}
