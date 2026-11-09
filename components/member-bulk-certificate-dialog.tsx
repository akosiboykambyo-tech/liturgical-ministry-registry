"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  DEFAULT_TEMPLATE_SETTINGS,
  shortMinistry,
} from "@/lib/constants";
import type { CertificateTemplateSettings, Signatory } from "@/lib/types";
import {
  attachSignatureCompositions,
  SIGNATURE_LAYOUT_KEY_PREFIX,
  upgradeSignatoryOffsets,
} from "@/lib/signature-layout";
import {
  buildBulkCertificatePlan,
  certificatePlanFingerprint,
  MAX_BULK_CERTIFICATES,
  type BulkCertificateMember,
  type BulkCertificatePlan,
} from "@/lib/certificate-batch";
import { ebGaramond } from "@/app/fonts";
import {
  AlertTriangle, Download, FileBadge, Loader2, Printer,
} from "@/components/phosphor-icons";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type CertificateDesignSnapshot = {
  key: string;
  name: string;
  settings: CertificateTemplateSettings;
  signatories: Signatory[];
};

type CertificatePreview = {
  plan: BulkCertificatePlan;
  planFingerprint: string;
  design: CertificateDesignSnapshot;
  designFingerprint: string;
};

type BulkCertificateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedMemberIds: string[];
  selectedMinistries: string[];
  loadMembers: (ids: string[]) => Promise<BulkCertificateMember[]>;
};

async function loadCertificateDesign(): Promise<CertificateDesignSnapshot> {
  const supabase = getSupabaseBrowserClient();
  const [templatesResult, signatoriesResult, layoutResult] = await Promise.all([
    supabase.from("system_settings")
      .select("key,value,is_default")
      .like("key", "certificate_template%")
      .order("key"),
    supabase.from("signatories").select("*").order("sort_order"),
    supabase.from("system_settings").select("key,value")
      .like("key", SIGNATURE_LAYOUT_KEY_PREFIX + "%"),
  ]);

  if (templatesResult.error) throw new Error("Unable to load Certificate Studio templates: " + templatesResult.error.message);
  if (signatoriesResult.error) throw new Error("Unable to load certificate signatories: " + signatoriesResult.error.message);
  if (layoutResult.error) throw new Error("Unable to load certificate signature layouts: " + layoutResult.error.message);

  const templates = templatesResult.data ?? [];
  const chosen = templates.find((row) => Boolean(row.is_default)) ?? templates[0];
  if (!chosen) {
    throw new Error("No saved Certificate Studio template is available. Set up the default certificate template before bulk printing.");
  }

  const stored = chosen.value as Partial<CertificateTemplateSettings>;
  const settings: CertificateTemplateSettings = {
    ...DEFAULT_TEMPLATE_SETTINGS,
    ...stored,
    elements: upgradeSignatoryOffsets(stored.elements ?? DEFAULT_TEMPLATE_SETTINGS.elements ?? []),
  };

  // The existing admin member drawer uses the default template and the same
  // signatory composition loader. A failure is an error, never a fallback to
  // printing without signatures.
  const signatories = attachSignatureCompositions(
    (signatoriesResult.data ?? []) as Signatory[],
    layoutResult.data ?? []
  );

  // renderCertificate currently falls back to a default background when its
  // image fetch fails. Prevent that silent replacement in bulk printing.
  if (settings.template_url) {
    const background = await fetch(settings.template_url);
    if (!background.ok) {
      throw new Error("The saved certificate background is unavailable. Repair it in Certificate Studio before printing.");
    }
  }

  const name = chosen.key === "certificate_template"
    ? "Default Template"
    : chosen.key.replace(/^certificate_template_?/, "").replace(/[_-]+/g, " ") || chosen.key;

  return { key: chosen.key, name, settings, signatories };
}

function designFingerprint(design: CertificateDesignSnapshot) {
  return JSON.stringify([design.key, design.settings, design.signatories]);
}

function currentDateFilename() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return "cowl-dok-certificates-" + now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate()) + ".pdf";
}

export function BulkCertificateDialog({
  open, onOpenChange, selectedMemberIds, selectedMinistries, loadMembers,
}: BulkCertificateDialogProps) {
  const [preview, setPreview] = useState<CertificatePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  // The parent passes freshly allocated arrays each render; use a stable key
  // so that unrelated toolbar changes cannot reset a pending preflight.
  const membersKey = selectedMemberIds.join("|");
  const ministriesKey = selectedMinistries.join("|");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const prepare = async () => {
      setLoading(true);
      setPreview(null);
      setError("");
      setProgress(0);
      try {
        if (selectedMemberIds.length === 0) throw new Error("Select at least one member before printing.");
        if (selectedMinistries.length === 0) throw new Error("Select a ministry filter to define which certificates to print.");

        const [members, design] = await Promise.all([
          loadMembers(selectedMemberIds),
          loadCertificateDesign(),
        ]);
        const found = new Set(members.map((member) => member.id));
        if (selectedMemberIds.some((id) => !found.has(id))) {
          throw new Error("Some selected records are unavailable. Refresh Member Records and select them again.");
        }

        const plan = buildBulkCertificatePlan(members, selectedMinistries);
        if (!cancelled) {
          setPreview({
            plan, planFingerprint: certificatePlanFingerprint(plan),
            design, designFingerprint: designFingerprint(design),
          });
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to prepare the certificate batch.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void prepare();
    return () => { cancelled = true; };
  // Input arrays are represented by their stable keys to avoid reloading on
  // unrelated parent renders. A changed filter always rebuilds the plan.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, membersKey, ministriesKey, loadMembers, reload]);

  const handleGenerate = async () => {
    if (!preview || generating || loading) return;
    setGenerating(true);
    setProgress(0);
    setError("");
    try {
      // Refetch immediately before rendering so a revoked approval or changed
      // expiry cannot produce a certificate from a stale eligibility preview.
      const [freshMembers, freshDesign] = await Promise.all([
        loadMembers(selectedMemberIds),
        loadCertificateDesign(),
      ]);
      const found = new Set(freshMembers.map((member) => member.id));
      if (selectedMemberIds.some((id) => !found.has(id))) {
        throw new Error("Member selection changed. Refresh the preview and select records again.");
      }
      const freshPlan = buildBulkCertificatePlan(freshMembers, selectedMinistries);
      const freshFingerprint = certificatePlanFingerprint(freshPlan);
      const freshDesignFingerprint = designFingerprint(freshDesign);

      if (freshFingerprint !== preview.planFingerprint || freshDesignFingerprint !== preview.designFingerprint) {
        setPreview({
          plan: freshPlan, planFingerprint: freshFingerprint,
          design: freshDesign, designFingerprint: freshDesignFingerprint,
        });
        throw new Error("The member records or certificate design changed since preview. Review the updated batch, then generate again.");
      }
      if (freshPlan.eligible.length < 1 || freshPlan.eligible.length > MAX_BULK_CERTIFICATES) {
        throw new Error("Select 1–" + MAX_BULK_CERTIFICATES + " eligible ministry certificates per PDF.");
      }

      // The administrative print path, like the existing member drawer,
      // renders documents without allocating public issuance/reprint counters.
      const { downloadCertificateBatchAsPdf } = await import("@/lib/certificate");
      await downloadCertificateBatchAsPdf(
        freshPlan.eligible.map(({ member, assignment }) => ({
          firstName: member.first_name,
          lastName: member.last_name,
          parish: member.parish,
          ministries: member.ministries,
          uid: member.uid,
          liturgicalYear: freshDesign.settings.liturgical_year,
          selectedMinistry: assignment.ministry,
          verifyUrl: window.location.origin + "/verify?uid=" + encodeURIComponent(member.uid),
        })),
        freshDesign.settings,
        freshDesign.signatories,
        currentDateFilename(),
        (completed) => setProgress(completed)
      );
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to generate the certificate PDF.");
    } finally {
      setGenerating(false);
    }
  };

  const eligible = preview?.plan.eligible ?? [];
  const excluded = preview?.plan.excluded ?? [];
  const tooMany = eligible.length > MAX_BULK_CERTIFICATES;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!generating) onOpenChange(next); }}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-[940px] overflow-y-auto rounded-none border border-[#E6DADC] bg-[#FBF9F9] p-4 sm:max-w-[940px] sm:p-7 [&>button]:rounded-none">
        <DialogHeader className="border-b border-[#E6DADC] pb-4 text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#890022]">RECORD MANAGEMENT · BULK ACTION</p>
          <DialogTitle className={ebGaramond.className + " text-[32px] font-medium leading-none text-[#1E1114] sm:text-[38px]"}>
            Print Certificates
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-[#5F4A4F]">
            One print-ready PDF, one page per eligible ministry assignment matching the current ministry filter. No other ministry will be printed.
          </DialogDescription>
        </DialogHeader>

        <div className="border border-[#E6DADC] bg-white p-4">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6B5C62]">Selected ministry filter</p>
              <p className="mt-1 text-sm font-semibold text-[#1E1114]">
                {selectedMinistries.length ? selectedMinistries.map(shortMinistry).join(" · ") : "No ministry selected"}
              </p>
              <p className="mt-1 text-xs text-[#6B5C62]">{selectedMemberIds.length} selected member(s)</p>
            </div>
            <div className="flex items-start gap-2 text-[#890022]">
              <FileBadge className="h-5 w-5" aria-hidden="true"/>
              <span className="text-xs font-semibold">{preview?.design.name ?? "Certificate Studio default"}</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div role="status" className="flex min-h-[170px] items-center justify-center gap-3 text-sm text-[#5F4A4F]">
            <Loader2 className="h-5 w-5 animate-spin text-[#890022]"/>Checking assignments and certificate design…
          </div>
        ) : preview && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="border border-[#E6DADC] border-t-[3px] border-t-[#890022] bg-white p-4">
                <p className="text-xs text-[#5F4A4F]">Eligible certificates</p>
                <p className={ebGaramond.className + " mt-1 text-3xl font-semibold tabular-nums"}>{eligible.length}</p>
              </div>
              <div className="border border-[#E6DADC] border-t-[3px] border-t-[#7A4E00] bg-white p-4">
                <p className="text-xs text-[#5F4A4F]">Excluded assignments</p>
                <p className={ebGaramond.className + " mt-1 text-3xl font-semibold tabular-nums"}>{excluded.length}</p>
              </div>
              <div className="col-span-2 border border-[#E6DADC] border-t-[3px] border-t-[#3B5278] bg-white p-4 sm:col-span-1">
                <p className="text-xs text-[#5F4A4F]">PDF pages</p>
                <p className={ebGaramond.className + " mt-1 text-3xl font-semibold tabular-nums"}>{eligible.length}</p>
              </div>
            </div>

            {tooMany && (
              <div role="alert" className="flex items-start gap-2 border-l-[3px] border-[#7A4E00] bg-[#FAF5E9] px-4 py-3 text-sm text-[#7A4E00]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>
                To protect print quality and browser memory, each PDF is limited to {MAX_BULK_CERTIFICATES} certificates. Select fewer members or ministries and try again.
              </div>
            )}
            <section className="border border-[#E6DADC] bg-white">
              <div className="border-b border-[#E6DADC] px-4 py-3">
                <h3 className="text-sm font-semibold text-[#1E1114]">Certificates ready to print</h3>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {eligible.length === 0 ? <p className="p-4 text-sm text-[#5F4A4F]">No eligible assignments match this selection.</p> :
                <ul className="divide-y divide-[#E6DADC]">{eligible.map(({ member, assignment }) => (
                  <li key={member.id + "/" + assignment.id} className="flex flex-wrap justify-between gap-2 px-4 py-2.5 text-sm">
                    <span className="font-semibold text-[#39232B]">{member.first_name} {member.last_name}</span>
                    <span className="text-xs text-[#5F4A4F]">{shortMinistry(assignment.ministry)} · {assignment.status}</span>
                  </li>
                ))}</ul>}
              </div>
            </section>

            {excluded.length > 0 && (
              <section className="border border-[#E6DADC] bg-white">
                <div className="border-b border-[#E6DADC] px-4 py-3">
                  <h3 className="text-sm font-semibold text-[#7A4E00]">Excluded from printing</h3>
                  <p className="mt-1 text-xs text-[#5F4A4F]">Only eligible assignments will appear in the PDF. Resolve these separately in Member Records or Registration.</p>
                </div>
                <div className="max-h-40 overflow-y-auto">
                  <ul className="divide-y divide-[#E6DADC]">{excluded.map((item, index) => (
                    <li key={item.memberId + "/" + item.ministry + "/" + index} className="px-4 py-2.5 text-xs">
                      <strong className="text-[#39232B]">{item.memberName} · {shortMinistry(item.ministry)}</strong>
                      <span className="ml-2 text-[#7A4E00]">{item.reason}</span>
                    </li>
                  ))}</ul>
                </div>
              </section>
            )}
          </div>
        )}

        {error && <p role="alert" className="border-l-4 border-[#B00020] bg-[#FBEFEF] px-4 py-3 text-sm text-[#B00020]">{error}</p>}
        {generating && <p role="status" className="flex items-center gap-2 text-sm text-[#5F4A4F]"><Loader2 className="h-4 w-4 animate-spin"/>Rendering certificate {progress} of {eligible.length}…</p>}

        <p className="text-xs leading-5 text-[#5F4A4F]">
          The PDF uses the saved Certificate Studio design, signatories and paper orientation. This administrative print export does not approve members, alter validity, or allocate public certificate download numbers.
        </p>
        <DialogFooter className="border-t border-[#E6DADC] pt-4">
          <button type="button" disabled={generating}
            onClick={() => onOpenChange(false)}
            className="inline-flex min-h-10 items-center justify-center border border-[#D7CACC] bg-white px-4 py-2 text-sm font-semibold text-[#890022] hover:bg-[#FCF5F6] disabled:opacity-50">
            Close
          </button>
          {error && !preview && (
            <button type="button" disabled={loading || generating} onClick={() => setReload((current) => current + 1)}
              className="inline-flex min-h-10 items-center justify-center border border-[#D7CACC] bg-white px-4 py-2 text-sm font-semibold text-[#890022] hover:bg-[#FCF5F6] disabled:opacity-50">
              Retry
            </button>
          )}
          <button type="button"
            disabled={loading || generating || !preview || eligible.length === 0 || tooMany}
            onClick={() => void handleGenerate()}
            className="inline-flex min-h-10 items-center justify-center gap-2 bg-[#890022] px-4 py-2 text-sm font-semibold text-white hover:bg-[#70001B] disabled:cursor-not-allowed disabled:opacity-50">
            {generating ? <Loader2 className="h-4 w-4 animate-spin"/> : <Download className="h-4 w-4"/>}
            {generating ? "Preparing PDF…" : "Generate Print-Ready PDF"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
