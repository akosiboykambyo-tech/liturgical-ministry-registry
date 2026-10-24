import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkSecureRegistrationGate } from "@/lib/secure-registration-gate";

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

  // Do not accept requests until an atomic, authorized RPC has been built,
  // reviewed, integrated and tested. Never substitute browser-side inserts.
  return reply(503, "Atomic registration operation not yet available.");
}
