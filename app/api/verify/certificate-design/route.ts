import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { DEFAULT_TEMPLATE_SETTINGS } from "@/lib/constants";
import type { CertificateTemplateSettings } from "@/lib/types";
import { normalizeSignatureComposition } from "@/lib/signature-layout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public verification must render the published certificate artwork, but it
 * must not have unrestricted table access to every system_settings value.
 * This fixed-scope, read-only endpoint publishes exactly one default template
 * and the signatory artwork coordinates that the public certificate uses.
 * Never return raw settings rows, private documents, or a service-role key.
 */
const PUBLIC_ELEMENT_KEYS = new Set([
  "id", "type", "x", "y", "width", "height", "rotation",
  "text", "font_family", "font_size", "font_weight", "font_style",
  "text_case", "text_align", "color", "opacity", "image_url",
  "signatory_id", "signature_offset", "signature_offset_version",
  "visible", "locked", "z_index",
]);

function publishableTemplate(input: unknown): CertificateTemplateSettings | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;

  const source = input as Record<string, unknown>;
  const published: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_TEMPLATE_SETTINGS)) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    if (key === "elements") {
      if (!Array.isArray(source.elements)) continue;
      published.elements = source.elements.slice(0, 150)
        .filter((element): element is Record<string, unknown> =>
          Boolean(element) && typeof element === "object" && !Array.isArray(element))
        .map((element) => Object.fromEntries(
          Object.entries(element).filter(([elementKey]) => PUBLIC_ELEMENT_KEYS.has(elementKey))
        ));
      continue;
    }
    published[key] = source[key];
  }

  return { ...DEFAULT_TEMPLATE_SETTINGS, ...published } as CertificateTemplateSettings;
}

const headers = {
  "Cache-Control": "public, max-age=0, s-maxage=60",
  "X-Content-Type-Options": "nosniff",
};

function unavailable() {
  return NextResponse.json(
    { error: "Published certificate design is temporarily unavailable." },
    { status: 503, headers: { ...headers, "Cache-Control": "no-store" } }
  );
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return unavailable();

  try {
    const supabase = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const [templateResult, layoutsResult] = await Promise.all([
      supabase.from("system_settings").select("key,value")
        .like("key", "certificate_template%")
        .eq("is_default", true).order("key").limit(1).maybeSingle(),
      supabase.from("system_settings").select("key,value")
        .like("key", "sig_layout_%").limit(100),
    ]);
    if (templateResult.error || layoutsResult.error) return unavailable();

    const template = publishableTemplate(templateResult.data?.value) ??
      DEFAULT_TEMPLATE_SETTINGS;
    const layouts = (layoutsResult.data ?? [])
      .filter((row) => /^sig_layout_[0-9a-f-]{36}$/i.test(row.key))
      .map((row) => ({
        key: row.key,
        value: normalizeSignatureComposition(row.value),
      }));

    return NextResponse.json({ template, layouts }, { headers });
  } catch {
    return unavailable();
  }
}
