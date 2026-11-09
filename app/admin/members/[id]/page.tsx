"use client";

import { ebGaramond } from "@/app/fonts";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { updateMemberStatus } from "@/lib/verify-actions";
import { StatusBadge } from "@/components/status-badge";
import { MINISTRIES, STATUS_VALUES } from "@/lib/constants";
import { MinistryMultiSelect } from "@/components/ministry-multi-select";
import { Member, AuditLog, MemberStatus } from "@/lib/types";
import {
  ArrowLeft,
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
  Pencil,
} from "@/components/phosphor-icons";

export default function MemberDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [returnReview, setReturnReview] = useState<string | null>(null);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("returnTo") === "renewal-reviews") {
      const id = query.get("case");
      if (id && /^[0-9a-f-]{36}$/i.test(id)) setReturnReview(id);
    }
  }, []);
  const backHref = returnReview ? `/admin/renewal-reviews?case=${encodeURIComponent(returnReview)}` : "/admin/members";
  const backText = returnReview ? "Back to Renewal Review Queue" : "Back to members";
  const supabase = getSupabaseBrowserClient();
  const [member, setMember] = useState<Member | null>(null);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMinistries, setEditMinistries] = useState<string[]>([]);
  const [status, setStatus] = useState<MemberStatus>("Pending Verification");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [signedDocUrl, setSignedDocUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editingName, setEditingName] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("members")
      .select("*")
      .eq("id", params.id)
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
    setEditFirstName(m.first_name);
    setEditLastName(m.last_name);
    setEditingName(false);
    const { data: logs } = await supabase
      .from("audit_logs")
      .select("*")
      .eq("member_id", m.id)
      .order("timestamp", { ascending: false })
      .limit(10);
    setAudits((logs as AuditLog[]) ?? []);

    // Generate a short-lived signed URL for the (private) recommendation letter.
    if (m.document_url) {
      const { data: signed } = await supabase.storage
        .from("member-documents")
        .createSignedUrl(m.document_url, 3600);
      setSignedDocUrl(signed?.signedUrl ?? null);
    } else {
      setSignedDocUrl(null);
    }
    setLoading(false);
  }, [params.id, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!member) return;

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
        status,
        notes: notes.trim() || null,
      })
      .eq("id", member.id);

    setSaving(false);

    if (error) {
      setError(error.message);
    } else {
      setEditingName(false);
      setShowSavedToast(true);
      setTimeout(() => setShowSavedToast(false), 2500);
      load();
    }
  };

  const cancelNameEdit = () => {
    if (!member) return;
    setEditFirstName(member.first_name);
    setEditLastName(member.last_name);
    setEditingName(false);
  };

  const handleUpload = async (file: File) => {
    if (!member) return;
    setUploading(true);
    setError(null);
    const ext = file.name.split(".").pop();
    const path = `${member.id}/recommendation-letter.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("member-documents")
      .upload(path, file, { upsert: true });
    if (upErr) {
      setError(upErr.message);
      setUploading(false);
      return;
    }
    // Store the storage PATH (not a URL) so the private bucket is never
    // fetchable via a guessed public path. Access goes through signed URLs.
    await supabase
      .from("members")
      .update({ document_url: path })
      .eq("id", member.id);
    setUploading(false);
    setSuccess("Recommendation letter uploaded and linked.");
    setTimeout(() => setSuccess(null), 3000);
    load();
  };

  const handleDeleteDocument = async () => {
    if (!member?.document_url) return;
    await supabase.storage.from("member-documents").remove([member.document_url]);
    await supabase
      .from("members")
      .update({ document_url: null })
      .eq("id", member.id);
    load();
  };

  const publicVerifyUrl = member
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/verify?uid=${member.uid}`
    : "";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!member) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-muted-foreground">Member not found.</p>
        <Link href={backHref} className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> {backText}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-[#1E1114]">
      {showSavedToast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-none bg-emerald-600 px-4 py-3 text-sm text-white shadow-lg">
          <ShieldCheck className="h-4 w-4" /> Saved
        </div>
      )}

      <div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to members
        </Link>
        <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className={`${ebGaramond.className} text-[42px] font-medium leading-none text-[#1E1114] sm:text-[48px]`}>
              {member.first_name} {member.last_name}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {member.parish} · UID: <code>{member.uid}</code>
            </p>
          </div>
          <StatusBadge status={member.status} />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-none bg-destructive/10 px-4 py-3 text-sm text-destructive ring-1 ring-inset ring-destructive/20">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 rounded-none bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-600/20">
          <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Edit */}
        <div className="lg:col-span-2 rounded-none border border-[#E6DADC] border-t-[3px] border-t-[#890022] bg-white p-6 space-y-5">
          <h2 className="text-sm font-semibold">Member Details</h2>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as MemberStatus)}
              className="w-full rounded-none border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {STATUS_VALUES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-muted-foreground">
                Member Name
              </p>
              {!editingName ? (
                <button
                  type="button"
                  onClick={() => setEditingName(true)}
                  className="inline-flex items-center gap-1.5 rounded-none border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit Name
                </button>
              ) : (
                <button
                  type="button"
                  onClick={cancelNameEdit}
                  disabled={saving}
                  className="rounded-none border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Cancel
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="member-first-name"
                  className="text-xs text-muted-foreground"
                >
                  First Name
                </label>
                {editingName ? (
                  <input
                    id="member-first-name"
                    value={editFirstName}
                    onChange={(e) => setEditFirstName(e.target.value)}
                    autoComplete="given-name"
                    className="mt-1 w-full rounded-none border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                ) : (
                  <p className="text-sm font-medium mt-1">
                    {member.first_name}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="member-last-name"
                  className="text-xs text-muted-foreground"
                >
                  Last Name
                </label>
                {editingName ? (
                  <input
                    id="member-last-name"
                    value={editLastName}
                    onChange={(e) => setEditLastName(e.target.value)}
                    autoComplete="family-name"
                    className="mt-1 w-full rounded-none border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                ) : (
                  <p className="text-sm font-medium mt-1">
                    {member.last_name}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Parish</p>
            <p className="text-sm font-medium mt-1">{member.parish}</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Assigned Ministries</label>
            <MinistryMultiSelect value={editMinistries} onChange={setEditMinistries} columns={1} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-none border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>

          <div className="flex justify-end pt-2 border-t border-border">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-none bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60 "
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Changes
            </button>
          </div>
        </div>

        {/* Document upload + public link */}
        <div className="space-y-6">
          <div className="rounded-none border border-[#E6DADC] border-t-[3px] border-t-[#890022] bg-white p-5 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <FileText className="h-4 w-4" />
              Recommendation Letter
            </h2>
            {member.document_url ? (
              <div className="space-y-3">
                {signedDocUrl ? (
                  <a
                    href={signedDocUrl}
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
                    <span>Generating secure link…</span>
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
                <div className={`rounded-none border-2 border-dashed p-6 text-center transition-colors cursor-pointer ${uploading ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}>
                  {uploading ? (
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                  ) : (
                    <Upload className="mx-auto h-6 w-6 text-muted-foreground/60" />
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Drop a scan or click to upload
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
              Uploads are stored in the secure member-documents bucket.
            </p>
          </div>

          <div className="rounded-none border border-[#E6DADC] border-t-[3px] border-t-[#890022] bg-white p-5 space-y-2">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <QrCode className="h-4 w-4" />
              Public Verification URL
            </h2>
            <p className="text-xs text-muted-foreground">
              Share this link or the QR code on the member&apos;s certificate.
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={publicVerifyUrl}
                className="flex-1 rounded-none border border-input bg-muted/30 px-2.5 py-1.5 text-xs font-mono"
              />
              <button
                onClick={() => navigator.clipboard?.writeText(publicVerifyUrl)}
                className="rounded-none border border-border px-2 py-1.5 text-xs hover:bg-muted"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Audit trail */}
      <div className="rounded-none border border-[#E6DADC] border-t-[3px] border-t-[#890022] bg-white p-5 ">
        <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
          <ScrollText className="h-4 w-4" />
          Audit Trail (recent)
        </h2>
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
  );
}
