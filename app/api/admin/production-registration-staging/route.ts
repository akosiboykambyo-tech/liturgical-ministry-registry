import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { preflightRegistrationAdministrator } from "@/lib/production-registration-preflight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEST_HOST = "rtptybxugjhvpfjvcvgw.supabase.co";
function reject(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Disabled-by-default isolated staging route. Not used by Add Member or CSV. */
export async function POST(request: Request) {
  if (process.env.PRODUCTION_REGISTRATION_STAGING_ENABLED !== "true")
    return reject(503, "Staging registration disabled");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let host = "";
  try { host = url ? new URL(url).hostname : ""; } catch { /* deny invalid URL */ }
  if (!url || !key || host !== TEST_HOST ||
      process.env.PRODUCTION_REGISTRATION_STAGING_PROJECT !== "rtptybxugjhvpfjvcvgw")
    return reject(503, "Wrong staging environment");
  const match = /^Bearer (\S+)$/i.exec(request.headers.get("authorization") || "");
  if (!match) return reject(401, "Authentication required");
  const authentication = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const caller = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer " + match[1] } },
  });
  const access = await preflightRegistrationAdministrator(match[1], authentication, caller,
    process.env.PRODUCTION_REGISTRATION_STAGING_ENABLED,
    process.env.PRODUCTION_REGISTRATION_STAGING_SCHEMA_READY === "true");
  if (!access.authorized) return reject(access.reason === "unauthenticated" ? 401 :
    access.reason === "forbidden" ? 403 : 503, "Staging preflight: " + access.reason);
  let payload: Record<string, unknown>;
  try {
    const body = await request.text();
    if (body.length > 12000) return reject(413, "Request too large");
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return reject(400, "Invalid input");
    payload = parsed as Record<string, unknown>;
  } catch { return reject(400, "Invalid JSON"); }
  const { requestKey, first_name, last_name, parish, ministries, service_year } = payload;
  if (typeof requestKey !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(requestKey) ||
      typeof first_name !== "string" || typeof last_name !== "string" || typeof parish !== "string" ||
      !Array.isArray(ministries) || !ministries.every(x => typeof x === "string") ||
      !Number.isInteger(service_year))
    return reject(400, "Invalid registration input");
  try {
    const result = await caller.rpc("registration_intake_v1", {
      p_request: requestKey, p_first: first_name, p_last: last_name, p_parish: parish,
      p_ministries: ministries, p_year: service_year,
    });
    if (result.error) {
      if (result.error.code === "23505") return reject(409, "Idempotency conflict");
      if (result.error.code === "42501") {
        const reason = /Registration not authorized/i.test(result.error.message || "")
          ? "database-admin-check"
          : /permission denied for schema/i.test(result.error.message || "")
          ? "schema-access"
          : /permission denied for (table|relation)/i.test(result.error.message || "")
          ? "table-access"
          : "database-permission";
        return reject(403, "Staging transaction denied: " + reason);
      }
      return reject(503, "Database registration unavailable");
    }
    return NextResponse.json({ ok: true, ...result.data }, {
      status: result.data?.status === "created" ? 201 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch { return reject(503, "Registration unavailable"); }
}
