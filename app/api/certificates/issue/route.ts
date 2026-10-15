
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UID_PATTERN =
  /^LMD-\d{4}-(?:[A-HJKMNP-Z2-9]{4}-){2}[A-HJKMNP-Z2-9]{4}$/i;

// Temporary compatibility during the UID migration.
// Remove before production cutover.
const LEGACY_UID_PATTERN = /^LMD-\d{4}-\d+$/i;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type IssuePayload = {
  registryId?: unknown;
  memberMinistryId?: unknown;
};

function respond(
  data: unknown,
  status = 200,
  additionalHeaders: Record<string, string> = {}
) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...additionalHeaders,
    },
  });
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.VERIFICATION_RATE_LIMIT_SECRET;

  if (!supabaseUrl || !serviceRoleKey || !secret) {
    return respond(
      { error: "Certificate issuance is unavailable." },
      503
    );
  }

  const clientId =
    request.ip ??
    (process.env.NODE_ENV === "development"
      ? "local-development"
      : null);

  if (!clientId) {
    return respond(
      { error: "Certificate issuance is unavailable." },
      503
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // Share the verification rate limit across lookup and issuance.
  const requestKey = createHmac("sha256", secret)
    .update(`cowl-verification-v1:${clientId}`)
    .digest("hex");

  try {
    const { data, error } = await supabase.rpc(
      "check_verification_rate_limit",
      {
        p_request_key: requestKey,
        p_max_requests: 20,
        p_window_seconds: 60,
      }
    );

    if (
      error ||
      !Array.isArray(data) ||
      data.length !== 1 ||
      typeof data[0]?.allowed !== "boolean"
    ) {
      console.error("Certificate rate-limit failure:", error);

      return respond(
        { error: "Certificate issuance is unavailable." },
        503
      );
    }

    if (!data[0].allowed) {
      const retryAfter = Math.max(
        1,
        Math.min(
          3600,
          Number(data[0].retry_after_seconds) || 60
        )
      );

      return respond(
        {
          error:
            "Too many requests. Please try again shortly.",
        },
        429,
        {
          "Retry-After": String(retryAfter),
        }
      );
    }
  } catch (error) {
    console.error("Certificate rate-limit error:", error);

    return respond(
      { error: "Certificate issuance is unavailable." },
      503
    );
  }

  let payload: IssuePayload;

  try {
    payload = (await request.json()) as IssuePayload;
  } catch {
    return respond({ error: "Invalid request body." }, 400);
  }

  if (
    typeof payload?.registryId !== "string" ||
    typeof payload?.memberMinistryId !== "string"
  ) {
    return respond(
      { error: "Registry ID and ministry are required." },
      400
    );
  }

  const registryId = payload.registryId.trim().toUpperCase();
  const memberMinistryId = payload.memberMinistryId.trim();

  if (
    !(
      UID_PATTERN.test(registryId) ||
      LEGACY_UID_PATTERN.test(registryId)
    ) ||
    !UUID_PATTERN.test(memberMinistryId)
  ) {
    return respond(
      { error: "Invalid certificate request." },
      400
    );
  }

  try {
    // The database function checks UID ownership,
    // ministry eligibility, and allocates numbers atomically.
    const { data, error } = await supabase.rpc(
      "allocate_certificate_issuance",
      {
        p_registry_id: registryId,
        p_member_ministry_id: memberMinistryId,
      }
    );

    if (error) {
      console.error("Certificate issuance error:", error);

      return respond(
        { error: "Certificate could not be issued." },
        422
      );
    }

    if (
      !Array.isArray(data) ||
      data.length !== 1 ||
      !Number.isSafeInteger(data[0]?.issuance_number) ||
      data[0].issuance_number < 1 ||
      typeof data[0]?.reprint_suffix !== "string"
    ) {
      return respond(
        { error: "Unexpected certificate issuance result." },
        500
      );
    }

    return respond({
      issuanceNumber: data[0].issuance_number,
      reprintSuffix: data[0].reprint_suffix,
    });
  } catch (error) {
    console.error("Certificate issuance failure:", error);

    return respond(
      { error: "Certificate issuance is unavailable." },
      503
    );
  }
}
