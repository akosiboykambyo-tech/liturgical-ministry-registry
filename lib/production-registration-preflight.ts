import { authorizeRegistryRegistration, type RegistryAuthorizationDecision } from "./production-registration-authorization";

/** Caller must configure the RPC client with the SAME bearer token. */
export type RegistrationAuthClient = {
  auth: { getUser: (jwt: string) => Promise<{ data: { user: { id: string } | null }; error: unknown }> };
};
export type RegistrationRoleClient = {
  rpc: (name: "registration_is_admin") => Promise<{ data: boolean | null; error: unknown }>;
};

/**
 * Read-only preflight, not a substitute for checking permissions again inside
 * the eventual transactional SQL registration function (TOCTOU/revocation).
 * Never accepts caller-provided admin status or user ID.
 */
export async function preflightRegistrationAdministrator(
  accessToken: string,
  authentication: RegistrationAuthClient,
  roleClientBoundToSameToken: RegistrationRoleClient,
  enabled: string | undefined,
  migrationReady: boolean
): Promise<RegistryAuthorizationDecision> {
  if (enabled !== "true") return { authorized: false, reason: "disabled" };
  if (!accessToken.trim()) return { authorized: false, reason: "unauthenticated" };
  let verifiedUserId: string | null = null;
  try {
    const verified = await authentication.auth.getUser(accessToken);
    if (verified.error || !verified.data.user) return { authorized: false, reason: "unauthenticated" };
    verifiedUserId = verified.data.user.id;
  } catch {
    return { authorized: false, reason: "unauthenticated" };
  }
  if (!migrationReady) return { authorized: false, reason: "schema_unready" };
  let activeAdminFromTrustedDatabase = false;
  try {
    const role = await roleClientBoundToSameToken.rpc("registration_is_admin");
    activeAdminFromTrustedDatabase = !role.error && role.data === true;
  } catch { /* fail closed */ }
  return authorizeRegistryRegistration({ enabled, verifiedUserId, activeAdminFromTrustedDatabase, migrationReady });
}
