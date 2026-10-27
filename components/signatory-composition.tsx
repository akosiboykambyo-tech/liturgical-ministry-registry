"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { CertificateElement, CertificateTemplateSettings, Signatory, SignatureComposition } from "@/lib/types";
import {
  DEFAULT_SIGNATURE_OFFSET, DEFAULT_SIGNATURE_COMPOSITION,
  effectiveSignatureOffset, normalizeSignatureComposition,
  signatoryLayout, signatureInkPlacement, trimmedSignaturePreview,
} from "@/lib/signature-layout";

type InkAsset = { url: string; width: number; height: number };
const cache = new Map<string, Promise<InkAsset>>();
async function inkAsset(url: string): Promise<InkAsset> {
  const known = cache.get(url);
  if (known) return known;
  if (cache.size >= 24) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  const task = (async () => {
    let source = url;
    try { source = await trimmedSignaturePreview(url); } catch { /* Keep original if crop unavailable. */ }
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Signature image could not be loaded."));
      image.src = source;
    });
    return { url: source, width: image.naturalWidth, height: image.naturalHeight };
  })().catch((error: unknown) => { cache.delete(url); throw error; });
  cache.set(url, task);
  return task;
}
function useInk(url: string | null) {
  const [ink, setInk] = useState<InkAsset | null>(null);
  useEffect(() => {
    let mounted = true;
    setInk(null);
    if (url) void inkAsset(url).then((image) => { if (mounted) setInk(image); }).catch(() => {});
    return () => { mounted = false; };
  }, [url]);
  return ink;
}

/** The certificate canvas and this editor use the same geometry as PDF export. */
export function SignatoryArtwork({
  signatory, settings, element, composition,
}: {
  signatory: Signatory;
  settings: CertificateTemplateSettings;
  element: CertificateElement;
  composition?: SignatureComposition;
}) {
  const asset = useInk(signatory.signature_url);
  const nameSize = element.font_size ?? settings.signatory_font_size ?? 12;
  const titleSize = settings.signatory_title_font_size ?? Math.max(8, nameSize - 2);
  const overlap = effectiveSignatureOffset(element);
  const layout = signatoryLayout(element.height, nameSize, titleSize, overlap);
  const image = asset ? signatureInkPlacement(
    element.width, element.height, nameSize, titleSize,
    asset.width, asset.height, overlap, composition ?? signatory.signature_layout
  ) : null;
  const nameCase = element.text_case ?? settings.signatory_text_case;
  const titleCase = settings.signatory_title_text_case;
  const textBase: CSSProperties = {
    position: "absolute", left: 8, right: 8, transform: "translateY(-50%)",
    lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
    textAlign: element.text_align || "center",
  };
  const y = (position: number) => element.height / 2 + position;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {asset && image ? (
        <img alt="" src={asset.url} draggable={false} style={{
          position: "absolute", left: element.width / 2 + image.left,
          top: y(image.top), width: image.width, height: image.height,
          maxWidth: "none", maxHeight: "none",
        }} />
      ) : !signatory.signature_url ? (
        <div className="absolute left-0 top-[18%] w-full text-center text-[10px] text-zinc-500">No signature image</div>
      ) : null}
      <div style={{
        ...textBase, top: y(layout.nameY),
        fontFamily: element.font_family || settings.signatory_font_family || "Georgia, serif",
        fontSize: nameSize, fontWeight: element.font_weight || settings.signatory_font_weight || "bold",
        fontVariant: nameCase === "small-caps" ? "small-caps" : "normal",
        textTransform: nameCase === "uppercase" ? "uppercase" : "none",
        color: element.color || settings.signatory_font_color || "#0f172a",
      }}>{signatory.name}</div>
      <div style={{
        ...textBase, top: y(layout.titleY),
        fontFamily: settings.signatory_title_font_family || element.font_family || settings.signatory_font_family || "Georgia, serif",
        fontSize: titleSize, fontWeight: settings.signatory_title_font_weight || "normal",
        fontVariant: titleCase === "small-caps" ? "small-caps" : "normal",
        textTransform: titleCase === "uppercase" ? "uppercase" : "none",
        color: settings.signatory_title_color || "#71717a",
      }}>{signatory.title}</div>
    </div>
  );
}

const W = 320;
const H = 160;

export function SignatoryLayoutCanvas({
  signatory, settings, value, onChange, onSave, onCancel, saving,
}: {
  signatory: Signatory;
  settings: CertificateTemplateSettings;
  value: SignatureComposition;
  onChange: (next: SignatureComposition) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const current = normalizeSignatureComposition(value);
  const previewElement: CertificateElement = {
    id: "signatory-layout-preview", type: "signatory", x: W / 2, y: H / 2,
    width: W, height: H, font_size: settings.signatory_font_size ?? 14,
    font_family: settings.signatory_font_family || "Georgia, serif",
    font_weight: settings.signatory_font_weight || "bold", text_align: "center",
    signature_offset: DEFAULT_SIGNATURE_OFFSET, signature_offset_version: 2,
  };
  const handleStart = (event: PointerEvent<HTMLDivElement>) => {
    if (!signatory.signature_url) return;
    drag.current = { px: event.clientX, py: event.clientY, x: current.x, y: current.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const handleMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    onChange(normalizeSignatureComposition({
      ...current,
      x: drag.current.x + (event.clientX - drag.current.px) / bounds.width,
      y: drag.current.y + (event.clientY - drag.current.py) / bounds.height,
    }));
  };
  const end = () => { drag.current = null; };
  return (
    <section aria-label="Signatory Layout Canvas" className="mt-4 border border-[#D9CDD1] bg-[#FBF9F9] p-4 sm:p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-[#1E1114]">Signatory Layout Canvas</h3>
        <p className="mt-1 text-xs text-[#66565A]">Drag the handwriting independently of the printed name and title. Resize or fine-tune using the sliders.</p>
      </div>
      <div className="overflow-x-auto border border-[#E5DDDF] bg-white p-4">
        <div role="img" aria-label={`Editable signature placement for ${signatory.name}`}
          className="relative mx-auto border border-dashed border-[#C9B8BE] bg-white"
          style={{ width: W, height: H, touchAction: "none", userSelect: "none",
            cursor: signatory.signature_url ? "grab" : "default" }}
          onPointerDown={handleStart} onPointerMove={handleMove}
          onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
          <SignatoryArtwork signatory={signatory} settings={settings}
            element={previewElement} composition={current} />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-xs text-[#52212F]">
          <span>Signature size — {Math.round(current.scale * 100)}%</span>
          <input aria-label="Signature size" className="w-full accent-[#890022]" type="range"
            min={40} max={250} step={5} value={Math.round(current.scale * 100)}
            onChange={(event) => onChange({ ...current, scale: Number(event.target.value) / 100 })} />
        </label>
        <label className="space-y-1 text-xs text-[#52212F]">
          <span>Left / right</span>
          <input aria-label="Signature horizontal position" className="w-full accent-[#890022]" type="range"
            min={-45} max={45} value={Math.round(current.x * 100)}
            onChange={(event) => onChange({ ...current, x: Number(event.target.value) / 100 })} />
        </label>
        <label className="space-y-1 text-xs text-[#52212F]">
          <span>Up / down</span>
          <input aria-label="Signature vertical position" className="w-full accent-[#890022]" type="range"
            min={-45} max={45} value={Math.round(current.y * 100)}
            onChange={(event) => onChange({ ...current, y: Number(event.target.value) / 100 })} />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => onChange({ ...DEFAULT_SIGNATURE_COMPOSITION })}
          className="min-h-10 border border-[#D9CDD1] bg-white px-3 text-xs font-medium text-[#52212F]">Reset</button>
        <button type="button" onClick={onCancel}
          className="min-h-10 border border-[#D9CDD1] bg-white px-3 text-xs font-medium text-[#52212F]">Close</button>
        <button type="button" disabled={saving || !signatory.signature_url} onClick={onSave}
          className="min-h-10 bg-[#890022] px-4 text-xs font-semibold text-white disabled:opacity-50">
          {saving ? "Saving…" : "Save signature layout"}
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-[#66565A]">
        Saved artwork placement is reused for this signatory across certificate templates. The larger certificate canvas continues to control the whole block.
      </p>
    </section>
  );
}
