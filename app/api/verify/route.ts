
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUESTS = 20;
const WINDOW_SECONDS = 60;

// Random portion excludes 0, O, 1, I, and L.
const NEW_UID_PATTERN =
  /^LMD-\d{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/i;

// Development compatibility only.
// Remove when the randomized UID migration is activated.
const LEGACY_UID_PATTERN = /^LMD-\d{4}-\d+$/i;

const MEMBER_FIELDS =
  "id,uid,first_name,last_name,parish,ministries,status,service_year,expiration_date";

const MINISTRY_FIELDS =
  "id,member_id,ministry,status,expiration_date";

type SearchPayload = {
  query?: unknown;
};

function json(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function escapeIlike(value: string) {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`);
}

function getClientIdentifier(request: NextRequest) {
  // Vercel populates NextRequest.ip from request metadata.
  // Do not use arbitrary client-supplied identification headers.
  if (request.ip) {
    return request.ip;
  }

  // Local development fallback only.
  if (process.env.NODE_ENV === "development") {
    return "local-development";
  }

  // Fail closed when production client identification is missing.
  return null;
}

function makeRateLimitKey(
  identifier: string,
  secret: string
) {
  return createHmac("sha256", secret)
    .update(`cowl-verification-v1:${identifier}`)
    .digest("hex");
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const rateLimitSecret =
    process.env.VERIFICATION_RATE_LIMIT_SECRET;

  if (!supabaseUrl || !serviceRoleKey || !rateLimitSecret) {
    console.error(
      "Verification API configuration is incomplete."
    );

    return json(
      { error: "Verification service unavailable." },
      503
    );
  }

  const clientIdentifier = getClientIdentifier(request);

  if (!clientIdentifier) {
    console.error(
      "Unable to identify verification request client."
    );

    return json(
      { error: "Verification service unavailable." },
      503
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // Rate-limit before querying member records.
  const requestKey = makeRateLimitKey(
    clientIdentifier,
    rateLimitSecret
  );

  try {
    const { data, error } = await supabase.rpc(
      "check_verification_rate_limit",
      {
        p_request_key: requestKey,
        p_max_requests: MAX_REQUESTS,
        p_window_seconds: WINDOW_SECONDS,
      }
    );

    // Never bypass the limiter on a database failure.
    if (error || !Array.isArray(data) || data.length !== 1) {
      console.error(
        "Verification rate-limit check failed:",
        error
      );

      return json(
        { error: "Verification service unavailable." },
        503
      );
    }

    const result = data[0] as {
      allowed: boolean;
      retry_after_seconds: number;
    };

    if (typeof result.allowed !== "boolean") {
      return json(
        { error: "Verification service unavailable." },
        503
      );
    }

    if (!result.allowed) {
      const retryAfter = Math.max(
        1,
        Math.min(
          3600,
          Number(result.retry_after_seconds) || WINDOW_SECONDS
        )
      );

      return json(
        {
          error:
            "Too many verification requests. Please try again shortly.",
        },
        429,
        {
          "Retry-After": String(retryAfter),
        }
      );
    }
  } catch (error) {
    console.error(
      "Verification rate-limit service error:",
      error
    );

    return json(
      { error: "Verification service unavailable." },
      503
    );
  }

  let payload: SearchPayload;

  try {
    payload = (await request.json()) as SearchPayload;
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  if (typeof payload?.query !== "string") {
    return json(
      { error: "Enter a name or Registry ID." },
      400
    );
  }

  const term = payload.query.trim();

  if (!term || term.length > 100) {
    return json(
      { error: "Invalid search query." },
      400
    );
  }

  const isExactUid =
    NEW_UID_PATTERN.test(term) ||
    LEGACY_UID_PATTERN.test(term);

  const looksLikeUid = /^LMD-/i.test(term);

  if (looksLikeUid && !isExactUid) {
    return json(
      { error: "Enter a complete Registry ID." },
      400
    );
  }

  try {
    let members: Record<string, unknown>[] = [];

    if (isExactUid) {
      const { data, error } = await supabase
        .from("members")
        .select(MEMBER_FIELDS)
        .eq("uid", term.toUpperCase())
        .limit(1);

      if (error) throw error;

      members = data ?? [];
    } else {
      const tokens = term
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);

      if (term.length < 3 || tokens.length > 4) {
        return json(
          {
            error:
              "Enter at least three characters and no more than four name parts.",
          },
          400
        );
      }

      const candidates = new Map<
        string,
        Record<string, unknown>
      >();

      for (const token of tokens) {
        const safeToken = escapeIlike(token);

        const { data, error } = await supabase
          .from("members")
          .select(MEMBER_FIELDS)
          .or(
            `first_name.ilike.%${safeToken}%,last_name.ilike.%${safeToken}%`
          )
          .limit(100);

        if (error) throw error;

        for (const member of data ?? []) {
          candidates.set(member.id, member);
        }
      }

      members = Array.from(candidates.values()).filter(
        (member) => {
          const fullName =
            `${member.first_name} ${member.last_name}`
              .toLowerCase()
              .trim();

          return tokens.every((token) =>
            fullName.includes(token)
          );
        }
      );

      members.sort((a, b) => {
        const first =
          `${a.last_name} ${a.first_name}`.toLowerCase();

        const second =
          `${b.last_name} ${b.first_name}`.toLowerCase();

        return first.localeCompare(second);
      });

      members = members.slice(0, 100);
    }

    if (members.length === 0) {
      return json({
        results: [],
        searchedByUid: isExactUid,
      });
    }

    const memberIds = members.map(
      (member) => member.id as string
    );

    const { data: memberships, error: membershipError } =
      await supabase
        .from("member_ministries")
        .select(MINISTRY_FIELDS)
        .in("member_id", memberIds);

    if (membershipError) throw membershipError;

    const results = members.map((member) => {
      const memberMemberships = (memberships ?? [])
        .filter(
          (membership) =>
            membership.member_id === member.id
        )
        .sort((a, b) =>
          a.ministry.localeCompare(b.ministry)
        );

      const publicMember = {
        id: member.id,
        first_name: member.first_name,
        last_name: member.last_name,
        parish: member.parish,
        ministries: member.ministries,
        status: member.status,
        service_year: member.service_year,
        expiration_date: member.expiration_date,
        member_ministries: memberMemberships,
      };

      // Name searches NEVER include Registry IDs.
      return isExactUid
        ? { ...publicMember, uid: member.uid }
        : publicMember;
    });

    return json({
      results,
      searchedByUid: isExactUid,
    });
  } catch (error) {
    console.error("Verification API error:", error);

    return json(
      {
        error: "Verification is temporarily unavailable.",
      },
      500
    );
  }
}
