/** Server-only registration rollout gate. No browser or database imports. */
export type SecureRegistrationGateInput = {
  enabled: string | undefined;
  actorId: string | undefined;
  adminId: string | undefined;
  configuredRpc: string | undefined;
};
export type SecureRegistrationGateResult =
  | { ok: true }
  | { ok: false; reason: "disabled" | "unauthorized" | "unconfigured" };

export function checkSecureRegistrationGate(input: SecureRegistrationGateInput): SecureRegistrationGateResult {
  if (input.enabled !== "true") return { ok: false, reason: "disabled" };
  if (!input.actorId || !input.adminId || input.actorId !== input.adminId)
    return { ok: false, reason: "unauthorized" };
  // A reviewed atomic RPC must be explicitly configured before activation.
  if (!input.configuredRpc) return { ok: false, reason: "unconfigured" };
  return { ok: true };
}
