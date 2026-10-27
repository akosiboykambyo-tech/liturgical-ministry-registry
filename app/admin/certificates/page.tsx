"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { withCertificateSessionRecovery, AdminReauthenticationRequiredError } from "@/lib/certificate-session-recovery";
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
import { CenteredAdminLoader } from "@/components/admin-centered-loader";
import {
  upgradeSignatoryOffsets, SIGNATURE_LAYOUT_KEY_PREFIX,
  DEFAULT_SIGNATURE_COMPOSITION, normalizeSignatureComposition, attachSignatureCompositions,
} from "@/lib/signature-layout";
import { SignatoryLayoutCanvas } from "@/components/signatory-composition";
import { resolveCertificateSignatory } from "@/lib/certificate";
import type { SignatureComposition } from "@/lib/types";

type TemplateRow = {
  key: string;
  is_default: boolean;
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

// Keep a stalled network request from trapping the editor behind a spinner.
// Timings are visible in development tools, without logging member data.
async function readWithTimeout<T>(label: string, request: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 15000);
  const started = performance.now();
  try {
    return await request(controller.signal);
  } finally {
    window.clearTimeout(timer);
    if (process.env.NODE_ENV === "development") {
      console.debug(`[Certificate Manager] ${label}: ${Math.round(performance.now() - started)} ms`);
    }
  }
}

function loadError(cause: unknown, resource: string) {
  return cause instanceof Error && cause.name === "AbortError"
    ? `${resource} timed out. Check your connection and retry.`
    : `Unable to load ${resource.toLowerCase()}: ${cause instanceof Error ? cause.message : "Request failed"}`;
}
  type Tab = "layout" | "signatories";

export default function CertificateManagerPage() {
  const supabase = getSupabaseBrowserClient();
  const [settings, setSettings] = useState<CertificateTemplateSettings>(DEFAULTS);
  const [templateName, setTemplateName] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [reauthenticationRequired, setReauthenticationRequired] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [signatoriesError, setSignatoriesError] = useState<string | null>(null);
  const activeLoadId = useRef(0);
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
  const [editingSignatureId, setEditingSignatureId] = useState<string | null>(null);
  const [signatureDraft, setSignatureDraft] = useState<SignatureComposition>({ ...DEFAULT_SIGNATURE_COMPOSITION });
  const [signatureSaving, setSignatureSaving] = useState(false);
  const [signatureSaveError, setSignatureSaveError] = useState<string | null>(null);
  const [signatureSavedNotice, setSignatureSavedNotice] = useState<string | null>(null);
  const [sigLoading, setSigLoading] = useState(true);
  const [sigSaving, setSigSaving] = useState(false);
  const [sigUploading, setSigUploading] = useState<string | null>(null);
  const [sigUploadUrl, setSigUploadUrl] = useState<string | null>(null);
  const [sigForm, setSigForm] = useState({
    name: "",
    title: "",
    display_type: "static" as "static" | "dynamic",
    ministry: "",
    alignment: "left" as "left" | "center" | "right",
  });

  // Fetch one complete template for the editor. The saved-template index contains
  // metadata only and is loaded independently, so it does not block first paint.
  const load = useCallback(async (selectedKey?: string) => {
    const current = ++activeLoadId.current;
    setLoading(true);
    setTemplateError(null);
    setReauthenticationRequired(false);
    try {
      const readOne = async (signal: AbortSignal, key?: string, first = false) => {
        const { data, error } = await withCertificateSessionRecovery(supabase, async () => {
          let query = supabase.from("system_settings")
            .select("key,value,is_default")
            .like("key", `${TEMPLATE_KEY_PREFIX}%`);
          if (key) query = query.eq("key", key);
          else if (!first) query = query.eq("is_default", true);
          return await query.order("key").limit(1).abortSignal(signal).maybeSingle();
        });
        if (error) throw new Error(error.message);
        return data;
      };
      const row = await readWithTimeout("Active template", async (signal) => {
        const preferred = await readOne(signal, selectedKey);
        return preferred ?? (selectedKey ? null : readOne(signal, undefined, true));
      });
      if (current !== activeLoadId.current) return;
      if (row) {
        const loaded = { ...DEFAULTS, ...(row.value as CertificateTemplateSettings) };
        setSettings({
          ...loaded,
          elements: upgradeSignatoryOffsets(loaded.elements ?? []),
        });
        setEditingKey(row.key);
        setTemplateName(templateLabel(row.key));
      } else if (selectedKey) {
        throw new Error("Selected template not found.");
      } else {
        setSettings(DEFAULTS);
        setEditingKey(null);
        setTemplateName("");
      }
    } catch (cause) {
      if (current === activeLoadId.current) {
        setTemplateError(loadError(cause, "Certificate template"));
        setReauthenticationRequired(cause instanceof AdminReauthenticationRequiredError);
      }
    } finally {
      if (current === activeLoadId.current) setLoading(false);
    }
  }, [supabase]);

  const loadTemplateList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const { data, error } = await readWithTimeout("Template names", (signal) =>
        withCertificateSessionRecovery(supabase, async () =>
          await supabase.from("system_settings")
            .select("key,is_default")
            .like("key", `${TEMPLATE_KEY_PREFIX}%`)
            .order("key").abortSignal(signal)
        )
      );
      if (error) throw new Error(error.message);
      setTemplates((data ?? []).map((row) => ({
        key: row.key as string,
        is_default: Boolean(row.is_default),
      })));
    } catch (cause) {
      setListError(loadError(cause, "Saved template list"));
    } finally {
      setListLoading(false);
    }
  }, [supabase]);

  const loadSignatories = useCallback(async () => {
    setSigLoading(true);
    setSignatoriesError(null);
    try {
      const [signatoryQuery, layoutsQuery] = await Promise.all([
        readWithTimeout("Signatories", (signal) =>
          withCertificateSessionRecovery(supabase, async () =>
            await supabase.from("signatories").select("*").order("sort_order").abortSignal(signal))),
        readWithTimeout("Signatory layout presets", (signal) =>
          withCertificateSessionRecovery(supabase, async () =>
            await supabase.from("system_settings").select("key,value")
              .like("key", `${SIGNATURE_LAYOUT_KEY_PREFIX}%`).abortSignal(signal))),
      ]);
      if (signatoryQuery.error) throw new Error(signatoryQuery.error.message);
      if (layoutsQuery.error) throw new Error(layoutsQuery.error.message);
      setSignatories(attachSignatureCompositions(
        (signatoryQuery.data as Signatory[]) ?? [], layoutsQuery.data ?? []
      ));
    } catch (cause) {
      setSignatoriesError(loadError(cause, "Signatories"));
    } finally {
      setSigLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
    void loadTemplateList();
    void loadSignatories();
  }, [load, loadTemplateList, loadSignatories]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["png", "jpg", "jpeg"].includes(extension) ||
        !["image/png", "image/jpeg"].includes(file.type)) {
      setError("Use a PNG or JPEG certificate background.");
      setUploading(false);
      return;
    }
    // Each upload receives its own object, so replacing an image for one
    // template cannot overwrite another template's background in Storage.
    const path = `backgrounds/${crypto.randomUUID()}.${extension}`;
    const { error: upErr } = await supabase.storage
      .from("certificate-templates")
      .upload(path, file, { contentType: file.type, upsert: false });
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
    if (creating && (listLoading || listError)) {
      setError("Load the saved template list before creating a new template.");
      return;
    }
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
    await Promise.all([load(key), loadTemplateList()]);
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
    await Promise.all([load(), loadTemplateList()]);
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
      await Promise.all([load(), loadTemplateList()]);
    }
  };

  const handleEdit = (row: TemplateRow) => {
    setSaved(false);
    setError(null);
    void load(row.key);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
      // Required legacy signatories columns; actual certificate placement lives on the canvas element.
      position_x: 60,
      position_y: 720,
      width: 150,
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
        alignment: "left",
      });
      await loadSignatories();
    }
  };

  const editSignatureLayout = (signatory: Signatory) => {
    setEditingSignatureId(signatory.id);
    setSignatureDraft(normalizeSignatureComposition(signatory.signature_layout));
    setSignatureSaveError(null);
    setSignatureSavedNotice(null);
  };

  const saveSignatureLayout = async () => {
    const id = editingSignatureId;
    if (!id) return;
    const preset = normalizeSignatureComposition(signatureDraft);
    setSignatureSaving(true);
    setSignatureSaveError(null);
    const key = SIGNATURE_LAYOUT_KEY_PREFIX + id;
    let saveError: { message: string } | null = null;
    try {
      const result = await withCertificateSessionRecovery(supabase, async () =>
        await supabase.from("system_settings")
          .upsert({ key, value: preset as unknown as Record<string, unknown>, is_default: false }, { onConflict: "key" })
      );
      saveError = result.error;
    } catch (cause) {
      saveError = { message: cause instanceof Error ? cause.message : "Session recovery failed." };
    }
    setSignatureSaving(false);
    if (saveError) {
      setSignatureSaveError(`Could not save signature layout: ${saveError.message}`);
      return;
    }
    setSignatories((previous) => previous.map((sig) =>
      sig.id === id ? { ...sig, signature_layout: preset } : sig
    ));
    setEditingSignatureId(null);
    const savedSignatory = signatories.find((sig) => sig.id === id);
    const inCertificate = savedSignatory && settings.elements.some((element) =>
      element.type === "signatory" &&
      resolveCertificateSignatory(element.signatory_id, signatories, savedSignatory.ministry)?.id === id
    );
    if (inCertificate) {
      setActiveTab("layout");
      setSignatureSavedNotice(`Signature layout saved for ${savedSignatory.name}. The certificate canvas now uses this arrangement.`);
    } else {
      setSignatureSavedNotice("Signature layout saved. This signatory is not currently assigned to a block in the selected certificate; add or select the appropriate signatory there to see it.");
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

  // Keep the first paint centered while device capabilities are checked.
  if (isDesktop === null) {
    return <CenteredAdminLoader label="Checking certificate editor compatibility…" />;
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
    return <CenteredAdminLoader label="Loading certificate template…" />;
  }
  if (templateError) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div role="alert" className="w-full max-w-lg space-y-4 border border-[#E5DDDF] border-t-[3px] border-t-[#890022] bg-white p-7 text-center">
          <h1 className={`${ebGaramond.className} text-3xl text-[#1E1114]`}>Certificate Template Manager</h1>
          <p className="text-sm text-[#682037]">{templateError}</p>
          {reauthenticationRequired ? (
            <button type="button" onClick={() => {
              void supabase.auth.signOut({ scope: "local" }).finally(() => {
                window.location.assign("/admin");
              });
            }} className="min-h-11 bg-[#890022] px-5 py-2 text-sm font-semibold text-white">
              Sign out and sign in again
            </button>
          ) : (
            <button type="button" onClick={() => void load()} className="min-h-11 bg-[#890022] px-5 py-2 text-sm font-semibold text-white">
              Retry loading
            </button>
          )}
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

      {signatoriesError && (
        <div role="alert" className="flex items-center justify-between gap-3 border border-[#C9A5AF] bg-[#F8F1F3] px-4 py-3 text-sm text-[#682037]">
          <span>{signatoriesError}</span>
          <button type="button" onClick={() => void loadSignatories()}
            className="shrink-0 border border-[#890022] px-3 py-2 font-semibold">Retry</button>
        </div>
      )}
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

                <p className="text-xs leading-5 text-muted-foreground">
                  Place and resize this signatory by dragging it in the Visual Canvas. Precise positioning remains available under the selected element.
                </p>

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
                          <button type="button" onClick={() => editSignatureLayout(sig)}
                            disabled={!sig.signature_url} title={sig.signature_url ? "Open signature layout canvas" : "Upload a signature image first"}
                            className="border border-[#D9CDD1] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#890022] disabled:opacity-50">
                            Adjust Signature
                          </button>
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
              {signatureSavedNotice && (
                <div role="status" className="mt-3 border border-[#C5D9D2] bg-[#F3F9F7] px-4 py-3 text-sm text-[#145C51]">
                  {signatureSavedNotice}
                </div>
              )}
              {editingSignatureId && (() => {
                const chosen = signatories.find((sig) => sig.id === editingSignatureId);
                return chosen ? (
                  <div className="space-y-2">
                    {signatureSaveError && <p role="alert" className="text-sm text-[#890022]">{signatureSaveError}</p>}
                    <SignatoryLayoutCanvas key={chosen.id} signatory={chosen}
                      settings={settings} certificateElement={settings.elements.find((element) =>
                        element.type === "signatory" &&
                        resolveCertificateSignatory(element.signatory_id, signatories, chosen.ministry)?.id === chosen.id
                      )} value={signatureDraft} onChange={setSignatureDraft}
                      saving={signatureSaving} onSave={() => void saveSignatureLayout()}
                      onCancel={() => { setEditingSignatureId(null); setSignatureSaveError(null); }} />
                  </div>
                ) : null;
              })()}
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

      {signatureSavedNotice && (
        <div role="status" className="mb-3 border border-[#C5D9D2] bg-[#F3F9F7] px-4 py-3 text-sm text-[#145C51]">
          {signatureSavedNotice}
        </div>
      )}
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

        {listError ? (
          <div role="alert" className="space-y-3 px-5 py-7 text-sm text-[#682037]">
            <p>{listError}</p>
            <button type="button" onClick={() => void loadTemplateList()}
              className="border border-[#890022] px-4 py-2 font-semibold text-[#890022]">Retry list</button>
          </div>
        ) : listLoading ? (
          <div role="status" className="flex items-center gap-2 px-5 py-7 text-sm text-[#66565A]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading saved template names…
          </div>
        ) : templates.length === 0 ? (
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
                      {isEditing ? "Currently selected" : "Select Edit to load full template"}
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
                      disabled={listLoading || isDefault || setDefaultKey !== null}
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
