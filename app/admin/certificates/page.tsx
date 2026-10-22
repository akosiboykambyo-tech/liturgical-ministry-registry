"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CertificateTemplateSettings, Signatory } from "@/lib/types";
import {
  CERTIFICATE_FONT_PAIRINGS,
  DEFAULT_TEMPLATE_SETTINGS,
  FONT_OPTIONS,
  MINISTRIES,
} from "@/lib/constants";
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
  UserCog,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";
import { CertificateDesign } from "@/components/certificate-design";
import { CertificateEditor } from "@/components/certificate-editor";
import { ebGaramond } from "@/app/fonts";

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

const DEFAULTS = DEFAULT_TEMPLATE_SETTINGS;
  type Tab = "layout" | "signatories";

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
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  const [backgroundDimensions, setBackgroundDimensions] = useState<{ width: number; height: number } | null>(null);
  const [backgroundDimensionsUnavailable, setBackgroundDimensionsUnavailable] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");

    const updateDesktopState = () => {
      setIsDesktop(mediaQuery.matches);
    };

    updateDesktopState();
    mediaQuery.addEventListener("change", updateDesktopState);

    return () => {
      mediaQuery.removeEventListener("change", updateDesktopState);
    };
  }, []);

  useEffect(() => {
    const url = settings.template_url;
    setBackgroundDimensions(null);
    setBackgroundDimensionsUnavailable(false);
    if (!url) return;
    let cancelled = false;
    const image = new window.Image();
    image.onload = () => {
      if (cancelled) return;
      if (image.naturalWidth && image.naturalHeight) {
        setBackgroundDimensions({ width: image.naturalWidth, height: image.naturalHeight });
      } else {
        setBackgroundDimensionsUnavailable(true);
      }
    };
    image.onerror = () => {
      if (!cancelled) setBackgroundDimensionsUnavailable(true);
    };
    image.src = url;
    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [settings.template_url]);

  const targetAspectRatio = (settings.canvas_width || 600) / (settings.canvas_height || 850);
  const backgroundAspectRatio = backgroundDimensions
    ? backgroundDimensions.width / backgroundDimensions.height
    : null;
  const backgroundAspectMismatch = backgroundAspectRatio !== null &&
    Math.abs(backgroundAspectRatio / targetAspectRatio - 1) > 0.04;

  // Signatory state
  const [signatories, setSignatories] = useState<Signatory[]>([]);
  const [sigLoading, setSigLoading] = useState(true);
  const [sigSaving, setSigSaving] = useState(false);
  const [sigUploading, setSigUploading] = useState<string | null>(null);
  const [sigUploadUrl, setSigUploadUrl] = useState<string | null>(null);
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

  const updatePageLayout = (paperSize: "a4" | "letter", orientation: "portrait" | "landscape") => {
    // Keep existing portrait A4 dimensions and element coordinates unchanged.
    const portraitWidth = 600;
    const portraitHeight = paperSize === "a4" ? 850 : 776;
    setSettings((current) => ({
      ...current,
      paper_size: paperSize,
      orientation,
      canvas_width: orientation === "portrait" ? portraitWidth : portraitHeight,
      canvas_height: orientation === "portrait" ? portraitHeight : portraitWidth,
    }));
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

  const { error } = await supabase
    .from("system_settings")
    .update({ is_default: false })
    .like("key", "certificate_template%");

  if (!error) {
    const { error: setErrorResult } = await supabase
      .from("system_settings")
      .update({ is_default: true })
      .eq("key", key);

    if (setErrorResult) {
      setError(setErrorResult.message);
    }
  } else {
    setError(error.message);
  }

  setSetDefaultKey(null);

  if (!error) {
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

  const applyFontPairing = (pairingId: string) => {
  const pairing = CERTIFICATE_FONT_PAIRINGS.find(
    (item) => item.id === pairingId
  );

  if (!pairing) return;

  setSettings((current) => ({
    ...current,
    font_family: pairing.body,
    elements: current.elements.map((element) => {
      switch (element.type) {
        case "text":
          return {
            ...element,
            font_family: pairing.body,
          };

        case "member_name":
          return {
            ...element,
            font_family: pairing.recipient,
          };

        case "parish":
        case "ministry":
          return {
            ...element,
            font_family: pairing.supporting,
          };

        case "liturgical_year":
          return {
            ...element,
            font_family: pairing.heading,
          };

        case "signatory":
          return {
            ...element,
            font_family: pairing.signatory,
          };

        case "uid":
          return {
            ...element,
            font_family: pairing.supporting,
          };

        default:
          return element;
      }
    }),
  }));
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
    setSigUploadUrl(pub.publicUrl);
    setSigUploading(null);
  };

  const handleSigSave = async () => {
    if (!sigForm.name.trim()) {
      setError("Signatory name is required.");
      return;
    }

    if (sigForm.display_type === "dynamic" && !sigForm.ministry) {
      setError("Please select a ministry for a dynamic signatory.");
      return;
    }

    setSigSaving(true);
    setError(null);
    const { error } = await supabase.from("signatories").insert({
      name: sigForm.name.trim(),
      title: sigForm.title.trim(),
      signature_url: sigUploadUrl,
      display_type: sigForm.display_type,
      ministry: sigForm.display_type === "dynamic" ? sigForm.ministry : null,
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
      setSigUploadUrl(null);
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
        <Loader2 className="h-6 w-6 animate-spin text-[#890022]" />
      </div>
    );
  }

  if (isDesktop === false) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-none border border-[#E5DDDF] border-t-[3px] border-t-[#890022] bg-white p-8 text-center ">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-none bg-[#890022]/10 text-[#890022]">
            <ImageIcon className="h-6 w-6" />
          </div>

          <h1 className={`${ebGaramond.className} mt-5 text-[34px] font-medium leading-none text-[#1E1114]`}>
            Certificate Template Manager
          </h1>

          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            This editor is designed for desktop computers. The certificate
            canvas requires a larger screen for precise positioning, resizing,
            and template design.
          </p>

          <p className="mt-3 text-sm font-medium text-foreground">
            Please open the Certificate Template Manager on a desktop PC or
            larger screen.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 text-[#1E1114]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className={`${ebGaramond.className} text-[42px] font-medium leading-none text-[#1E1114] sm:text-[48px]`}>
            Certificate Template Manager
          </h1>
          <p className="mt-2 text-sm text-[#66565A]">
            Customize certificate text, fonts, layout, and signatories. The
            default template is used for public certificate rendering.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-none bg-[#890022] px-4 py-2.5 text-sm font-semibold text-white  transition-colors hover:bg-[#75001D] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Template
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-none bg-destructive/10 px-4 py-3 text-sm text-destructive ring-1 ring-inset ring-destructive/20">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {saved && (
        <div className="flex items-start gap-2 rounded-none border border-[#C9B8BE] bg-[#F5F0F1] px-4 py-3 text-sm text-[#52212F]">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Template settings saved.</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-none border border-[#E5DDDF] border-t-[3px] border-t-[#890022] bg-white p-1 ">
        {([
          { id: "layout" as const, label: "Certificate Design", icon: ImageIcon },
          { id: "signatories" as const, label: "Signatories", icon: UserCog },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`inline-flex items-center gap-1.5 rounded-none px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-[#890022] text-white"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div
  className={
    activeTab === "layout"
      ? "grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-6"
      : "grid grid-cols-1 gap-6"
  }
>
        {/* Left: controls */}
        <div className="space-y-6">
          {activeTab === "layout" && (
            <>
              <div className="rounded-none border border-[#E5DDDF] border-t-[3px] border-t-[#890022] bg-white p-5 space-y-3">
                <h2 className="text-sm font-semibold tracking-tight text-[#27232A]">Page Layout</h2>
                <label className="block text-xs font-medium text-muted-foreground" htmlFor="certificate-paper-size">Paper size</label>
                <select
                  id="certificate-paper-size"
                  value={settings.paper_size ?? "a4"}
                  onChange={(event) => updatePageLayout(event.target.value as "a4" | "letter", settings.orientation ?? "portrait")}
                  className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
                >
                  <option value="a4">A4</option>
                  <option value="letter">Letter</option>
                </select>
                <label className="block text-xs font-medium text-muted-foreground" htmlFor="certificate-orientation">Orientation</label>
                <select
                  id="certificate-orientation"
                  value={settings.orientation ?? "portrait"}
                  onChange={(event) => updatePageLayout(settings.paper_size ?? "a4", event.target.value as "portrait" | "landscape")}
                  className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
                >
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
                <p className="text-xs leading-5 text-muted-foreground">
                  Layout is saved per template. Changing orientation resizes the canvas without moving existing elements. Reposition elements before saving as needed.
                </p>
              </div>
              <div className="rounded-none border border-[#E5DDDF] border-t-[3px] border-t-[#890022] bg-white p-5  space-y-4">
                <h2 className="text-sm font-semibold tracking-tight text-[#27232A]">Background Image</h2>
                {settings.template_url ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={settings.template_url}
                      alt="template"
                      className="h-16 w-24 rounded border border-border object-cover"
                    />
                    <label className="cursor-pointer">
                      <span className="inline-flex items-center gap-1.5 rounded-none border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
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
                    <div className={`rounded-none border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${uploading ? "border-[#890022] bg-[#890022]/5" : "border-border hover:bg-muted/30"}`}>
                      {uploading ? (
                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#890022]" />
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

              {settings.template_url && backgroundAspectMismatch && (
                <div role="status" className="flex items-start gap-2 border border-[#C9A5AF] bg-[#F8F1F3] px-3 py-2.5 text-xs leading-5 text-[#682037]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-semibold">Background proportions do not match this page layout.</p>
                    <p className="mt-1">
                      Image: {backgroundDimensions?.width} × {backgroundDimensions?.height} px.
                      The background may appear stretched on the certificate and in the PDF.
                      Replace it with artwork matching the selected paper size and orientation.
                      Your original image will not be cropped or changed automatically.
                    </p>
                  </div>
                </div>
              )}
              {settings.template_url && backgroundDimensionsUnavailable && (
                <p role="status" className="text-xs leading-5 text-muted-foreground">
                  Unable to read background dimensions. Check the preview for stretching.
                </p>
              )}

              {/* Typography */}
              <div className="rounded-none border border-[#E5DDDF] border-t-[3px] border-t-[#890022] bg-white p-5  space-y-4">
                <div>
                  <h2 className="text-sm font-semibold tracking-tight text-[#27232A]">Typography</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Choose a coordinated font pairing for the certificate.
                  </p>
                </div>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    Font Pairing
                  </span>
                  <select
  value={
    CERTIFICATE_FONT_PAIRINGS.find(
      (pairing) =>
        pairing.body === settings.font_family
    )?.id ?? ""
  }
  onChange={(e) => applyFontPairing(e.target.value)}
  className="w-full rounded-none border border-[#D9CDD1] bg-white px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#890022]/30"
>
  <option value="">Choose a font pairing</option>

  {CERTIFICATE_FONT_PAIRINGS.map((pairing) => (
    <option key={pairing.id} value={pairing.id}>
      {pairing.name}
    </option>
  ))}
</select>
                </label>
              </div>
            </>
          )}

          {activeTab === "signatories" && (
              <div className="space-y-4">
              {/* Add signatory form */}
              <div className="rounded-none border border-[#E5DDDF] border-t-[3px] border-t-[#890022] bg-white p-5  space-y-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-[#27232A]">
                  <PenLine className="h-4 w-4" />
                  Add Signatory
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Name</label>
                    <input
                      type="text"
                      value={sigForm.name}
                      onChange={(e) => setSigForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Rev. Fr. Juan Dela Cruz"
                      className="w-full rounded-none border border-[#D9CDD1] bg-white px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#890022]/30"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Title</label>
                    <input
                      type="text"
                      value={sigForm.title}
                      onChange={(e) => setSigForm((f) => ({ ...f, title: e.target.value }))}
                      placeholder="e.g. Parish Priest"
                      className="w-full rounded-none border border-[#D9CDD1] bg-white px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#890022]/30"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Display Type</label>
                    <select
                      value={sigForm.display_type}
                      onChange={(e) => setSigForm((f) => ({ ...f, display_type: e.target.value as "static" | "dynamic" }))}
                      className="w-full rounded-none border border-[#D9CDD1] bg-white px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#890022]/30"
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
                        className="w-full rounded-none border border-[#D9CDD1] bg-white px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#890022]/30"
                      >
                        <option value="">Select ministry...</option>
                        {MINISTRIES.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <NumberField label="Position X" value={sigForm.position_x} onChange={(v) => setSigForm((f) => ({ ...f, position_x: v }))} />
                  <NumberField label="Position Y" value={sigForm.position_y} onChange={(v) => setSigForm((f) => ({ ...f, position_y: v }))} />
                  <NumberField label="Width" value={sigForm.width} onChange={(v) => setSigForm((f) => ({ ...f, width: v }))} />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Alignment</label>
                  <div className="inline-flex rounded-none border border-border overflow-hidden">
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
                            ? "bg-[#890022] text-white"
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
                    <span className="inline-flex items-center gap-1.5 rounded-none border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                      {sigUploading === "new" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      {sigUploadUrl ? "Replace signature" : "Upload signature"}
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
                  {sigUploadUrl && (
                    <p className="text-[11px] text-[#682037] mt-1">Signature image uploaded.</p>
                  )}
                </div>

                <div className="flex justify-end pt-2 border-t border-border">
                  <button
                    onClick={handleSigSave}
                    disabled={sigSaving}
                    className="inline-flex items-center gap-2 rounded-none bg-[#890022] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#75001D] transition-colors disabled:opacity-60 "
                  >
                    {sigSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add Signatory
                  </button>
                </div>
              </div>

              {/* Existing signatories list */}
              <div className="rounded-none border border-[#E5DDDF] border-t-[3px] border-t-[#890022] bg-white  overflow-hidden">
                <div className="px-5 py-3 border-b border-border">
                  <h2 className="text-sm font-semibold tracking-tight text-[#27232A]">Configured Signatories</h2>
                </div>
                {sigLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-[#890022]" />
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
                            <span className={`inline-flex items-center rounded-none px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                              sig.display_type === "static"
                                ? "bg-[#F2EAED] text-[#682037] ring-[#890022]/20"
                                : "bg-[#F4F0F1] text-[#66565A] ring-[#C9B8BE]"
                            }`}>
                              {sig.display_type === "static" ? "Static" : sig.ministry}
                            </span>
                            {!sig.is_active && (
                              <span className="text-[11px] text-muted-foreground">(inactive)</span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            {sig.title} {sig.signature_url ? "— Has signature image" : "— No image"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleSigToggle(sig)}
                            className="text-xs font-medium text-[#890022] hover:underline"
                          >
                            {sig.is_active ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            onClick={() => handleSigDelete(sig.id)}
                            className="inline-flex items-center gap-1 rounded-none border border-[#D9CDD1] bg-white px-2 py-1 text-xs text-destructive hover:bg-destructive/5 transition-colors"
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

{activeTab === "layout" && (
  <>
    {/* Right: visual certificate editor */}
    <div className="rounded-none border border-[#E5DDDF] border-t-[3px] border-t-[#890022] bg-white p-5 ">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-[#27232A]">
            <Eye className="h-4 w-4" />
            Certificate Designer
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Select and drag certificate elements directly on the canvas.
          </p>
        </div>
      </div>

      <CertificateEditor
        settings={settings}
        onChange={setSettings}
        signatories={signatories}
        previewMember={{
          firstName: "Juan",
          lastName: "Dela Cruz",
          parish: "St. Joseph Parish",
          ministry: "Ministry of Lectors and Commentators",
          uid: "LMD-2026-0001",
          liturgicalYear: settings.liturgical_year,
        }}
      />
    </div>
  </>
)}

</div>

{/* Saved templates list */}
      <div className="rounded-none border border-[#E5DDDF] border-t-[3px] border-t-[#890022] bg-white  overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-[#27232A]">Saved Templates</h2>
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
                    isEditing ? "bg-[#890022]/5" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <p className="text-sm font-medium truncate">
                        {templateLabel(row.key)}
                      </p>
                      {isDefault && (
                        <span className="inline-flex items-center gap-1 rounded-none bg-[#F2EAED] px-2 py-0.5 text-[11px] font-medium text-[#682037] ring-1 ring-inset ring-[#890022]/20">
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
                      className="inline-flex items-center gap-1 rounded-none border border-[#D9CDD1] bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-muted/50 transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => handleSetDefault(row.key)}
                      disabled={isDefault || setDefaultKey !== null}
                      className="inline-flex items-center gap-1 rounded-none bg-[#890022] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#75001D] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                      className="inline-flex items-center gap-1 rounded-none border border-[#D9CDD1] bg-white px-2 py-1.5 text-xs text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
        className="w-full rounded-none border border-[#D9CDD1] bg-white px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#890022]/30"
      />
    </div>
  );
}
