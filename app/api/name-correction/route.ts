import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const CORRECTION_INBOX = "cowlkalookan2025@gmail.com";

type CorrectionPayload = {
  memberId?: unknown;
  registryId?: unknown;
  correctedName?: unknown;
  requesterEmail?: unknown;
  supportingDetails?: unknown;
  website?: unknown;
};

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  let payload: CorrectionPayload;

  try {
    payload = (await request.json()) as CorrectionPayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  const memberId = asTrimmedString(payload.memberId);
  const registryId = asTrimmedString(payload.registryId);
  const correctedName = asTrimmedString(payload.correctedName);
  const requesterEmail = asTrimmedString(payload.requesterEmail).toLowerCase();
  const supportingDetails = asTrimmedString(payload.supportingDetails);
  const website = asTrimmedString(payload.website);

  // Honeypot: bots often fill hidden inputs. Return success without writing data.
  if (website) {
    return NextResponse.json({ ok: true, emailSent: true });
  }

  if (!memberId || !registryId || !correctedName || !requesterEmail) {
    return NextResponse.json(
      { ok: false, error: "Please complete all required fields." },
      { status: 400 }
    );
  }

  if (
    memberId.length > 100 ||
    registryId.length > 100 ||
    correctedName.length > 160 ||
    requesterEmail.length > 254 ||
    supportingDetails.length > 1500
  ) {
    return NextResponse.json(
      { ok: false, error: "One or more fields are too long." },
      { status: 400 }
    );
  }

  if (!isValidEmail(requesterEmail)) {
    return NextResponse.json(
      { ok: false, error: "Please enter a valid email address." },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Name correction API is missing Supabase server credentials.");
    return NextResponse.json(
      {
        ok: false,
        error: "The correction service is not configured yet.",
      },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  async function updateEmailStatus(
    requestId: string,
    values: {
      email_status: string;
      email_provider_id?: string | null;
      email_error?: string | null;
    }
  ) {
    await supabase
      .from("name_correction_requests")
      .update(values)
      .eq("id", requestId);
  }

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id, uid, first_name, last_name, parish")
    .eq("id", memberId)
    .eq("uid", registryId)
    .maybeSingle();

  if (memberError) {
    console.error("Name correction member lookup failed:", memberError);
    return NextResponse.json(
      { ok: false, error: "The registry record could not be verified." },
      { status: 500 }
    );
  }

  if (!member) {
    return NextResponse.json(
      { ok: false, error: "The registry record could not be found." },
      { status: 404 }
    );
  }

  const currentName = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim();

  const { data: correctionRequest, error: insertError } = await supabase
    .from("name_correction_requests")
    .insert({
      member_id: member.id,
      registry_id: member.uid,
      current_first_name: member.first_name,
      current_last_name: member.last_name,
      parish: member.parish,
      corrected_name: correctedName,
      requester_email: requesterEmail,
      supporting_details: supportingDetails || null,
      email_status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !correctionRequest) {
    console.error("Name correction insert failed:", insertError);
    return NextResponse.json(
      {
        ok: false,
        error: "The correction request could not be recorded.",
      },
      { status: 500 }
    );
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFromEmail = process.env.RESEND_FROM_EMAIL;

  if (!resendApiKey || !resendFromEmail) {
    await updateEmailStatus(correctionRequest.id, {
      email_status: "not_configured",
      email_error: "Resend environment variables are missing.",
    });

    return NextResponse.json({
      ok: true,
      emailSent: false,
      warning:
        "The request was recorded, but email notifications are not configured yet.",
    });
  }

  const emailText = [
    "A public registry user submitted a name correction request.",
    "",
    `Registry ID: ${member.uid}`,
    `Current name: ${currentName}`,
    `Suggested corrected name: ${correctedName}`,
    `Parish: ${member.parish ?? "—"}`,
    `Requester email: ${requesterEmail}`,
    "",
    "Reason / supporting details:",
    supportingDetails || "No additional details provided.",
    "",
    `Correction request ID: ${correctionRequest.id}`,
  ].join("\n");

  try {
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resendFromEmail,
        to: [CORRECTION_INBOX],
        reply_to: requesterEmail,
        subject: `Registry name correction — ${member.uid}`,
        text: emailText,
      }),
    });

    const resendData = (await resendResponse.json().catch(() => null)) as
      | { id?: string; message?: string; name?: string }
      | null;

    if (!resendResponse.ok) {
      const providerMessage =
        resendData?.message ??
        resendData?.name ??
        `Resend returned HTTP ${resendResponse.status}.`;

      console.error("Name correction email failed:", providerMessage);

      await updateEmailStatus(correctionRequest.id, {
        email_status: "failed",
        email_error: providerMessage.slice(0, 1000),
      });

      return NextResponse.json({
        ok: true,
        emailSent: false,
        warning:
          "The request was recorded, but the email notification could not be sent.",
      });
    }

    await updateEmailStatus(correctionRequest.id, {
      email_status: "sent",
      email_provider_id: resendData?.id ?? null,
      email_error: null,
    });

    return NextResponse.json({
      ok: true,
      emailSent: true,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown email delivery error.";

    console.error("Name correction email exception:", error);

    await updateEmailStatus(correctionRequest.id, {
      email_status: "failed",
      email_error: message.slice(0, 1000),
    });

    return NextResponse.json({
      ok: true,
      emailSent: false,
      warning:
        "The request was recorded, but the email notification could not be sent.",
    });
  }
}
