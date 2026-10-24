import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkSecureRegistrationGate } from "@/lib/secure-registration-gate";
import { parseSecureRegistrationRequest, normalizeAtomicRegistrationResponse } from "@/lib/secure-registration-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deliberately non-writing scaffold.
 * Not connected to Add Member or CSV; an atomic database operation is required first.
 */
export async function POST(request: Request) {
  const reply = (status: number, error: string) =>
    NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });

  if (process.env.SECURE_REGISTRATION_ENABLED !== "true")
    return reply(503, "Secure registration is not enabled.");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const adminId = process.env.SECURE_REGISTRATION_ADMIN_UID;
  if (!url || !anonKey || !adminId) return reply(503, "Secure registration is not configured.");

  const match = /^Bearer (\S+)$/i.exec(request.headers.get("authorization") || "");
  if (!match) return reply(401, "Authentication required.");

  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let actorId: string | undefined;
  try {
    const { data, error } = await authClient.auth.getUser(match[1]);
    if (error || !data.user) return reply(401, "Authentication required.");
    actorId = data.user.id;
  } catch {
    return reply(503, "Authentication unavailable.");
  }
  const gate = checkSecureRegistrationGate({
    enabled: process.env.SECURE_REGISTRATION_ENABLED,
    actorId,
    adminId,
    configuredRpc: process.env.SECURE_REGISTRATION_ATOMIC_RPC,
  });
  if (!gate.ok) return reply(gate.reason === "unauthorized" ? 403 : 503, "Secure registration unavailable.");

  // Absolute test-project boundary: prevents accidental production writes.
  // This endpoint is never a production registration backend.
  const testProject = "rtptybxugjhvpfjvcvgw";
  let projectHost: string;
  try { projectHost = new URL(url).hostname; }
  catch { return reply(503, "Secure registration unavailable."); }
  if (projectHost !== testProject + ".supabase.co" ||
      process.env.SECURE_REGISTRATION_TEST_PROJECT !== testProject ||
      process.env.SECURE_REGISTRATION_ATOMIC_RPC !== "atomic_registration_probe")
    return reply(503, "Atomic registration has not been approved for this environment.");

  let input;
  try {
    const raw = await request.text();
    if (raw.length > 12000) return reply(413, "Registration request too large.");
    input = parseSecureRegistrationRequest(JSON.parse(raw));
  } catch {
    return reply(400, "Invalid registration information.");
  }

  // The test prototype accepts one ministry; never silently drop assignments.
  if (input.ministries.length !== 1)
    return reply(503, "Multi-ministry atomic registration not yet implemented.");

  // Uses the actor's verified access token, not a service-role secret.
  // PostgreSQL itself must authorize the actor and perform the full
  // duplicate check and insert atomically. RPC errors fail closed.
  const caller = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer " + match[1] } },
  });
  try {
    const { data, error } = await caller.rpc("atomic_registration_probe", {
      p_first: input.first_name,
      p_last: input.last_name,
      p_parish: input.parish,
      p_ministry: input.ministries[0],
      p_request: input.requestKey,
    });
    if (error) return reply(503, "Atomic registration transaction unavailable.");
    const result = normalizeAtomicRegistrationResponse(data);
    return NextResponse.json({ ok: true, ...result }, {
      status: result.status === "created" ? 201 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return reply(503, "Atomic registration transaction unavailable.");
  }
}
