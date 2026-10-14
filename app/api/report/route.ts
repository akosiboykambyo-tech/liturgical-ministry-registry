import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type ReportPayload = {
  reportKind?: unknown;
  subject?: unknown;
  details?: unknown;
  reporterName?: unknown;
  reporterEmail?: unknown;
  memberId?: unknown;
  registryId?: unknown;
  website?: unknown;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function referenceFromId(id: string) {
  return `LMR-${new Date().getFullYear()}-${id.slice(0, 8).toUpperCase()}`;
}

export async function POST(request: Request) {
  let payload: ReportPayload;

  try {
    payload = (await request.json()) as ReportPayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  const reportKind = text(payload.reportKind);
  const subject = text(payload.subject);
  const details = text(payload.details);
  const reporterName = text(payload.reporterName);
  const reporterEmail = text(payload.reporterEmail).toLowerCase();
  const memberId = text(payload.memberId);
  const registryId = text(payload.registryId);
  const website = text(payload.website);

  if (website) {
    return NextResponse.json({
      ok: true,
      reference: "LMR-RECEIVED",
      submittedAt: new Date().toISOString(),
    });
  }

  if (
    !["record_detail", "authenticity", "other"].includes(reportKind) ||
    !subject ||
    !details ||
    !reporterName ||
    !reporterEmail
  ) {
    return NextResponse.json(
      { ok: false, error: "Please complete all required fields." },
      { status: 400 }
    );
  }

  if (!validEmail(reporterEmail)) {
    return NextResponse.json(
      { ok: false, error: "Please enter a valid email address." },
      { status: 400 }
    );
  }

  if (
    subject.length > 240 ||
    details.length > 3000 ||
    reporterName.length > 160 ||
    reporterEmail.length > 254 ||
    memberId.length > 100 ||
    registryId.length > 100
  ) {
    return NextResponse.json(
      { ok: false, error: "One or more fields are too long." },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { ok: false, error: "The reporting service is not configured yet." },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  let verifiedMemberId: string | null = null;
  let verifiedRegistryId: string | null = null;

  if (memberId || registryId) {
    let query = supabase
      .from("members")
      .select("id,uid")
      .limit(1);

    if (memberId) query = query.eq("id", memberId);
    if (registryId) query = query.eq("uid", registryId);

    const { data: member, error } = await query.maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: "The linked registry record could not be verified." },
        { status: 500 }
      );
    }

    if (member) {
      verifiedMemberId = member.id;
      verifiedRegistryId = member.uid;
    }
  }

  const { data: report, error: insertError } = await supabase
    .from("public_reports")
    .insert({
      report_type: reportKind,
      subject,
      details,
      reporter_name: reporterName,
      reporter_email: reporterEmail,
      member_id: verifiedMemberId,
      registry_id: verifiedRegistryId,
      status: "pending",
    })
    .select("id,created_at")
    .single();

  if (insertError || !report) {
    console.error("Public report insert failed:", insertError);
    return NextResponse.json(
      { ok: false, error: "The report could not be recorded." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    reference: referenceFromId(report.id),
    submittedAt: report.created_at,
  });
}
