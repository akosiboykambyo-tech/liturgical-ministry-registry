"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/status-badge";
import { STATUS_VALUES, getExpirationStatus, EXPIRING_SOON_DAYS } from "@/lib/constants";
import { MinistryMultiSelect } from "@/components/ministry-multi-select";
import type { Member, AuditLog, ArchivedDocument, MemberStatus } from "@/lib/types";
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
  ShieldCheck,
  AlertTriangle,
  ScrollText,
  CalendarClock,
  Archive,
  Printer,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  const [status, setStatus] = useState<MemberStatus>("Pending Verification");
  const [notes, setNotes] = useState("");
  const [expirationDate, setExpirationDate] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [signedDocUrl, setSignedDocUrl] = useState<string | null>(null);
  const [archivedDocs, setArchivedDocs] = useState<ArchivedDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!memberId) return;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("members")
      .select("*")
      .eq("id", memberId)
      .maybeSingle();
    if (error || !data) {
      setError("Member not found.");
      setLoading(false);
      return;
    }
    const m = data as Member;
    setMember(m);
    setEditMinistries(m.ministries);
    setStatus(m.status);
    setNotes(m.notes ?? "");
    setExpirationDate(m.expiration_date ?? "");
    setArchivedDocs(m.archived_documents ?? []);

    const { data: logs } = await supabase
      .from("audit_logs")
      .select("*")
      .eq("member_id", m.id)
      .order("timestamp", { ascending: false })
      .limit(10);
    setAudits((logs as AuditLog[]) ?? []);

    if (m.document_url) {
      const { data: signed } = await supabase.storage
        .from("member-documents")
        .createSignedUrl(m.document_url, 3600);
      setSignedDocUrl(signed?.signedUrl ?? null);
    } else {
      setSignedDocUrl(null);
    }
    setLoading(false);
  }, [memberId, supabase]);

  useEffect(() => {
    if (open && memberId) {
      load();
    }
  }, [open, memberId, load]);

  const expStatus = getExpirationStatus(member?.expiration_date ?? null);
  const isExpiredOrExpiring = expStatus === "expired" || expStatus === "expiring_soon";

  const handleSave = async () => {
    if (!member) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from("members")
      .update({
        ministries: editMinistries,
        status,
        notes: notes.trim() || null,
        expiration_date: expirationDate || null,
      })
      .eq("id", member.id);
    setSaving(false);
    if (error) {
      setError(error.message);
    } else {
      toast({ title: "Saved", description: "Member details updated." });
      load();
      onUpdated?.();
    }
  };

  const handleUpload = async (file: File) => {
    if (!member) return;
    setUploading(true);
    setError(null);
    const ext = file.name.split(".").pop();
    const path = `${member.id}/recommendation-letter.${ext}`;

    // Archive the previous document if one exists
    if (member.document_url) {
      const archivedEntry: ArchivedDocument = {
        document_url: member.document_url,
        uploaded_at: member.created_at,
        archived_at: new Date().toISOString(),
        expiration_date: member.expiration_date,
      };
      const newArchived = [...archivedDocs, archivedEntry];
      setArchivedDocs(newArchived);
      await supabase
        .from("members")
        .update({ archived_documents: newArchived })
        .eq("id", member.id);
    }

    const { error: upErr } = await supabase.storage
      .from("member-documents")
      .upload(path, file, { upsert: true });
    if (upErr) {
      setError(upErr.message);
      setUploading(false);
      return;
    }

    // Set new expiration date to one year from today if none set
    const defaultExp = new Date();
    defaultExp.setFullYear(defaultExp.getFullYear() + 1);
    const newExpDate = expirationDate || defaultExp.toISOString().slice(0, 10);

    await supabase
      .from("members")
      .update({
        document_url: path,
        expiration_date: newExpDate,
        status: "Renewed",
      })
      .eq("id", member.id);

    setUploading(false);
    toast({
      title: "Letter uploaded",
      description: "Previous letter archived. New expiration date set.",
    });
    load();
    onUpdated?.();
  };

  const handleDeleteDocument = async () => {
    if (!member?.document_url) return;
    await supabase.storage.from("member-documents").remove([member.document_url]);
    await supabase
      .from("members")
      .update({ document_url: null, expiration_date: null })
      .eq("id", member.id);
    load();
    onUpdated?.();
  };

  const publicVerifyUrl = member
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/verify?uid=${member.uid}`
    : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto scrollbar-thin p-0"
      >
        {loading ? (
          <div className="flex items-center justify-center h-full min-h-[400px]">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !member ? (
          <div className="flex items-center justify-center h-full min-h-[400px]">
            <p className="text-sm text-muted-foreground">Member not found.</p>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Header */}
            <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
              <SheetTitle className="text-xl font-bold tracking-tight">
                {member.first_name} {member.last_name}
              </SheetTitle>
              <SheetDescription className="flex items-center gap-2 flex-wrap">
                <span>{member.parish}</span>
                <span className="text-muted-foreground/50">·</span>
                <span>UID: <code className="text-xs">{member.uid}</code></span>
              </SheetDescription>
              <div className="pt-1">
                <StatusBadge
                  status={member.status}
                  expirationDate={member.expiration_date}
                />
              </div>
            </SheetHeader>

            {/* Body */}
            <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5 space-y-5">
              {error && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive ring-1 ring-inset ring-destructive/20">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Expiration warning */}
              {expStatus === "expired" && (
                <div className="flex items-start gap-2 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-600/20">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    This member&apos;s recommendation letter has expired. The
                    Print UID Certificate button is disabled until renewal.
                  </span>
                </div>
              )}
              {expStatus === "expiring_soon" && (
                <div className="flex items-start gap-2 rounded-md bg-orange-50 px-4 py-3 text-sm text-orange-800 ring-1 ring-inset ring-orange-600/20">
                  <CalendarClock className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    This member&apos;s letter expires within {EXPIRING_SOON_DAYS}{" "}
                    days (on {new Date(member.expiration_date!).toLocaleDateString()}).
                    Renew soon to keep the Print UID Certificate button enabled.
                  </span>
                </div>
              )}

              {/* Edit section */}
              <div className="rounded-lg border border-border bg-card p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-semibold">Member Details</h3>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as MemberStatus)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {STATUS_VALUES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">First Name</p>
                    <p className="text-sm font-medium">{member.first_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Last Name</p>
                    <p className="text-sm font-medium">{member.last_name}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Parish</p>
                    <p className="text-sm font-medium">{member.parish}</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Assigned Ministries</label>
                  <MinistryMultiSelect value={editMinistries} onChange={setEditMinistries} columns={1} />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                    Expiration Date
                  </label>
                  <input
                    type="date"
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground">
                    When the recommendation letter expires. Auto-set to one year
                    from upload if left blank.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                  />
                </div>

                <div className="flex justify-end pt-2 border-t border-border">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-sm"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Changes
                  </button>
                </div>
              </div>

              {/* Print Certificate */}
              <div className="rounded-lg border border-border bg-card p-5 shadow-sm space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <Printer className="h-4 w-4" />
                  UID Certificate
                </h3>
                <button
                  disabled={isExpiredOrExpiring}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  onClick={() => {
                    if (member.uid && member.uid !== "PENDING") {
                      window.open(`/verify?uid=${member.uid}&print=1`, "_blank");
                    }
                  }}
                  title={
                    isExpiredOrExpiring
                      ? "Certificate printing is disabled for expired or expiring members"
                      : "Print UID certificate"
                  }
                >
                  <Printer className="h-4 w-4" />
                  Print UID Certificate
                </button>
                {isExpiredOrExpiring && (
                  <p className="text-xs text-muted-foreground">
                    Printing is disabled because the member&apos;s letter is{" "}
                    {expStatus === "expired" ? "expired" : "expiring soon"}.
                    Upload a new recommendation letter to re-enable.
                  </p>
                )}
              </div>

              {/* Recommendation Letter */}
              <div className="rounded-lg border border-border bg-card p-5 shadow-sm space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <FileText className="h-4 w-4" />
                  Recommendation Letter
                </h3>
                {member.document_url ? (
                  <div className="space-y-3">
                    {signedDocUrl ? (
                      <a
                        href={signedDocUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-md border border-border p-3 text-sm hover:bg-muted transition-colors"
                      >
                        <FileText className="h-4 w-4 text-primary shrink-0" />
                        <span className="flex-1 truncate">View uploaded scan (valid 1h)</span>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      </a>
                    ) : (
                      <div className="flex items-center gap-2 rounded-md border border-border p-3 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Generating secure link...</span>
                      </div>
                    )}
                    <button
                      onClick={handleDeleteDocument}
                      className="inline-flex items-center gap-1.5 text-xs text-destructive hover:underline"
                    >
                      <Trash2 className="h-3 w-3" /> Remove document
                    </button>
                  </div>
                ) : (
                  <label className="block">
                    <div className={`rounded-md border-2 border-dashed p-6 text-center transition-colors cursor-pointer ${uploading ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}>
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
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUpload(f);
                      }}
                    />
                  </label>
                )}
                <p className="text-xs text-muted-foreground">
                  Uploading a new letter archives the previous one and resets the
                  expiration date.
                </p>
              </div>

              {/* Archived Documents */}
              {archivedDocs.length > 0 && (
                <div className="rounded-lg border border-border bg-muted/20 p-5 shadow-sm space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    <Archive className="h-4 w-4" />
                    Archived Documents ({archivedDocs.length})
                  </h3>
                  <ul className="divide-y divide-border">
                    {archivedDocs.map((doc, i) => (
                      <li key={i} className="py-2.5 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">
                            Letter #{archivedDocs.length - i}
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
              <div className="rounded-lg border border-border bg-card p-5 shadow-sm space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
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
                    className="flex-1 rounded-md border border-input bg-muted/30 px-2.5 py-1.5 text-xs font-mono"
                  />
                  <button
                    onClick={() => navigator.clipboard?.writeText(publicVerifyUrl)}
                    className="rounded-md border border-border px-2 py-1.5 text-xs hover:bg-muted"
                  >
                    Copy
                  </button>
                </div>
              </div>

              {/* Audit Trail */}
              <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
                  <ScrollText className="h-4 w-4" />
                  Audit Trail (recent)
                </h3>
                {audits.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">No audit entries yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {audits.map((a) => (
                      <li key={a.id} className="py-2.5 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{a.admin_action}</p>
                          <p className="text-xs text-muted-foreground">
                            {a.previous_state
                              ? `Changed from ${(a.previous_state as Record<string, unknown>).status ?? "—"} to ${(a.new_state as Record<string, unknown>).status ?? "—"}`
                              : "Initial creation"}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(a.timestamp).toLocaleString()}
                        </span>
                      </li>
                    ))}
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
