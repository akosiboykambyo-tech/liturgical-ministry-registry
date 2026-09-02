"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CertificateTemplateSettings, Signatory } from "@/lib/types";
import { FONT_OPTIONS, MINISTRIES } from "@/lib/constants";
import {
  Image as ImageIcon,
  Loader2,
  Save,
  Upload,
  Eye,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Star,
  Trash2,
  Plus,
  FileText,
  PenLine,
  Type,
  UserCog,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";
import { CertificateDesign } from "@/components/certificate-design";

type TemplateRow = {
  key: string;
  settings: CertificateTemplateSettings;
  is_default: boolean;
  updated_at: string;
};

const TEMPLATE_KEY_PREFIX = "certificate_template";

function templateLabel(key: string) {
  if (key === TEMPLATE_KEY_PREFIX) return "Default Template";
  const slug = key.slice(TEMPLATE_KEY_PREFIX.length + 1);
  return slug
    ? slug.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : key;
}

function nameToKey(name: string) {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${TEMPLATE_KEY_PREFIX}${slug ? `_${slug}` : ""}`;
}

const DEFAULTS: CertificateTemplateSettings = {
  template_url: null,
  name_x: 300,
  name_y: 320,
  parish_x: 300,
  parish_y: 400,
  ministry_x: 300,
  ministry_y: 460,
  year_x: 300,
  year_y: 540,
  qr_x: 560,
  qr_y: 720,
  qr_size: 120,
  liturgical_year: String(new Date().getFullYear()),
  font_family: "Georgia, serif",
  header_text: "Diocese of Navotas",
  body_text: "This is to certify that",
  footer_text: "has been duly commissioned as a liturgical minister",
};

type Tab = "layout" | "content" | "signatories";

export default function CertificateManagerPage() {
  const supabase = getSupabaseBrowserClient();
  const [settings, setSettings] = useState<CertificateTemplateSettings>(DEFAULTS);
  const [templateName, setTemplateName] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [setDefaultKey, setSetDefaultKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("layout");

  // Signatory state
  const [signatories, setSignatories] = useState<Signatory[]>([]);
  const [sigLoading, setSigLoading] = useState(true);
  const [sigSaving, setSigSaving] = useState(false);
  const [sigUploading, setSigUploading] = useState<string | null>(null);
  const [sigForm, setSigForm] = useState({
    name: "",
    title: "",
    display_type: "static" as "static" | "dynamic",
    ministry: "",
    position_x: 60,
    position_y: 720,
    width: 150,
    alignment: "left" as "left" | "center" | "right",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("system_settings")
      .select("*")
      .like("key", `${TEMPLATE_KEY_PREFIX}%`)
      .order("key");
    const rows: TemplateRow[] = (data ?? []).map((row) => ({
      key: row.key as string,
      settings: { ...DEFAULTS, ...(row.value as CertificateTemplateSettings) },
      is_default: Boolean(row.is_default),
      updated_at: (row.updated_at as string) ?? "",
    }));
    setTemplates(rows);
    const defaultRow = rows.find((r) => r.is_default) ?? rows[0];
    if (defaultRow) {
      setSettings(defaultRow.settings);
      setEditingKey(defaultRow.key);
      setTemplateName(templateLabel(defaultRow.key));
    } else {
      setSettings(DEFAULTS);
      setEditingKey(null);
      setTemplateName("");
    }
    setLoading(false);
  }, [supabase]);

  const loadSignatories = useCallback(async () => {
    setSigLoading(true);
    const { data } = await supabase
      .from("signatories")
      .select("*")
      .order("sort_order");
    setSignatories((data as Signatory[]) ?? []);
    setSigLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
    loadSignatories();
  }, [load, loadSignatories]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    const ext = file.name.split(".").pop();
    const path = `template-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("certificate-templates")
      .upload(path, file, { upsert: true });
    if (upErr) {
      setError(upErr.message);
      setUploading(false);
      return;
    }
    const { data: pub } = supabase.storage
      .from("certificate-templates")
      .getPublicUrl(path);
    setSettings((s) => ({ ...s, template_url: pub.publicUrl }));
    setUploading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const key = editingKey ?? nameToKey(templateName || "Default Template");
    const { error } = await supabase
      .from("system_settings")
      .upsert({
        key,
        value: settings as unknown as Record<string, unknown>,
        is_default: templates.find((t) => t.key === key)?.is_default ?? templates.length === 0,
      });
    setSaving(false);
    if (error) {
      setError(error.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      await load();
    }
  };

  const handleSetDefault = async (key: string) => {
    setSetDefaultKey(key);
    setError(null);
    const { error } = await supabase.rpc("set_default_certificate_template", {
      p_key: key,
    });
    setSetDefaultKey(null);
    if (error) {
      setError(error.message);
    } else {
      await load();
    }
  };

  const handleDelete = async (key: string) => {
    setDeletingKey(key);
    setError(null);
    const { error } = await supabase
      .from("system_settings")
      .delete()
      .eq("key", key);
    setDeletingKey(null);
    if (error) {
      setError(error.message);
    } else {
      if (editingKey === key) {
        setEditingKey(null);
        setTemplateName("");
        setSettings(DEFAULTS);
      }
      await load();
    }
  };

  const handleEdit = (row: TemplateRow) => {
    setEditingKey(row.key);
    setTemplateName(templateLabel(row.key));
    setSettings(row.settings);
    setSaved(false);
    setError(null);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleNew = () => {
    setEditingKey(null);
    setTemplateName("");
    setSettings(DEFAULTS);
    setSaved(false);
    setError(null);
  };

  const updateField = (key: keyof CertificateTemplateSettings, value: number | string) => {
    setSettings((s) => ({ ...s, [key]: value }));
  };

  // Signatory handlers
  const handleSigUpload = async (file: File) => {
    setSigUploading("new");
    const ext = file.name.split(".").pop();
    const path = `signatures-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("certificate-templates")
      .upload(path, file, { upsert: true });
    if (upErr) {
      setError(upErr.message);
      setSigUploading(null);
      return;
    }
    const { data: pub } = supabase.storage
      .from("certificate-templates")
      .getPublicUrl(path);
    setSigForm((f) => ({ ...f }));
    setSigUploading(null);
    // Store URL temporarily in a ref-like variable
    sigUploadUrlRef.current = pub.publicUrl;
  };
  const sigUploadUrlRef = useRef<string | null>(null);

  const handleSigSave = async () => {
    if (!sigForm.name.trim()) {
      setError("Signatory name is required.");
      return;
    }
    setSigSaving(true);
    setError(null);
    const { error } = await supabase.from("signatories").insert({
      name: sigForm.name.trim(),
      title: sigForm.title.trim(),
      signature_url: sigUploadUrlRef.current,
      display_type: sigForm.display_type,
      ministry: sigForm.display_type === "dynamic" ? sigForm.ministry || null : null,
      position_x: sigForm.position_x,
      position_y: sigForm.position_y,
      width: sigForm.width,
      alignment: sigForm.alignment,
      is_active: true,
      sort_order: signatories.length,
    });
    setSigSaving(false);
    if (error) {
      setError(error.message);
    } else {
      sigUploadUrlRef.current = null;
      setSigForm({
        name: "",
        title: "",
        display_type: "static",
        ministry: "",
        position_x: 60,
        position_y: 720,
        width: 150,
        alignment: "left",
      });
      await loadSignatories();
    }
  };

  const handleSigToggle = async (sig: Signatory) => {
    await supabase
      .from("signatories")
      .update({ is_active: !sig.is_active })
      .eq("id", sig.id);
    await loadSignatories();
  };

  const handleSigDelete = async (id: string) => {
    await supabase.from("signatories").delete().eq("id", id);
    await loadSignatories();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ImageIcon className="h-6 w-6 text-primary" />
          Certificate Template Manager
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Customize certificate text, fonts, layout, and signatories. The
          default template is used for public certificate rendering.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive ring-1 ring-inset ring-destructive/20">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {saved && (
        <div className="flex items-start gap-2 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-600/20">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Template settings saved.</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-sm">
        {([
          { id: "layout" as const, label: "Layout & Background", icon: ImageIcon },
          { id: "content" as const, label: "Text Content & Fonts", icon: Type },
          { id: "signatories" as const, label: "Signatories", icon: UserCog },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: controls */}
        <div className="space-y-6">
          {activeTab === "layout" && (
            <>
              <div className="rounded-lg border border-border bg-card p-5 shadow-sm space-y-4">
                <h2 className="text-sm font-semibold">Background Image</h2>
                {settings.template_url ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={settings.template_url}
                      alt="template"
                      className="h-16 w-24 rounded border border-border object-cover"
                    />
                    <label className="cursor-pointer">
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                        <Upload className="h-3.5 w-3.5" /> Replace
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUpload(f);
                        }}
                      />
                    </label>
                    <button
                      onClick={() => setSettings((s) => ({ ...s, template_url: null }))}
                      className="text-xs text-destructive hover:underline"
                    >
                      Remove (use default placeholder)
                    </button>
                  </div>
                ) : (
                  <label className="block">
                    <div className={`rounded-md border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${uploading ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}>
                      {uploading ? (
                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                      ) : (
                        <Upload className="mx-auto h-6 w-6 text-muted-foreground/60" />
                      )}
                      <p className="mt-2 text-xs text-muted-foreground">
                        Upload JPEG/PNG template
                      </p>
                    </div>
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUpload(f);
                      }}
                    />
                  </label>
                )}
              </div>

              <div className="rounded-lg border border-border bg-card p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Overlay Layout (600x850 canvas)</h2>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleNew}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="h-3 w-3" /> New
                    </button>
                    <button
                      onClick={() => setSettings(DEFAULTS)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <RefreshCw className="h-3 w-3" /> Reset fields
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Template name</label>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g. Advent, Easter, Standard"
                    className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {editingKey
                      ? `Editing saved template "${templateLabel(editingKey)}".`
                      : "New template -- give it a name before saving."}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <NumberField label="Name X" value={settings.name_x} onChange={(v) => updateField("name_x", v)} />
                  <NumberField label="Name Y" value={settings.name_y} onChange={(v) => updateField("name_y", v)} />
                  <NumberField label="Parish X" value={settings.parish_x} onChange={(v) => updateField("parish_x", v)} />
                  <NumberField label="Parish Y" value={settings.parish_y} onChange={(v) => updateField("parish_y", v)} />
                  <NumberField label="Ministry X" value={settings.ministry_x} onChange={(v) => updateField("ministry_x", v)} />
                  <NumberField label="Ministry Y" value={settings.ministry_y} onChange={(v) => updateField("ministry_y", v)} />
                  <NumberField label="Year X" value={settings.year_x} onChange={(v) => updateField("year_x", v)} />
                  <NumberField label="Year Y" value={settings.year_y} onChange={(v) => updateField("year_y", v)} />
                  <NumberField label="QR X" value={settings.qr_x} onChange={(v) => updateField("qr_x", v)} />
                  <NumberField label="QR Y" value={settings.qr_y} onChange={(v) => updateField("qr_y", v)} />
                  <NumberField label="QR Size" value={settings.qr_size} onChange={(v) => updateField("qr_size", v)} />
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Liturgical Year</label>
                    <input
                      type="text"
                      value={settings.liturgical_year}
                      onChange={(e) => updateField("liturgical_year", e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-border">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-sm"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Template Settings
                  </button>
                </div>
              </div>
            </>
          )}

          {activeTab === "content" && (
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm space-y-4">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <Type className="h-4 w-4" />
                Certificate Text Content & Font
              </h2>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Font Family</label>
                <select
                  value={settings.font_family}
                  onChange={(e) => updateField("font_family", e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Applied to all text on the certificate (header, body, name, ministry, footer).
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Header Text</label>
                <input
                  type="text"
                  value={settings.header_text}
                  onChange={(e) => updateField("header_text", e.target.value)}
                  placeholder="e.g. Diocese of Navotas"
                  className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <p className="text-[11px] text-muted-foreground">Large title at the top of the certificate.</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Body Text</label>
                <textarea
                  value={settings.body_text}
                  onChange={(e) => updateField("body_text", e.target.value)}
                  placeholder="e.g. This is to certify that"
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                />
                <p className="text-[11px] text-muted-foreground">Introductory line above the member&apos;s name.</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Footer Text</label>
                <textarea
                  value={settings.footer_text}
                  onChange={(e) => updateField("footer_text", e.target.value)}
                  placeholder="e.g. has been duly commissioned as a liturgical minister"
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                />
                <p className="text-[11px] text-muted-foreground">Closing line below the ministry field.</p>
              </div>

              <div className="flex justify-end pt-2 border-t border-border">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-sm"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Template Settings
                </button>
              </div>
            </div>
          )}

          {activeTab === "signatories" && (
            <div className="space-y-4">
              {/* Add signatory form */}
              <div className="rounded-lg border border-border bg-card p-5 shadow-sm space-y-4">
                <h2 className="text-sm font-semibold flex items-center gap-1.5">
                  <PenLine className="h-4 w-4" />
                  Add Signatory
                </h2>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Name</label>
                    <input
                      type="text"
                      value={sigForm.name}
                      onChange={(e) => setSigForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Rev. Fr. Juan Dela Cruz"
                      className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Title</label>
                    <input
                      type="text"
                      value={sigForm.title}
                      onChange={(e) => setSigForm((f) => ({ ...f, title: e.target.value }))}
                      placeholder="e.g. Parish Priest"
                      className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Display Type</label>
                    <select
                      value={sigForm.display_type}
                      onChange={(e) => setSigForm((f) => ({ ...f, display_type: e.target.value as "static" | "dynamic" }))}
                      className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="static">Static (all certificates)</option>
                      <option value="dynamic">Dynamic (ministry-specific)</option>
                    </select>
                  </div>
                  {sigForm.display_type === "dynamic" && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Ministry</label>
                      <select
                        value={sigForm.ministry}
                        onChange={(e) => setSigForm((f) => ({ ...f, ministry: e.target.value }))}
                        className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">Select ministry...</option>
                        {MINISTRIES.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <NumberField label="Position X" value={sigForm.position_x} onChange={(v) => setSigForm((f) => ({ ...f, position_x: v }))} />
                  <NumberField label="Position Y" value={sigForm.position_y} onChange={(v) => setSigForm((f) => ({ ...f, position_y: v }))} />
                  <NumberField label="Width" value={sigForm.width} onChange={(v) => setSigForm((f) => ({ ...f, width: v }))} />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Alignment</label>
                  <div className="inline-flex rounded-md border border-border overflow-hidden">
                    {([
                      { val: "left", icon: AlignLeft, label: "Left" },
                      { val: "center", icon: AlignCenter, label: "Center" },
                      { val: "right", icon: AlignRight, label: "Right" },
                    ] as const).map(({ val, icon: Icon, label }) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setSigForm((f) => ({ ...f, alignment: val }))}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          sigForm.alignment === val
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground hover:bg-muted"
                        }`}
                        title={`${label} align`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Signature Image (optional)</label>
                  <label className="cursor-pointer">
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                      {sigUploading === "new" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      {sigUploadUrlRef.current ? "Replace signature" : "Upload signature"}
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleSigUpload(f);
                      }}
                    />
                  </label>
                  {sigUploadUrlRef.current && (
                    <p className="text-[11px] text-emerald-600 mt-1">Signature image uploaded.</p>
                  )}
                </div>

                <div className="flex justify-end pt-2 border-t border-border">
                  <button
                    onClick={handleSigSave}
                    disabled={sigSaving}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-sm"
                  >
                    {sigSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add Signatory
                  </button>
                </div>
              </div>

              {/* Existing signatories list */}
              <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-border">
                  <h2 className="text-sm font-semibold">Configured Signatories</h2>
                </div>
                {sigLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : signatories.length === 0 ? (
                  <div className="px-5 py-8 text-center">
                    <p className="text-sm text-muted-foreground">No signatories configured yet.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {signatories.map((sig) => (
                      <div key={sig.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{sig.name}</p>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                              sig.display_type === "static"
                                ? "bg-blue-50 text-blue-700 ring-blue-600/20"
                                : "bg-amber-50 text-amber-700 ring-amber-600/20"
                            }`}>
                              {sig.display_type === "static" ? "Static" : sig.ministry}
                            </span>
                            {!sig.is_active && (
                              <span className="text-[11px] text-muted-foreground">(inactive)</span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            {sig.title} {sig.signature_url ? "· Has signature image" : "· No image"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleSigToggle(sig)}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            {sig.is_active ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            onClick={() => handleSigDelete(sig.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs text-destructive hover:bg-destructive/5 transition-colors"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: live preview */}
        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
            <Eye className="h-4 w-4" />
            Live Preview
          </h2>
          <div className="flex justify-center bg-muted/30 rounded-md p-4 overflow-auto">
            <div
              className="relative shadow-sm rounded-md overflow-hidden"
              style={{ width: "100%", maxWidth: 600, aspectRatio: "600 / 850" }}
            >
              {settings.template_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={settings.template_url}
                  alt="Certificate background"
                  className="absolute inset-0 w-full h-full object-fill"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-b from-amber-50 to-amber-100 border-2 border-amber-700/30" />
              )}

              {/* Saved active signatories */}
              {signatories
                .filter((s) => s.is_active)
                .map((sig) => {
                  const leftPct = (sig.position_x / 600) * 100;
                  const topPct = (sig.position_y / 850) * 100;
                  const widthPct = (sig.width / 600) * 100;
                  return (
                    <div
                      key={sig.id}
                      className="absolute"
                      style={{
                        left: `${leftPct}%`,
                        top: `${topPct}%`,
                        width: `${widthPct}%`,
                        textAlign: sig.alignment ?? "left",
                      }}
                    >
                      {sig.signature_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={sig.signature_url}
                          alt="Signature"
                          className="mb-1 max-w-full h-auto"
                          style={{ width: "100%" }}
                        />
                      )}
                      <div className="font-bold text-[11px] text-slate-900 leading-tight" style={{ fontFamily: "Georgia, serif" }}>
                        {sig.name}
                      </div>
                      <div className="text-[9px] text-zinc-500 leading-tight" style={{ fontFamily: "Georgia, serif" }}>
                        {sig.title}
                      </div>
                    </div>
                  );
                })}

              {/* In-progress form preview (dashed outline) */}
              {(sigForm.name || sigForm.title) && (
                <div
                  className="absolute border border-dashed border-primary/50 rounded-sm pointer-events-none"
                  style={{
                    left: `${(sigForm.position_x / 600) * 100}%`,
                    top: `${(sigForm.position_y / 850) * 100}%`,
                    width: `${(sigForm.width / 600) * 100}%`,
                    textAlign: sigForm.alignment,
                  }}
                >
                  <div className="font-bold text-[11px] text-slate-900 leading-tight" style={{ fontFamily: "Georgia, serif" }}>
                    {sigForm.name || "Signatory Name"}
                  </div>
                  <div className="text-[9px] text-zinc-500 leading-tight" style={{ fontFamily: "Georgia, serif" }}>
                    {sigForm.title || "Title"}
                  </div>
                </div>
              )}
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            The public certificate download uses the layout of the template
            marked as the default. Signatories appear based on their display
            type and the selected ministry. The dashed outline shows the
            signatory being edited.
          </p>
        </div>
      </div>

      {/* Saved templates list */}
      <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Saved Templates</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              The default template is used for public certificate rendering.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">{templates.length} saved</span>
        </div>

        {templates.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm font-medium">No saved templates yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Configure the layout above and click Save Template to create one.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {templates.map((row) => {
              const isDefault = row.is_default;
              const isEditing = editingKey === row.key;
              return (
                <div
                  key={row.key}
                  className={`flex items-center justify-between gap-3 px-5 py-3.5 ${
                    isEditing ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <p className="text-sm font-medium truncate">
                        {templateLabel(row.key)}
                      </p>
                      {isDefault && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                          <Star className="h-3 w-3" /> Default
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {row.settings.template_url ? "Custom background" : "No background image"} ·
                      {" "}Liturgical year {row.settings.liturgical_year} ·
                      {" "}Font: {row.settings.font_family?.split(",")[0] || "Georgia"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleEdit(row)}
                      className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted/50 transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => handleSetDefault(row.key)}
                      disabled={isDefault || setDefaultKey !== null}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {setDefaultKey === row.key ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Star className="h-3.5 w-3.5" />
                      )}
                      Set as Default
                    </button>
                    <button
                      onClick={() => handleDelete(row.key)}
                      disabled={deletingKey !== null || isDefault}
                      title={isDefault ? "Cannot delete the default template" : "Delete template"}
                      className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {deletingKey === row.key ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}
