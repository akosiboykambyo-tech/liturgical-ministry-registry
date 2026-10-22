"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CertificateTemplateSettings, Signatory } from "@/lib/types";
import {
  CERTIFICATE_FONT_PAIRINGS,
  ADDITIONAL_CERTIFICATE_FONT_PAIRINGS,
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
  const [fontUploading, setFontUploading] = useState(false);
  const [signatoryFontUploading, setSignatoryFontUploading] = useState(false);
  const [setDefaultKey, setSetDefaultKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("layout");
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  const [backgroundDimensions, setBackgroundDimensions] = useState<{ width: number; height: number } | null>(null);
  const [backgroundDimensionsUnavailable, setBackgroundDimensionsUnavailable] = useState(false);

  useEffect(() => {
    const widthQuery = window.matchMedia("(min-width: 1024px)");
    const pointerQuery = window.matchMedia("(pointer: fine)");

    const updateDesktopState = () => {
      // A spacious viewport and precision pointer are needed for drag positioning.
      setIsDesktop(widthQuery.matches && pointerQuery.matches);
    };

    updateDesktopState();
    widthQuery.addEventListener("change", updateDesktopState);
    pointerQuery.addEventListener("change", updateDesktopState);

    return () => {
      widthQuery.removeEventListener("change", updateDesktopState);
      pointerQuery.removeEventListener("change", updateDesktopState);
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

  useEffect(() => {
    let cancelled = false;
    const loadPreviewFonts = async () => {
      for (const font of [
        { url: settings.recipient_font_url, family: settings.recipient_font_name, role: "recipient" },
        { url: settings.signatory_font_url, family: settings.signatory_font_name, role: "signatory" },
      ]) {
        if (!font.url || !font.family) continue;
        try {
          let alreadyLoaded = false;
          document.fonts.forEach((face) => {
            if (face.family.replace(/["']/g, "") === font.family && face.status === "loaded") alreadyLoaded = true;
          });
          if (!alreadyLoaded) {
            const face = new FontFace(font.family, `url("${font.url}")`);
            await face.load();
            if (!cancelled) document.fonts.add(face);
          }
        } catch {
          if (!cancelled) setError(`The uploaded ${font.role} font cannot be loaded in this browser. Check storage permissions or replace the font.`);
        }
      }
    };
    void loadPreviewFonts();
    return () => { cancelled = true; };
  }, [settings.recipient_font_url, settings.recipient_font_name, settings.signatory_font_url, settings.signatory_font_name]);

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

  const load = useCallback(async (selectedKey?: string) => {
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
    const defaultRow = rows.find((r) => r.key === selectedKey) ?? rows.find((r) => r.is_default) ?? rows[0];
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
    const creating = editingKey === null;
    const name = templateName.trim();
    if (creating && !name) {
      setError("Enter a name before creating a new certificate template.");
      return;
    }
    const key = creating ? nameToKey(name) : editingKey;
    if (creating && (key === TEMPLATE_KEY_PREFIX || templates.some((row) => row.key === key))) {
      setError("A template with that name already exists. Use a different name or edit the existing template.");
      return;
    }
    setSaving(true);
    setError(null);
    // Never upsert a new template: a concurrent name collision must not overwrite an existing design.
    const { error } = creating
      ? await supabase.from("system_settings").insert({
          key, value: settings as unknown as Record<string, unknown>,
          is_default: templates.length === 0,
        })
      : await supabase.from("system_settings")
          .update({ value: settings as unknown as Record<string, unknown> }).eq("key", key);
    setSaving(false);
    if (error) {
      setError(creating && error.code === "23505"
        ? "A template with that name already exists. Choose another name."
        : error.message);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    await load(key);
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

  const fontSuggestions: Record<string, string> = {
    '"EB Garamond", Georgia, serif': '"Inter", Arial, sans-serif',
    '"Cormorant Garamond", Georgia, serif': '"Raleway", Arial, sans-serif',
    '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif': '"Poppins", Arial, sans-serif',
    '"Playfair Display", Georgia, serif': '"Montserrat", Arial, sans-serif',
    'Georgia, serif': '"Inter", Arial, sans-serif',
  };
  const suggestedSecondary = fontSuggestions[settings.font_family] ?? '"Inter", Arial, sans-serif';
  const suggestedLabel = FONT_OPTIONS.find((font) => font.value === suggestedSecondary)?.label ?? "Inter";

  const setTypographyFont = (role: "primary" | "secondary" | "recipient", family: string) => {
    setSettings((current) => {
      const patch = role === "primary" ? { font_family: family }
        : role === "secondary" ? { secondary_font_family: family }
        : { recipient_font_family: family, recipient_font_url: null, recipient_font_name: null };
      return {
        ...current,
        ...patch,
        elements: current.elements.map((element) => {
          const matches = role === "primary"
            ? ["text", "liturgical_year"].includes(element.type)
            : role === "secondary"
              ? ["parish", "ministry", "uid"].includes(element.type)
              : element.type === "member_name";
          return matches ? { ...element, font_family: family } : element;
        }),
      };
    });
  };

  const updateRecipientStyle = (field: "color" | "size" | "weight", value: string | number) => {
    setSettings((current) => ({
      ...current,
      ...(field === "color" ? { recipient_font_color: String(value) }
        : field === "size" ? { recipient_font_size: Number(value) }
        : { recipient_font_weight: String(value) }),
      elements: current.elements.map((element) => element.type === "member_name"
        ? { ...element, ...(field === "color" ? { color: String(value) }
            : field === "size" ? { font_size: Number(value) }
            : { font_weight: String(value) }) }
        : element),
    }));
  };

  const setRecipientTextCase = (textCase: "normal" | "uppercase" | "small-caps") => {
    setSettings((current) => ({
      ...current,
      recipient_text_case: textCase,
      elements: current.elements.map((element) =>
        element.type === "member_name" ? { ...element, text_case: textCase } : element
      ),
    }));
  };

  const handleRecipientFontUpload = async (file: File, role: "recipient" | "signatory" = "recipient") => {
    const extension = file.name.split(".").pop()?.toLowerCase();
    const mime: Record<string, string> = {
      ttf: "font/ttf", otf: "font/otf", woff: "font/woff", woff2: "font/woff2",
    };
    if (!extension || !mime[extension] || file.size > 5 * 1024 * 1024 || file.size === 0) {
      setError("Use a licensed TTF, OTF, WOFF or WOFF2 font up to 5 MB.");
      return;
    }
    if (role === "recipient") setFontUploading(true);
    else setSignatoryFontUploading(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      const magic = Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
      const signatures: Record<string, string[]> = {
        ttf: ["00010000", "74727565"], otf: ["4f54544f"], woff: ["774f4646"], woff2: ["774f4632"],
      };
      if (!signatures[extension].includes(magic)) {
        setError("The selected file does not appear to be a valid font of the specified type.");
        return;
      }
      const path = `${role}-fonts/${crypto.randomUUID()}.${extension}`;
      // Windows/browser font files may have application/octet-stream as their File.type.
      // Supabase's multipart upload uses the file's MIME type, so normalize it.
      const fontFile = new File([file], file.name, { type: mime[extension] });
      const { error: uploadError } = await supabase.storage.from("certificate-templates").upload(
        path, fontFile, { contentType: mime[extension], upsert: false }
      );
      if (uploadError) throw uploadError;
      const { data: publicData } = supabase.storage.from("certificate-templates").getPublicUrl(path);
      const family = `${role === "recipient" ? "RecipientCustom" : "SignatoryCustom"}-${path.split("/").pop()?.replace(".", "-")}`;
      const stack = `"${family}", Georgia, serif`;
      setSettings((current) => role === "recipient" ? ({
        ...current,
        recipient_font_url: publicData.publicUrl,
        recipient_font_name: family,
        recipient_font_family: stack,
        elements: current.elements.map((element) => element.type === "member_name"
          ? { ...element, font_family: stack } : element),
      }) : ({
        ...current,
        signatory_font_url: publicData.publicUrl,
        signatory_font_name: family,
        signatory_font_family: stack,
        elements: current.elements.map((element) => element.type === "signatory"
          ? { ...element, font_family: stack } : element),
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Custom font upload failed.");
    } finally {
      if (role === "recipient") setFontUploading(false);
      else setSignatoryFontUploading(false);
    }
  };

  // The controls in this tab are template-wide defaults. Element properties remain
  // independently editable in the Visual Canvas after applying these defaults.
  const setSignatoryFont = (family: string) => {
    setSettings((current) => ({
      ...current,
      signatory_font_family: family,
      signatory_font_url: null,
      signatory_font_name: null,
      elements: current.elements.map((element) => element.type === "signatory"
        ? { ...element, font_family: family } : element),
    }));
  };

  const updateSignatoryTitle = (field: "family" | "size" | "weight" | "case", value: string | number) => {
    setSettings((current) => ({
      ...current,
      ...(field === "family" ? { signatory_title_font_family: String(value) }
        : field === "size" ? { signatory_title_font_size: Number(value) }
        : field === "weight" ? { signatory_title_font_weight: String(value) }
        : { signatory_title_text_case: String(value) as "normal" | "uppercase" | "small-caps" }),
    }));
  };

  const updateSignatoryTypography = (field: "color" | "titleColor" | "size" | "weight" | "case", value: string | number) => {
    setSettings((current) => ({
      ...current,
      ...(field === "color" ? { signatory_font_color: String(value) }
        : field === "titleColor" ? { signatory_title_color: String(value) }
        : field === "size" ? { signatory_font_size: Number(value) }
        : field === "weight" ? { signatory_font_weight: String(value) }
        : { signatory_text_case: String(value) as "normal" | "uppercase" | "small-caps" }),
      elements: current.elements.map((element) => element.type === "signatory"
        ? { ...element, ...(field === "color" ? { color: String(value) }
          : field === "size" ? { font_size: Number(value) }
          : field === "weight" ? { font_weight: String(value) }
          : field === "case" ? { text_case: String(value) as "normal" | "uppercase" | "small-caps" }
          : {}) }
        : element),
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

  // Do not flash editing controls while screen/pointer capability is being checked.
  if (isDesktop === null) {
    return <div className="min-h-[60vh]" aria-label="Checking device compatibility" />;
  }

  if (!isDesktop) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg border border-[#E5DDDF] border-t-[3px] border-t-[#890022] bg-white p-7 text-center sm:p-9">
          <div className="mx-auto flex h-12 w-12 items-center justify-center bg-[#F8F1F3] text-[#890022]">
            <ImageIcon className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className={`${ebGaramond.className} mt-5 text-[34px] font-medium leading-tight text-[#1E1114]`}>
            Certificate Template Manager
          </h1>
          <p className="mt-3 text-sm font-semibold text-[#890022]">
            Desktop access required
          </p>
          <p className="mt-2 text-sm leading-6 text-[#66565A]">
            Certificate design is available only on a desktop or laptop with a
            sufficiently wide screen and a mouse or trackpad. This prevents
            accidental changes while positioning certificate elements.
          </p>
          <p className="mt-4 text-sm font-medium text-[#1E1114]">
            Please open this page on a desktop or laptop, or widen your desktop browser window.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-[#890022]" />
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

        <div className="flex flex-wrap items-end gap-2">
          <button type="button" onClick={handleNew}
            className="inline-flex min-h-10 items-center gap-1.5 border border-[#D9CDD1] bg-white px-3 py-2 text-sm font-medium text-[#682037] hover:bg-[#F8F1F3]">
            <Plus className="h-4 w-4" /> New Template
          </button>
          {editingKey && (
            <button type="button"
              onClick={() => { setEditingKey(null); setTemplateName(""); setSaved(false); setError(null); }}
              className="inline-flex min-h-10 items-center gap-1.5 border border-[#D9CDD1] bg-white px-3 py-2 text-sm font-medium text-[#682037] hover:bg-[#F8F1F3]">
              <FileText className="h-4 w-4" /> Save as New
            </button>
          )}
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
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-none border border-[#C9A5AF] bg-[#F8F1F3] px-4 py-3 text-sm text-[#682037]">
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

      <div className="border border-[#E5DDDF] border-t-[3px] border-t-[#890022] bg-white p-4 sm:p-5">
        <label className="block max-w-lg space-y-1.5">
          <span className="text-xs font-semibold text-[#27232A]">{editingKey ? "Editing saved template" : "New template name"}</span>
          <input type="text" value={templateName} maxLength={80} disabled={Boolean(editingKey)}
            onChange={(event) => setTemplateName(event.target.value)}
            placeholder="e.g. Commissioning Certificate Landscape"
            className="block h-10 w-full border border-[#D9CDD1] bg-white px-3 text-sm disabled:bg-[#F7F2F3] disabled:text-[#66565A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#890022]/30" />
        </label>
        <p className="mt-2 text-xs leading-5 text-[#66565A]">
          {editingKey
            ? "Save Template updates only the selected template. Save as New creates an independent copy; New Template starts with defaults."
            : "Save Template creates a separate record without overwriting an existing certificate."}
        </p>
      </div>

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
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={settings.template_url} alt="Current certificate background"
                        className="h-20 w-24 shrink-0 border border-[#D9CDD1] bg-white object-contain" />
                      <p className="min-w-0 text-xs leading-5 text-[#66565A]">Current background for this template.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex min-h-10 cursor-pointer items-center justify-center gap-1.5 border border-[#D9CDD1] px-2 text-xs font-medium text-[#682037] hover:bg-[#F8F1F3]">
                        <Upload className="h-3.5 w-3.5 shrink-0" />
                        {uploading ? "Uploading..." : "Replace"}
                        <input type="file" accept="image/jpeg,image/png" disabled={uploading} className="hidden"
                          onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleUpload(file); event.target.value = ""; }} />
                      </label>
                      <button type="button" disabled={uploading}
                        onClick={() => setSettings((current) => ({ ...current, template_url: null }))}
                        className="min-h-10 border border-[#C9B8BE] px-2 text-xs font-medium text-[#890022] hover:bg-[#F8F1F3] disabled:opacity-50">
                        Remove image
                      </button>
                    </div>
                    <p className="text-[11px] leading-4 text-[#66565A]">Removing the image restores the placeholder when you save.</p>
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
              <div className="rounded-none border border-[#E5DDDF] border-t-[3px] border-t-[#890022] bg-white p-5 space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-[#27232A]">Certificate Typography</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Select fonts freely. Suggestions are optional.</p>
                </div>
                <label className="block space-y-1">
                  <span className="text-xs font-medium">Primary font</span>
                  <select value={settings.font_family} onChange={(e) => setTypographyFont("primary", e.target.value)}
                    className="w-full rounded-none border border-[#D9CDD1] bg-white px-2.5 py-2 text-sm">
                    {!FONT_OPTIONS.some((f) => f.value === settings.font_family) && <option value={settings.font_family}>Current selection</option>}
                    {FONT_OPTIONS.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
                  </select>
                </label>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-[#66565A]">Suggested pairing: {suggestedLabel}</span>
                  <button type="button" onClick={() => setTypographyFont("secondary", suggestedSecondary)}
                    className="shrink-0 border border-[#C9B8BE] px-2 py-1 text-xs font-medium text-[#890022] hover:bg-[#F8F1F3]">Use suggestion</button>
                </div>
                <label className="block space-y-1">
                  <span className="text-xs font-medium">Secondary font</span>
                  <select value={settings.secondary_font_family ?? ""}
                    onChange={(e) => setTypographyFont("secondary", e.target.value)}
                    className="w-full rounded-none border border-[#D9CDD1] bg-white px-2.5 py-2 text-sm">
                    <option value="">No selection</option>
                    {settings.secondary_font_family && !FONT_OPTIONS.some((f) => f.value === settings.secondary_font_family) &&
                      <option value={settings.secondary_font_family}>Current selection</option>}
                    {FONT_OPTIONS.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
                  </select>
                  <span className="block text-[11px] text-[#66565A]">Your secondary choice is never changed automatically.</span>
                </label>
                <div className="border-t border-[#E5DDDF] pt-4 space-y-3">
                  <h3 className="text-xs font-semibold text-[#27232A]">Recipient name typography</h3>
                  <label className="block space-y-1">
                    <span className="text-xs">Independent recipient font</span>
                    <select value={settings.recipient_font_family ?? ""}
                      onChange={(e) => setTypographyFont("recipient", e.target.value)}
                      className="w-full rounded-none border border-[#D9CDD1] bg-white px-2.5 py-2 text-sm">
                      <option value="">Choose recipient font</option>
                      {settings.recipient_font_url && settings.recipient_font_family &&
                        <option value={settings.recipient_font_family}>Uploaded custom font</option>}
                      {FONT_OPTIONS.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
                    </select>
                  </label>
                  <div className="grid grid-cols-1 gap-3">
                    <div className="grid grid-cols-2 items-end gap-3">
                      <label className="flex min-w-0 flex-col gap-1.5">
                        <span className="min-h-8 text-xs leading-4">Recipient name color</span>
                        <div className="flex h-10 min-w-0 items-center gap-2">
                          <input type="color" aria-label="Recipient name color" value={settings.recipient_font_color ?? "#0f172a"}
                            onChange={(e) => updateRecipientStyle("color", e.target.value)}
                            className="h-10 w-10 shrink-0 cursor-pointer rounded-none border border-[#D9CDD1] bg-white p-1" />
                          <input type="text" aria-label="Recipient color HEX" value={settings.recipient_font_color ?? "#0f172a"}
                            onChange={(e) => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) updateRecipientStyle("color", e.target.value); }}
                            className="h-10 min-w-0 flex-1 border border-[#D9CDD1] bg-white px-2 text-xs" />
                        </div>
                      </label>
                      <label className="flex min-w-0 flex-col gap-1.5">
                        <span className="min-h-8 text-xs leading-4">Name size (px)</span>
                        <input type="number" min={8} max={120} value={settings.recipient_font_size ?? 20}
                          onChange={(e) => updateRecipientStyle("size", Math.min(120, Math.max(8, Number(e.target.value) || 8)))}
                          className="h-10 w-full min-w-0 border border-[#D9CDD1] bg-white px-2 text-sm" />
                      </label>
                    </div>
                  </div>
                  <label className="block space-y-1.5">
                    <span className="text-xs">Recipient name capitalization</span>
                    <select value={settings.recipient_text_case ?? "normal"}
                      onChange={(e) => setRecipientTextCase(e.target.value as "normal" | "uppercase" | "small-caps")}
                      className="h-10 w-full rounded-none border border-[#D9CDD1] bg-white px-2.5 text-sm">
                      <option value="normal">Normal case</option>
                      <option value="uppercase">ALL CAPS</option>
                      <option value="small-caps">Small Caps</option>
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs">Recipient font weight</span>
                    <select value={settings.recipient_font_weight ?? "normal"}
                      onChange={(e) => updateRecipientStyle("weight", e.target.value)}
                      className="w-full border border-[#D9CDD1] bg-white p-2 text-sm">
                      <option value="normal">Regular</option><option value="500">Medium</option>
                      <option value="600">Semibold</option><option value="bold">Bold</option>
                    </select>
                  </label>
                  <label className="block cursor-pointer border border-[#D9CDD1] p-3 text-xs text-[#52212F]">
                    <span className="font-semibold">{fontUploading ? "Uploading font..." : "Upload licensed recipient font"}</span>
                    <span className="mt-1 block text-[#66565A]">TTF, OTF, WOFF, WOFF2 · maximum 5 MB</span>
                    <input type="file" accept=".ttf,.otf,.woff,.woff2" disabled={fontUploading}
                      onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleRecipientFontUpload(file); e.target.value = ""; }}
                      className="mt-2 block w-full text-xs" />
                  </label>
                  {settings.recipient_font_url && <p className="text-xs text-[#682037]">Custom recipient font selected. Save the template to keep this choice.</p>}
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  Each element remains individually editable in the certificate designer.
                </p>
              </div>
            </>
          )}

          {activeTab === "signatories" && (
              <div className="space-y-4">
              <div className="rounded-none border border-[#E5DDDF] border-t-[3px] border-t-[#890022] bg-white p-5 space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-[#27232A]">Signatory Typography</h2>
                  <p className="mt-1 text-xs leading-5 text-[#66565A]">
                    Configure signatory names and titles separately. These settings apply to static and dynamic signatories in this template.
                  </p>
                </div>
                <section className="space-y-3" aria-label="Signatory name typography">
                  <h3 className="border-b border-[#E5DDDF] pb-2 text-xs font-semibold text-[#52212F]">Signatory Name</h3>
                  <label className="block space-y-1.5">
                    <span className="text-xs">Name font</span>
                    <select value={settings.signatory_font_family ?? "Georgia, serif"}
                      onChange={(event) => setSignatoryFont(event.target.value)}
                      className="h-10 w-full rounded-none border border-[#D9CDD1] bg-white px-2.5 text-sm">
                      {settings.signatory_font_url && settings.signatory_font_family && (
                        <option value={settings.signatory_font_family}>Uploaded signatory font</option>
                      )}
                      {!FONT_OPTIONS.some((font) => font.value === (settings.signatory_font_family ?? "Georgia, serif")) && !settings.signatory_font_url && (
                        <option value={settings.signatory_font_family ?? "Georgia, serif"}>Current custom font</option>
                      )}
                      {FONT_OPTIONS.map((font) => <option key={font.label} value={font.value}>{font.label}</option>)}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 items-end gap-3">
                    <label className="flex min-w-0 flex-col gap-1.5">
                      <span className="min-h-8 text-xs leading-4">Name color</span>
                      <div className="flex h-10 min-w-0 items-center gap-2">
                        <input type="color" aria-label="Signatory name color"
                          value={settings.signatory_font_color ?? "#0f172a"}
                          onChange={(event) => updateSignatoryTypography("color", event.target.value)}
                          className="h-10 w-10 shrink-0 cursor-pointer border border-[#D9CDD1] bg-white p-1" />
                        <input type="text" aria-label="Signatory name color HEX"
                          value={settings.signatory_font_color ?? "#0f172a"}
                          onChange={(event) => { if (/^#[0-9a-fA-F]{6}$/.test(event.target.value)) updateSignatoryTypography("color", event.target.value); }}
                          className="h-10 w-full min-w-0 border border-[#D9CDD1] bg-white px-2 text-xs" />
                      </div>
                    </label>
                    <label className="flex min-w-0 flex-col gap-1.5">
                      <span className="min-h-8 text-xs leading-4">Name size (px)</span>
                      <input type="number" min={8} max={120} value={settings.signatory_font_size ?? 12}
                        onChange={(event) => updateSignatoryTypography("size", Math.min(120, Math.max(8, Number(event.target.value) || 8)))}
                        className="h-10 w-full min-w-0 border border-[#D9CDD1] bg-white px-2 text-sm" />
                    </label>
                  </div>
                  <label className="block space-y-1.5">
                    <span className="text-xs">Name capitalization</span>
                    <select value={settings.signatory_text_case ?? "normal"}
                      onChange={(event) => updateSignatoryTypography("case", event.target.value)}
                      className="h-10 w-full rounded-none border border-[#D9CDD1] bg-white px-2.5 text-sm">
                      <option value="normal">Normal case</option><option value="uppercase">ALL CAPS</option>
                      <option value="small-caps">Small Caps</option>
                    </select>
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs">Name weight</span>
                    <select value={settings.signatory_font_weight ?? "bold"}
                      onChange={(event) => updateSignatoryTypography("weight", event.target.value)}
                      className="h-10 w-full rounded-none border border-[#D9CDD1] bg-white px-2.5 text-sm">
                      <option value="normal">Regular</option><option value="500">Medium</option>
                      <option value="600">Semibold</option><option value="bold">Bold</option>
                    </select>
                  </label>
                  <label className="block cursor-pointer border border-[#D9CDD1] p-3 text-xs text-[#52212F]">
                    <span className="font-semibold">{signatoryFontUploading ? "Uploading font..." : "Upload licensed signatory font"}</span>
                    <span className="mt-1 block text-[#66565A]">TTF, OTF, WOFF, WOFF2 · maximum 5 MB</span>
                    <input type="file" accept=".ttf,.otf,.woff,.woff2" disabled={signatoryFontUploading}
                      onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleRecipientFontUpload(file, "signatory"); event.target.value = ""; }}
                      className="mt-2 block w-full text-xs" />
                  </label>
                  {settings.signatory_font_url && <p className="text-xs text-[#682037]">Custom signatory font selected. Save the template to keep this choice.</p>}
                </section>
                <section className="space-y-3 border-t border-[#E5DDDF] pt-4" aria-label="Signatory title typography">
                  <h3 className="border-b border-[#E5DDDF] pb-2 text-xs font-semibold text-[#52212F]">Signatory Title</h3>
                  <label className="block space-y-1.5">
                    <span className="text-xs">Title font (independent)</span>
                    <select value={settings.signatory_title_font_family ?? "Georgia, serif"}
                      onChange={(event) => updateSignatoryTitle("family", event.target.value)}
                      className="h-10 w-full rounded-none border border-[#D9CDD1] bg-white px-2.5 text-sm">
                      {settings.signatory_font_url && settings.signatory_font_family && (
                        <option value={settings.signatory_font_family}>Uploaded signatory font</option>
                      )}
                      {!FONT_OPTIONS.some((font) => font.value === (settings.signatory_title_font_family ?? "Georgia, serif")) &&
                        settings.signatory_title_font_family !== settings.signatory_font_family && (
                          <option value={settings.signatory_title_font_family ?? "Georgia, serif"}>Current custom font</option>
                        )}
                      {FONT_OPTIONS.map((font) => <option key={font.label} value={font.value}>{font.label}</option>)}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 items-end gap-3">
                    <label className="flex min-w-0 flex-col gap-1.5">
                      <span className="min-h-8 text-xs leading-4">Title color</span>
                      <div className="flex h-10 min-w-0 items-center gap-2">
                        <input type="color" aria-label="Signatory title color"
                          value={settings.signatory_title_color ?? "#71717a"}
                          onChange={(event) => updateSignatoryTypography("titleColor", event.target.value)}
                          className="h-10 w-10 shrink-0 cursor-pointer border border-[#D9CDD1] bg-white p-1" />
                        <input type="text" aria-label="Signatory title color HEX"
                          value={settings.signatory_title_color ?? "#71717a"}
                          onChange={(event) => { if (/^#[0-9a-fA-F]{6}$/.test(event.target.value)) updateSignatoryTypography("titleColor", event.target.value); }}
                          className="h-10 w-full min-w-0 border border-[#D9CDD1] bg-white px-2 text-xs" />
                      </div>
                    </label>
                    <label className="flex min-w-0 flex-col gap-1.5">
                      <span className="min-h-8 text-xs leading-4">Title size (px)</span>
                      <input type="number" min={8} max={120} value={settings.signatory_title_font_size ?? 10}
                        onChange={(event) => updateSignatoryTitle("size", Math.min(120, Math.max(8, Number(event.target.value) || 8)))}
                        className="h-10 w-full min-w-0 border border-[#D9CDD1] bg-white px-2 text-sm" />
                    </label>
                  </div>
                  <label className="block space-y-1.5">
                    <span className="text-xs">Title capitalization</span>
                    <select value={settings.signatory_title_text_case ?? "normal"}
                      onChange={(event) => updateSignatoryTitle("case", event.target.value)}
                      className="h-10 w-full rounded-none border border-[#D9CDD1] bg-white px-2.5 text-sm">
                      <option value="normal">Normal case</option><option value="uppercase">ALL CAPS</option>
                      <option value="small-caps">Small Caps</option>
                    </select>
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs">Title weight</span>
                    <select value={settings.signatory_title_font_weight ?? "normal"}
                      onChange={(event) => updateSignatoryTitle("weight", event.target.value)}
                      className="h-10 w-full rounded-none border border-[#D9CDD1] bg-white px-2.5 text-sm">
                      <option value="normal">Regular</option><option value="500">Medium</option>
                      <option value="600">Semibold</option><option value="bold">Bold</option>
                    </select>
                  </label>
                </section>
                <p className="text-xs leading-5 text-[#66565A]">
                  The signatory name can still be customized individually on the certificate canvas. Name and title styles are saved with this template.
                </p>
              </div>

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
                            className="inline-flex items-center gap-1 rounded-none border border-[#D9CDD1] bg-white px-2 py-1 text-xs text-[#890022] hover:bg-[#F8F1F3] transition-colors"
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
                      className="inline-flex items-center gap-1 rounded-none border border-[#D9CDD1] bg-white px-2 py-1.5 text-xs text-[#890022] hover:bg-[#F8F1F3] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
