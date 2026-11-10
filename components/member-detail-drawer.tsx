"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { secureMinistryVerificationEnabled } from "@/lib/secure-ministry-verification";
import {
  STATUS_VALUES,
  getExpirationStatus,
  DEFAULT_TEMPLATE_SETTINGS,
} from "@/lib/constants";
import { MinistryMultiSelect } from "@/components/ministry-multi-select";
import { ebGaramond } from "@/app/fonts";
import type { Member, MemberMinistry, AuditLog, ArchivedDocument, MemberStatus, CertificateTemplateSettings, Signatory } from "@/lib/types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Loader2,
  Save,
  Upload,
  FileText,
  Trash2,
  ExternalLink,
  QrCode,
  AlertTriangle,
  ScrollText,
  Archive,
  Printer,
  Pencil,
} from "@/components/phosphor-icons";
import { useToast } from "@/hooks/use-toast";
import { attachSignatureCompositions, SIGNATURE_LAYOUT_KEY_PREFIX } from "@/lib/signature-layout";
import {
  CertificateDesign,
  type CertificateDesignHandle,
} from "@/components/certificate-design";

type MembershipDraft = Pick<
  MemberMinistry,
  | "id"
  | "ministry"
  | "status"
  | "start_date"
  | "expiration_date"
  | "renewal_date"
  | "document_url"
  | "document_uploaded_at"
  | "archived_documents"
>;

export function MemberDetailDrawer({
  memberId,
  open,
  onOpenChange,
  onUpdated,
}: {
  memberId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}) {
  const supabase = getSupabaseBrowserClient();
  const { toast } = useToast();
  const [member, setMember] = useState<Member | null>(null);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editMinistries, setEditMinistries] = useState<string[]>([]);
  const [membershipDrafts, setMembershipDrafts] = useState<MembershipDraft[]>([]);
  const [persistedMembershipIds, setPersistedMembershipIds] = useState<string[]>([]);
  const [membershipTableAvailable, setMembershipTableAvailable] = useState(true);
  const [selectedMinistry, setSelectedMinistry] = useState<string | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [certificateSettings, setCertificateSettings] =
    useState<CertificateTemplateSettings>(DEFAULT_TEMPLATE_SETTINGS);
  const [certificateSignatories, setCertificateSignatories] =
    useState<Signatory[]>([]);
  const certificateRef = useRef<CertificateDesignHandle>(null);
  const [printingCertificate, setPrintingCertificate] = useState(false);
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [signedMembershipDocUrl, setSignedMembershipDocUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Each opened member gets its own loading generation. Stale requests must never
  // overwrite the details for a different member or a closed drawer.
  const loadVersion = useRef(0);

  const load = useCallback(async () => {
    if (!memberId) return;
    const version = ++loadVersion.current;
    const isCurrent = () => loadVersion.current === version;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    setLoading(true);
    setError(null);
    setMember(null);
    setAudits([]);
    setMembershipDrafts([]);
    setPersistedMembershipIds([]);
    setCertificateSettings(DEFAULT_TEMPLATE_SETTINGS);
    setCertificateSignatories([]);

    try {
      const { data, error: memberError } = await supabase
        .from("members")
        .select("*")
        .eq("id", memberId)
        .maybeSingle()
        .abortSignal(controller.signal);

      if (!isCurrent()) return;
      if (memberError) throw memberError;
      if (!data) {
        setError("Member not found.");
        return;
      }

      const m = data as Member;
      setMember(m);
      setEditMinistries(m.ministries ?? []);
      setEditFirstName(m.first_name);
      setEditLastName(m.last_name);
      setEditingName(false);
      setNotes(m.notes ?? "");

      const { data: membershipRows, error: membershipError } = await supabase
        .from("member_ministries")
        .select("*")
        .eq("member_id", m.id)
        .order("created_at")
        .abortSignal(controller.signal);

      if (!isCurrent()) return;
      if (!membershipError) {
        const rows = (membershipRows as MemberMinistry[]) ?? [];
        setMembershipTableAvailable(true);
        setMembershipDrafts(
          rows.map((row) => ({
            id: row.id,
            ministry: row.ministry,
            status: row.status,
            start_date: row.start_date,
            expiration_date: row.expiration_date,
            renewal_date: row.renewal_date,
            document_url: row.document_url,
            document_uploaded_at: row.document_uploaded_at,
            archived_documents: row.archived_documents ?? [],
          }))
        );
        setPersistedMembershipIds(rows.map((row) => row.id));
        setEditMinistries(rows.map((row) => row.ministry));
        setSelectedMinistry((current) =>
          current && rows.some((row) => row.ministry === current)
            ? current
            : rows[0]?.ministry ?? null
        );
      } else {
        // A failed assignment query must not silently enable assignment editing.
        setMembershipTableAvailable(false);
        setMembershipDrafts(
          (m.ministries ?? []).map((ministry) => ({
            id: "",
            ministry,
            status: m.status,
            start_date: m.created_at.slice(0, 10),
            expiration_date: m.expiration_date,
            renewal_date: null,
            document_url: m.document_url,
            document_uploaded_at: null,
            archived_documents: m.archived_documents ?? [],
          }))
        );
        setPersistedMembershipIds([]);
        setSelectedMinistry((current) =>
          current && (m.ministries ?? []).includes(current)
            ? current
            : m.ministries?.[0] ?? null
        );
        setError("Ministry assignments could not be loaded. Reopen the record before making changes.");
      }

      // The drawer is usable now; certificate metadata and audit history must
      // never prolong its primary loading spinner.
      void Promise.allSettled([
        (async () => {
          const { data: templateRows } = await supabase
            .from("system_settings")
            .select("*")
            .like("key", "certificate_template%")
            .order("key");
          if (!isCurrent()) return;
          const defaultTemplate =
            (templateRows ?? []).find((row) => Boolean(row.is_default)) ??
            (templateRows ?? [])[0];
          setCertificateSettings(
            defaultTemplate
              ? {
                  ...DEFAULT_TEMPLATE_SETTINGS,
                  ...(defaultTemplate.value as CertificateTemplateSettings),
                }
              : DEFAULT_TEMPLATE_SETTINGS
          );
        })(),
        (async () => {
          const [signatoryResult, layoutResult] = await Promise.all([
            supabase.from("signatories").select("*").order("sort_order"),
            supabase.from("system_settings").select("key,value")
              .like("key", `${SIGNATURE_LAYOUT_KEY_PREFIX}%`),
          ]);
          if (!isCurrent()) return;
          setCertificateSignatories(
            attachSignatureCompositions(
              (signatoryResult.data as Signatory[]) ?? [],
              layoutResult.error ? [] : (layoutResult.data ?? [])
            )
          );
        })(),
        (async () => {
          const { data: logs } = await supabase
            .from("audit_logs")
            .select("*")
            .eq("member_id", m.id)
            .order("timestamp", { ascending: false })
            .limit(10);
          if (isCurrent()) setAudits((logs as AuditLog[]) ?? []);
        })(),
      ]);
    } catch (loadError) {
      if (isCurrent()) {
        setError(
          controller.signal.aborted
            ? "Member details timed out. Close the drawer and try again."
            : "Unable to load member details. Close the drawer and try again."
        );
      }
    } finally {
      clearTimeout(timeout);
      if (isCurrent()) setLoading(false);
    }
  }, [memberId, supabase]);

  useEffect(() => {
    if (open && memberId) void load();
    return () => {
      loadVersion.current += 1;
    };
  }, [open, memberId, load]);

  const selectedMembership =
    membershipDrafts.find((membership) => membership.ministry === selectedMinistry) ??
    membershipDrafts[0] ??
    null;

  const selectedDocumentIsSharedBatch =
    selectedMembership?.document_url?.startsWith("batch-renewals/") ?? false;

  useEffect(() => {
    let cancelled = false;

    const loadSignedDocument = async () => {
      if (!selectedMembership?.document_url) {
        setSignedMembershipDocUrl(null);
        return;
      }

      const { data } = await supabase.storage
        .from("member-documents")
        .createSignedUrl(selectedMembership.document_url, 3600);

      if (!cancelled) {
        setSignedMembershipDocUrl(data?.signedUrl ?? null);
      }
    };

    void loadSignedDocument();

    return () => {
      cancelled = true;
    };
  }, [selectedMembership?.document_url, supabase]);

  const selectedExpirationStatus = getExpirationStatus(
    selectedMembership?.expiration_date ?? null
  );

  const selectedCertificateEligible =
    Boolean(selectedMembership) &&
    (selectedMembership?.status === "New" || selectedMembership?.status === "Renewed") &&
    selectedExpirationStatus !== "expired" &&
    selectedExpirationStatus !== "expiring_soon";

  const handleMinistriesChange = (ministries: string[]) => {
    setEditMinistries(ministries);
    setMembershipDrafts((current) =>
      ministries.map((ministry) => {
        const existing = current.find((row) => row.ministry === ministry);
        if (existing) return existing;

        return {
          id: "",
          ministry,
          status: "Pending Verification" as MemberStatus,
          start_date: new Date().toISOString().slice(0, 10),
          expiration_date: null,
          renewal_date: null,
          document_url: null,
          document_uploaded_at: null,
          archived_documents: [],
        };
      })
    );

    setSelectedMinistry((current) =>
      current && ministries.includes(current) ? current : ministries[0] ?? null
    );
  };

  const updateMembershipDraft = (
    ministry: string,
    field: "status" | "start_date" | "expiration_date" | "renewal_date",
    value: MemberStatus | string | null
  ) => {
    setMembershipDrafts((current) =>
      current.map((row) =>
        row.ministry === ministry ? { ...row, [field]: value || null } : row
      )
    );
  };

  const handleSave = async () => {
    if (!member) return;
    if (secureMinistryVerificationEnabled) {
      setError("Direct member and assignment edits are paused in secure verification mode. Use the Verification workspace.");
      return;
    }

    const firstName = editFirstName.trim().normalize("NFC");
    const lastName = editLastName.trim().normalize("NFC");

    if (!firstName || !lastName) {
      setError("First name and last name cannot be blank.");
      return;
    }

    setSaving(true);
    setError(null);

    const { error } = await supabase
      .from("members")
      .update({
        first_name: firstName,
        last_name: lastName,
        ministries: editMinistries,
        notes: notes.trim() || null,
      })
      .eq("id", member.id);

    if (!error && membershipTableAvailable) {
      const currentIds = new Set(
        membershipDrafts.map((row) => row.id).filter((id): id is string => Boolean(id))
      );
      const removedMembershipIds = persistedMembershipIds.filter(
        (id) => !currentIds.has(id)
      );

      if (removedMembershipIds.length > 0) {
        const { error: removeError } = await supabase
          .from("member_ministries")
          .delete()
          .in("id", removedMembershipIds);

        if (removeError) {
          setSaving(false);
          setError(removeError.message);
          return;
        }
      }

      if (membershipDrafts.length > 0) {
        const { error: membershipSaveError } = await supabase
          .from("member_ministries")
          .upsert(
            membershipDrafts.map((row) => ({
              member_id: member.id,
              ministry: row.ministry,
              status: row.status,
              start_date: row.start_date,
              expiration_date: row.expiration_date,
              renewal_date: row.renewal_date,
            })),
            { onConflict: "member_id,ministry" }
          );

        if (membershipSaveError) {
          setSaving(false);
          setError(membershipSaveError.message);
          return;
        }
      }
    }

    setSaving(false);

    if (error) {
      setError(error.message);
    } else {
      setEditingName(false);
      toast({
        title: "Saved",
        description: "Member details updated.",
      });
      load();
      onUpdated?.();
    }
  };

  const cancelNameEdit = () => {
    if (!member) return;
    setEditFirstName(member.first_name);
    setEditLastName(member.last_name);
    setEditingName(false);
  };

  const handleUpload = async (file: File) => {
    if (secureMinistryVerificationEnabled) {
      setError("Legacy upload also renews the ministry without secure approval. This action is disabled until the secure letter workflow is installed.");
      return;
    }
    if (
      !member ||
      !membershipTableAvailable ||
      !selectedMembership?.id
    ) {
      setError("Save the ministry assignment before uploading its recommendation letter.");
      return;
    }

    setUploading(true);
    setError(null);

    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const nowIso = new Date().toISOString();
    const uploadId = crypto.randomUUID();
    const path = `${member.id}/${selectedMembership.id}/recommendation-letter-${uploadId}.${ext}`;

    const archivedDocuments = selectedMembership.archived_documents ?? [];
    const nextArchivedDocuments = selectedMembership.document_url
      ? [
          ...archivedDocuments,
          {
            document_url: selectedMembership.document_url,
            uploaded_at: selectedMembership.document_uploaded_at,
            archived_at: nowIso,
            expiration_date: selectedMembership.expiration_date,
            ministry: selectedMembership.ministry,
          } satisfies ArchivedDocument,
        ]
      : archivedDocuments;

    const { error: upErr } = await supabase.storage
      .from("member-documents")
      .upload(path, file, { upsert: false });

    if (upErr) {
      setError(upErr.message);
      setUploading(false);
      return;
    }

    const defaultExp = new Date();
    defaultExp.setFullYear(defaultExp.getFullYear() + 1);
    const newExpDate = defaultExp.toISOString().slice(0, 10);
    const renewalDate = new Date().toISOString().slice(0, 10);

    const { error: membershipRenewalError } = await supabase
      .from("member_ministries")
      .update({
        status: "Renewed",
        expiration_date: newExpDate,
        renewal_date: renewalDate,
        document_url: path,
        document_uploaded_at: nowIso,
        archived_documents: nextArchivedDocuments,
      })
      .eq("id", selectedMembership.id);

    if (membershipRenewalError) {
      // The DB update failed, so this newly uploaded object is not referenced.
      // Remove only this new immutable object; never remove the previous letter.
      await supabase.storage.from("member-documents").remove([path]);
      setError(membershipRenewalError.message);
      setUploading(false);
      return;
    }

    // Temporary compatibility mirror for screens that still read member-level
    // document/status fields. member_ministries remains the canonical source.
    const { error: memberUpdateError } = await supabase
      .from("members")
      .update({
        document_url: path,
        expiration_date: newExpDate,
        status: "Renewed",
      })
      .eq("id", member.id);

    if (memberUpdateError) {
      setError(memberUpdateError.message);
      setUploading(false);
      return;
    }

    setUploading(false);
    toast({
      title: "Letter uploaded",
      description: `${selectedMembership.ministry} renewed for one year.`,
    });
    load();
    onUpdated?.();
  };

  const handleDeleteDocument = async () => {
    if (secureMinistryVerificationEnabled) {
      setError("Direct document changes are disabled during secure verification rollout.");
      return;
    }
    if (!selectedMembership?.id || !selectedMembership.document_url) return;

    setError(null);

    const documentPath = selectedMembership.document_url;
    const isSharedBatchDocument = documentPath.startsWith("batch-renewals/");

    // Batch-renewal letters are intentionally shared by many memberships and
    // are also part of the durable renewal history. Never delete that physical
    // storage object from an individual member drawer. Detaching this one
    // membership is safe; the shared file remains available to the rest of the
    // batch and to renewal-history records.
    if (!isSharedBatchDocument) {
      const { error: storageError } = await supabase.storage
        .from("member-documents")
        .remove([documentPath]);

      if (storageError) {
        setError(storageError.message);
        return;
      }
    }

    const { error: membershipUpdateError } = await supabase
      .from("member_ministries")
      .update({
        document_url: null,
        document_uploaded_at: null,
        expiration_date: null,
      })
      .eq("id", selectedMembership.id);

    if (membershipUpdateError) {
      setError(membershipUpdateError.message);
      return;
    }

    // Clear the legacy mirror only when it points at the same document.
    if (member?.document_url === documentPath) {
      await supabase
        .from("members")
        .update({ document_url: null, expiration_date: null })
        .eq("id", member.id);
    }

    toast({
      title: isSharedBatchDocument ? "Batch letter detached" : "Document removed",
      description: isSharedBatchDocument
        ? "This membership no longer uses the shared letter. The batch document was retained for other members and renewal history."
        : "The recommendation letter was removed from this membership.",
    });

    load();
    onUpdated?.();
  };

  const publicVerifyUrl = member
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/verify?uid=${member.uid}`
    : "";

  const handlePrintCertificate = () => {
  if (!member?.uid || member.uid === "PENDING" || !selectedCertificateEligible) return;

  const sourceCanvas = certificateRef.current?.getCanvas();
  if (!sourceCanvas) return;

  setPrintingCertificate(true);

  const printContainer = document.createElement("div");
  printContainer.className = "member-certificate-direct-print";
  printContainer.setAttribute("aria-hidden", "true");

  const printCanvas = document.createElement("canvas");
  printCanvas.width = sourceCanvas.width;
  printCanvas.height = sourceCanvas.height;
  printCanvas.className = "member-certificate-direct-print-canvas";

  const printContext = printCanvas.getContext("2d");
  if (!printContext) {
    setPrintingCertificate(false);
    return;
  }

  printContext.drawImage(sourceCanvas, 0, 0);

  printContainer.appendChild(printCanvas);
  document.body.appendChild(printContainer);

  const cleanup = () => {
    printContainer.remove();
    document.body.classList.remove("member-certificate-print-mode");
    setPrintingCertificate(false);
    window.removeEventListener("afterprint", cleanup);
  };

  window.addEventListener("afterprint", cleanup);

  document.body.classList.add("member-certificate-print-mode");

  requestAnimationFrame(() => {
    window.print();
  });
};

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="cowl-member-drawer w-full sm:max-w-2xl overflow-hidden border-l border-[#E3D8DA] bg-[#FBF9F9] p-0 [&>button]:rounded-none [&>button]:border [&>button]:border-[#DDD0D3] [&>button]:text-[#890022] [&>button]:hover:bg-[#F6ECEE]"
      >
        {loading ? (
          <div className="flex items-center justify-center h-full min-h-[400px]">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !member ? (
          <div className="flex items-center justify-center h-full min-h-[400px]">
            <p role="alert" className="max-w-sm px-6 text-center text-sm text-muted-foreground">{error ?? "Member not found."}</p>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {secureMinistryVerificationEnabled && (
              <p role="status" className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-950">
                Read-only during secure rollout. Approve selected assignments in Verification;
                legacy editing and document-renewal shortcuts are disabled.
              </p>
            )}
            {/* Header */}
            <SheetHeader className="border-b border-[#E3D8DA] bg-white px-5 pb-4 pt-7 sm:px-6">
              <SheetTitle className={`${ebGaramond.className} pr-10 text-[32px] leading-tight font-medium tracking-normal text-[#211018]`}>
                {member.first_name} {member.last_name}
              </SheetTitle>
              <SheetDescription className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#796870]">
                <span>{member.parish}</span>
                <span className="text-muted-foreground/50">·</span>
                <span>UID: <code className="text-xs">{member.uid}</code></span>
              </SheetDescription>
            </SheetHeader>

            {/* Body */}
            <div className="flex-1 overflow-y-auto scrollbar-thin space-y-4 bg-[#FBF9F9] px-4 py-5 sm:px-6">
              {error && (
                <div className="flex items-start gap-2 rounded-none bg-destructive/10 px-4 py-3 text-sm text-destructive ring-1 ring-inset ring-destructive/20">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Edit section */}
              <div className="rounded-none border border-[#E3D8DA] border-t-2 border-t-[#890022] bg-white p-5  space-y-4">
                <h3 className="text-sm font-semibold text-[#211018]">Member Details</h3>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      Member Name
                    </p>

                    {!editingName ? (
                      <button
                        type="button"
                        onClick={() => setEditingName(true)}
                        className="inline-flex items-center gap-1.5 rounded-none border border-[#D9C9CD] bg-white px-2.5 py-1.5 text-xs font-medium text-[#890022] hover:bg-[#F6ECEE] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit Name
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={cancelNameEdit}
                        disabled={saving}
                        className="rounded-none border border-[#D9C9CD] bg-white px-2.5 py-1.5 text-xs font-medium text-[#890022] hover:bg-[#F6ECEE] transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Cancel
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="drawer-member-first-name"
                        className="text-xs text-muted-foreground"
                      >
                        First Name
                      </label>

                      {editingName ? (
                        <input
                          id="drawer-member-first-name"
                          value={editFirstName}
                          onChange={(e) => setEditFirstName(e.target.value)}
                          autoComplete="given-name"
                          className="mt-1 w-full rounded-none border border-[#DDD0D3] bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      ) : (
                        <p className="mt-1 text-sm font-medium">
                          {member.first_name}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="drawer-member-last-name"
                        className="text-xs text-muted-foreground"
                      >
                        Last Name
                      </label>

                      {editingName ? (
                        <input
                          id="drawer-member-last-name"
                          value={editLastName}
                          onChange={(e) => setEditLastName(e.target.value)}
                          autoComplete="family-name"
                          className="mt-1 w-full rounded-none border border-[#DDD0D3] bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      ) : (
                        <p className="mt-1 text-sm font-medium">
                          {member.last_name}
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">Parish</p>
                    <p className="mt-1 text-sm font-medium">{member.parish}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium">Assigned Ministries</label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Each ministry now has its own workflow status and validity dates.
                    </p>
                  </div>

                  <div className="[&_label]:!rounded-none [&_label]:!border-[#E3D8DA] [&_label]:!bg-white [&_label:has(input:checked)]:!border-[#890022] [&_label:has(input:checked)]:!bg-[#FBF2F4]">
                  <MinistryMultiSelect
                    value={editMinistries}
                    onChange={handleMinistriesChange}
                    columns={1}
                  />
                  </div>

                  {!membershipTableAvailable && (
                    <div className="rounded-none bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-600/20">
                      Per-ministry records are shown in compatibility mode. Apply the
                      member_ministries migration before saving independent ministry
                      status or expiration changes.
                    </div>
                  )}

                  <div className="space-y-3">
                    {membershipDrafts.map((membership) => {
                      const expirationStatus = getExpirationStatus(
                        membership.expiration_date
                      );

                      return (
                        <div
                          key={membership.ministry}
                          className="rounded-none border border-[#E3D8DA] bg-[#FDFBFB] p-3 space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold">
                              {membership.ministry}
                            </p>
                            {expirationStatus === "expired" && (
                              <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
                                Expired
                              </span>
                            )}
                            {expirationStatus === "expiring_soon" && (
                              <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-800 ring-1 ring-inset ring-orange-600/20">
                                Expiring Soon
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <label className="text-xs text-muted-foreground">
                                Status
                              </label>
                              <select
                                value={membership.status}
                                onChange={(event) =>
                                  updateMembershipDraft(
                                    membership.ministry,
                                    "status",
                                    event.target.value as MemberStatus
                                  )
                                }
                                disabled={!membershipTableAvailable}
                                className="w-full rounded-none border border-[#DDD0D3] bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                              >
                                {STATUS_VALUES.map((value) => (
                                  <option key={value} value={value}>
                                    {value}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-xs text-muted-foreground">
                                Expiration Date
                              </label>
                              <input
                                type="date"
                                value={membership.expiration_date ?? ""}
                                onChange={(event) =>
                                  updateMembershipDraft(
                                    membership.ministry,
                                    "expiration_date",
                                    event.target.value
                                  )
                                }
                                disabled={!membershipTableAvailable}
                                className="w-full rounded-none border border-[#DDD0D3] bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-xs text-muted-foreground">
                                Start Date
                              </label>
                              <input
                                type="date"
                                value={membership.start_date ?? ""}
                                onChange={(event) =>
                                  updateMembershipDraft(
                                    membership.ministry,
                                    "start_date",
                                    event.target.value
                                  )
                                }
                                disabled={!membershipTableAvailable}
                                className="w-full rounded-none border border-[#DDD0D3] bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-xs text-muted-foreground">
                                Renewal Date
                              </label>
                              <input
                                type="date"
                                value={membership.renewal_date ?? ""}
                                onChange={(event) =>
                                  updateMembershipDraft(
                                    membership.ministry,
                                    "renewal_date",
                                    event.target.value
                                  )
                                }
                                disabled={!membershipTableAvailable}
                                className="w-full rounded-none border border-[#DDD0D3] bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full rounded-none border border-[#DDD0D3] bg-white px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                  />
                </div>

                <div className="flex justify-end pt-2 border-t border-border">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-none bg-[#890022] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#70001B] transition-colors disabled:opacity-60 shadow-sm"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Changes
                  </button>
                </div>
              </div>

              <div className="member-certificate-print-target" aria-hidden="true">
                <CertificateDesign
                  ref={certificateRef}
                  settings={certificateSettings}
                  data={{
                    firstName: member.first_name,
                    lastName: member.last_name,
                    parish: member.parish,
                    ministries: member.ministries,
                    uid: member.uid,
                    liturgicalYear: certificateSettings.liturgical_year,
                    verifyUrl: publicVerifyUrl,
                    selectedMinistry:
                      selectedMinistry ??
                      (member.ministries.length === 1
                        ? member.ministries[0]
                        : null),
                  }}
                  signatories={certificateSignatories}
                  className="member-certificate-print-canvas"
                />
              </div>

              {/* Print Certificate */}
              <div className="rounded-none border border-[#E3D8DA] border-t-2 border-t-[#890022] bg-white p-5  space-y-3">
                <h3 className="text-sm font-semibold text-[#211018] flex items-center gap-1.5">
                  <Printer className="h-4 w-4" />
                  UID Certificate
                </h3>
                {membershipDrafts.length > 1 && (
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">
                      Certificate ministry
                    </label>
                    <select
                      value={selectedMinistry ?? ""}
                      onChange={(event) => setSelectedMinistry(event.target.value)}
                      className="w-full rounded-none border border-[#DDD0D3] bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {membershipDrafts.map((membership) => (
                        <option key={membership.ministry} value={membership.ministry}>
                          {membership.ministry}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  disabled={!selectedCertificateEligible || printingCertificate}
                  className="inline-flex items-center gap-2 rounded-none bg-[#890022] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#70001B] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  onClick={() => {
                    if (member.uid && member.uid !== "PENDING") {
                      handlePrintCertificate();
                    }
                  }}
                  title={
                    selectedCertificateEligible
                      ? "Print UID certificate"
                      : "Certificate printing is unavailable for this ministry"
                  }
                >
                  <Printer className="h-4 w-4" />
                  {printingCertificate ? "Preparing Certificate..." : "Print UID Certificate"}
                </button>

                {!selectedCertificateEligible && selectedMembership && (
                  <p className="text-xs text-muted-foreground">
                    Printing is unavailable for {selectedMembership.ministry} because
                    its status or expiration does not currently qualify for a
                    certificate.
                  </p>
                )}
              </div>

              {/* Recommendation Letter */}
              <div className="rounded-none border border-[#E3D8DA] border-t-2 border-t-[#890022] bg-white p-5  space-y-3">
                <h3 className="text-sm font-semibold text-[#211018] flex items-center gap-1.5">
                  <FileText className="h-4 w-4" />
                  Recommendation Letter
                </h3>
                {membershipDrafts.length > 1 && (
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">
                      Membership this letter renews
                    </label>
                    <select
                      value={selectedMinistry ?? ""}
                      onChange={(event) => setSelectedMinistry(event.target.value)}
                      className="w-full rounded-none border border-[#DDD0D3] bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {membershipDrafts.map((membership) => (
                        <option key={membership.ministry} value={membership.ministry}>
                          {membership.ministry}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {!selectedMembership?.id && membershipTableAvailable && (
                  <div className="rounded-none bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-600/20">
                    Save this ministry assignment before uploading its recommendation letter.
                  </div>
                )}

                {selectedMembership?.document_url ? (
                  <div className="space-y-3">
                    {signedMembershipDocUrl ? (
                      <a
                        href={signedMembershipDocUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-none border border-border p-3 text-sm hover:bg-muted transition-colors"
                      >
                        <FileText className="h-4 w-4 text-primary shrink-0" />
                        <span className="flex-1 truncate">View uploaded scan (valid 1h)</span>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      </a>
                    ) : (
                      <div className="flex items-center gap-2 rounded-none border border-border p-3 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Generating secure link...</span>
                      </div>
                    )}
                    {selectedDocumentIsSharedBatch && (
                      <div className="rounded-none bg-sky-50 px-3 py-2.5 text-xs text-sky-800 ring-1 ring-inset ring-sky-600/20">
                        This recommendation letter belongs to a batch renewal and may
                        be shared by other memberships. Detaching it here will not
                        delete the stored batch file or its renewal history.
                      </div>
                    )}
                    <button
                      onClick={handleDeleteDocument}
                      className="inline-flex items-center gap-1.5 text-xs text-destructive hover:underline"
                    >
                      <Trash2 className="h-3 w-3" />{" "}
                      {selectedDocumentIsSharedBatch ? "Detach from membership" : "Remove document"}
                    </button>
                  </div>
                ) : (
                  <label className="block">
                    <div className={`rounded-none border-2 border-dashed p-6 text-center transition-colors cursor-pointer ${uploading ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}>
                      {uploading ? (
                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                      ) : (
                        <Upload className="mx-auto h-6 w-6 text-muted-foreground/60" />
                      )}
                      <p className="mt-2 text-xs text-muted-foreground">
                        Drop a scan or click to upload (renews membership)
                      </p>
                    </div>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      disabled={!selectedMembership?.id || !membershipTableAvailable}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUpload(f);
                      }}
                    />
                  </label>
                )}
                <p className="text-xs text-muted-foreground">
                  Uploading a new letter keeps the previous file intact in the
                  membership archive and renews the selected ministry for one year.
                </p>
              </div>

              {/* Archived Documents */}
              {(selectedMembership?.archived_documents?.length ?? 0) > 0 && (
                <div className="rounded-none border border-[#E3D8DA] border-t-2 border-t-[#890022] bg-white p-5  space-y-3">
                  <h3 className="text-sm font-semibold text-[#211018] flex items-center gap-1.5">
                    <Archive className="h-4 w-4" />
                    Archived Documents ({selectedMembership?.archived_documents.length ?? 0})
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    History for {selectedMembership?.ministry}.
                  </p>
                  <ul className="divide-y divide-border">
                    {(selectedMembership?.archived_documents ?? []).map((doc, i) => (
                      <li key={`${doc.document_url}-${doc.archived_at}-${i}`} className="py-2.5 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">
                            Letter #{(selectedMembership?.archived_documents.length ?? 0) - i}
                          </span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            Archived {new Date(doc.archived_at).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {doc.uploaded_at && (
                            <span>Uploaded: {new Date(doc.uploaded_at).toLocaleDateString()}</span>
                          )}
                          {doc.expiration_date && (
                            <span>Expired: {new Date(doc.expiration_date).toLocaleDateString()}</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Public Verification URL */}
              <div className="rounded-none border border-[#E3D8DA] border-t-2 border-t-[#890022] bg-white p-5  space-y-2">
                <h3 className="text-sm font-semibold text-[#211018] flex items-center gap-1.5">
                  <QrCode className="h-4 w-4" />
                  Public Verification URL
                </h3>
                <p className="text-xs text-muted-foreground">
                  Share this link or the QR code on the member&apos;s certificate.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={publicVerifyUrl}
                    className="min-w-0 flex-1 rounded-none border border-[#DDD0D3] bg-white px-2.5 py-1.5 text-xs font-mono"
                  />
                  <button
                    onClick={() => navigator.clipboard?.writeText(publicVerifyUrl)}
                    className="rounded-none border border-[#D9C9CD] bg-white px-2 py-1.5 text-xs text-[#890022] hover:bg-[#F6ECEE]"
                  >
                    Copy
                  </button>
                </div>
              </div>

              {/* Audit Trail */}
              <div className="rounded-none border border-[#E3D8DA] border-t-2 border-t-[#890022] bg-white p-5 ">
                <h3 className="text-sm font-semibold text-[#211018] flex items-center gap-1.5 mb-3">
                  <ScrollText className="h-4 w-4" />
                  Audit Trail (recent)
                </h3>
                {audits.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">No audit entries yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {audits.map((a) => {
                      const previousState =
                        (a.previous_state as Record<string, unknown> | null) ?? null;
                      const newState =
                        (a.new_state as Record<string, unknown> | null) ?? null;
                      const entityType =
                        newState?.entity_type ?? previousState?.entity_type;
                      const ministry =
                        (newState?.ministry ?? previousState?.ministry) as
                          | string
                          | undefined;

                      let summary = "Audit entry recorded.";

                      if (entityType === "member_ministry") {
                        if (a.admin_action === "Ministry Added") {
                          summary = `${ministry ?? "Ministry"} added with status ${
                            newState?.status ?? "Pending Verification"
                          }.`;
                        } else if (a.admin_action === "Ministry Removed") {
                          summary = `${ministry ?? "Ministry"} removed.`;
                        } else {
                          const changes: string[] = [];

                          if (previousState?.status !== newState?.status) {
                            changes.push(
                              `status ${previousState?.status ?? "—"} → ${
                                newState?.status ?? "—"
                              }`
                            );
                          }

                          if (
                            previousState?.expiration_date !==
                            newState?.expiration_date
                          ) {
                            changes.push(
                              `expiration ${
                                previousState?.expiration_date ?? "—"
                              } → ${newState?.expiration_date ?? "—"}`
                            );
                          }

                          if (
                            previousState?.renewal_date !== newState?.renewal_date
                          ) {
                            changes.push(
                              `renewal ${previousState?.renewal_date ?? "—"} → ${
                                newState?.renewal_date ?? "—"
                              }`
                            );
                          }

                          if (
                            previousState?.document_url !== newState?.document_url
                          ) {
                            changes.push(
                              newState?.document_url
                                ? "recommendation letter updated"
                                : "recommendation letter removed"
                            );
                          }

                          summary =
                            changes.length > 0
                              ? `${ministry ?? "Ministry"}: ${changes.join("; ")}`
                              : `${ministry ?? "Ministry"} updated.`;
                        }
                      } else if (!previousState) {
                        summary = "Initial creation";
                      } else {
                        summary = `Changed from ${
                          previousState.status ?? "—"
                        } to ${newState?.status ?? "—"}`;
                      }

                      return (
                        <li key={a.id} className="py-2.5 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{a.admin_action}</p>
                            <p className="text-xs text-muted-foreground">
                              {summary}
                            </p>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(a.timestamp).toLocaleString()}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
