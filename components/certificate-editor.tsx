"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
} from "lucide-react";
import { DYNAMIC_SIGNATORY_SLOT, resolveCertificateSignatory } from "@/lib/certificate";
import { FONT_OPTIONS } from "@/lib/constants";
import type {
  CertificateElement,
  CertificateTemplateSettings,
  Signatory,
} from "@/lib/types";

type PreviewMember = {
  firstName: string;
  lastName: string;
  parish: string;
  ministry: string;
  uid: string;
  liturgicalYear: string;
};

type CertificateEditorProps = {
  settings: CertificateTemplateSettings;
  onChange: (settings: CertificateTemplateSettings) => void;
  previewMember?: PreviewMember;
  signatories?: Signatory[];
};

// Ministry names must match the official registry values exactly.
// Do not populate this list from signatories: legacy labels (e.g. "Lector")
// would otherwise become selectable and break exact signatory matching.
const OFFICIAL_MINISTRIES = [
  "Ministry of Lectors and Commentators",
  "Extraordinary Ministers of Holy Communion",
  "Ministry of Greeters and Collectors",
  "Mother Butler Guild",
  "Ministry of Altar Servers",
  "Ministry of Liturgical Music",
] as const;


function elementLabel(element: CertificateElement) {
  switch (element.type) {
    case "member_name":
      return "Member Name";
    case "parish":
      return "Parish";
    case "ministry":
      return "Ministry";
    case "liturgical_year":
      return "Liturgical Year";
    case "uid":
      return "UID";
    case "qr":
      return "QR Code";
    case "image":
      return "Image";
    case "signatory":
      return element.signatory_id === DYNAMIC_SIGNATORY_SLOT ? "Dynamic Ministry Signatory" : "Signatory";
    default:
      return element.text || "Text";
  }
}

function elementValue(
  element: CertificateElement,
  member: PreviewMember
) {
  switch (element.type) {
    case "member_name":
      return `${member.firstName} ${member.lastName}`;
    case "parish":
      return member.parish;
    case "ministry":
      return member.ministry;
    case "liturgical_year":
      return `Liturgical Year ${member.liturgicalYear}`;
    case "uid":
      return `UID: ${member.uid}`;
    case "text":
      return element.text || "Text";
    default:
      return "";
  }
}

export function CertificateEditor({
  settings,
  onChange,
  previewMember = {
    firstName: "Juan",
    lastName: "Dela Cruz",
    parish: "St. Joseph Parish",
    ministry: "Ministry of Lectors and Commentators",
    uid: "LMD-2026-TQ2B-P3Z9-9BQC",
    liturgicalYear: settings.liturgical_year,
  },
  signatories = [],
}: CertificateEditorProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasW = settings.canvas_width || 600;
  const canvasH = settings.canvas_height || 850;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [canvasScale, setCanvasScale] = useState(1);
  const [previewMinistry, setPreviewMinistry] = useState("");
  // Use only official names; invalid sample values must not leak into the menu.
  const initialPreviewMinistry = OFFICIAL_MINISTRIES.find(
    (ministry) => ministry === previewMember.ministry.trim()
  ) ?? OFFICIAL_MINISTRIES[0];
  const activePreviewMinistry = OFFICIAL_MINISTRIES.find(
    (ministry) => ministry === previewMinistry
  ) ?? initialPreviewMinistry;
  const currentPreview = { ...previewMember, ministry: activePreviewMinistry };

  const selectedElement = useMemo(
    () =>
      settings.elements.find((element) => element.id === selectedId) ?? null,
    [settings.elements, selectedId]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateScale = () => {
      const width = canvas.clientWidth;
      setCanvasScale(width > 0 ? Math.min(1, width / canvasW) : 1);
    };

    updateScale();

    const observer = new ResizeObserver(updateScale);
    observer.observe(canvas);

    return () => observer.disconnect();
  }, [canvasW, canvasH]);

  const updateElement = (
    id: string,
    updates: Partial<CertificateElement>
  ) => {
    onChange({
      ...settings,
      elements: settings.elements.map((element) =>
        element.id === id ? { ...element, ...updates } : element
      ),
    });
  };

  const createElement = (
  type: CertificateElement["type"],
  signatoryId?: string
): CertificateElement => {
    const id = `${type}-${Date.now()}`;

    const base: CertificateElement = {
      id,
      type,
      x: 300,
      y: 200,
      width: 520,
      height: 40,
      font_family: "Georgia, serif",
      font_size: 16,
      font_weight: "normal",
      text_align: "center",
      color: "#0f172a",
      z_index: Math.max(
        0,
        ...settings.elements.map((element) => element.z_index ?? 0)
      ) + 1,
      locked: false,
      visible: true,
    };

    switch (type) {
      case "text":
        return {
          ...base,
          text: "New Text",
        };

      case "member_name":
        return {
          ...base,
          y: 340,
          font_size: 20,
          font_weight: "bold",
        };

      case "parish":
        return {
          ...base,
          y: 395,
          font_size: 14,
        };

      case "ministry":
        return {
          ...base,
          y: 430,
          font_size: 14,
        };

      case "liturgical_year":
        return {
          ...base,
          y: 470,
          font_size: 16,
          font_weight: "bold",
          color: "#890022",
        };

      case "uid":
        return {
          ...base,
          y: 800,
          font_size: 11,
        };

      case "qr":
        return {
          ...base,
          x: 460,
          y: 740,
          width: 90,
          height: 90,
        };

      case "image":
        return {
          ...base,
          x: 100,
          y: 100,
          width: 180,
          height: 120,
        };

      case "signatory":
  return {
    ...base,
    x: 300,
    y: 680,
    width: 180,
    height: 90,
    signatory_id: signatoryId,
  };
    }
  };

  const addElement = (
  type: CertificateElement["type"],
  signatoryId?: string
) => {
    const element = createElement(type, signatoryId);

    onChange({
      ...settings,
      elements: [...settings.elements, element],
    });

    setSelectedId(element.id);
  };
  const deleteElement = (id: string) => {
    const element = settings.elements.find((item) => item.id === id);

    if (!element || element.locked) return;

    onChange({
      ...settings,
      elements: settings.elements.filter((item) => item.id !== id),
    });

    setSelectedId(null);
  };

  const duplicateElement = (id: string) => {
    const element = settings.elements.find((item) => item.id === id);

    if (!element) return;

    const duplicate: CertificateElement = {
      ...element,
      id: `${element.id}-copy-${Date.now()}`,
      x: Math.min(canvasW, element.x + 20),
      y: Math.min(canvasH, element.y + 20),
      z_index: (element.z_index ?? 0) + 1,
      locked: false,
    };

    onChange({
      ...settings,
      elements: [...settings.elements, duplicate],
    });

    setSelectedId(duplicate.id);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedId) return;

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();

      if (
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target?.isContentEditable
      ) {
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        const element = settings.elements.find(
          (item) => item.id === selectedId
        );

        if (!element || element.locked) return;

        event.preventDefault();
        deleteElement(selectedId);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedId, settings]);

  const handlePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    element: CertificateElement
  ) => {
    if (element.locked) return;

    event.preventDefault();
    event.stopPropagation();

    setSelectedId(element.id);
    setDraggingId(element.id);

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvasW / rect.width;
    const scaleY = canvasH / rect.height;

    const startPointerX = event.clientX;
    const startPointerY = event.clientY;
    const startX = element.x;
    const startY = element.y;

    const handleMove = (moveEvent: PointerEvent) => {
      const deltaX = (moveEvent.clientX - startPointerX) * scaleX;
      const deltaY = (moveEvent.clientY - startPointerY) * scaleY;

      updateElement(element.id, {
        x: Math.max(
          0,
          Math.min(canvasW, Math.round(startX + deltaX))
        ),
        y: Math.max(
          0,
          Math.min(canvasH, Math.round(startY + deltaY))
        ),
      });
    };

    const handleUp = () => {
      setDraggingId(null);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const renderElement = (element: CertificateElement) => {
    const isSelected = selectedId === element.id;
    const isDragging = draggingId === element.id;

    const commonStyle: React.CSSProperties = {
      position: "absolute",
      left: `${element.x}px`,
      top: `${element.y}px`,
      width: `${element.width}px`,
      height: `${element.height}px`,
      transform: `translate(-50%, -50%) rotate(${element.rotation ?? 0}deg)`,
      transformOrigin: "center",
      zIndex: element.z_index ?? 0,
      opacity: element.opacity ?? 1,
      boxSizing: "border-box",
      cursor: element.locked
        ? "default"
        : isDragging
          ? "grabbing"
          : "grab",
      userSelect: "none",
    };

    const selectionStyle: React.CSSProperties = isSelected
      ? {
          outline: "2px solid #890022",
          outlineOffset: "2px",
        }
      : {};

    if (element.type === "qr") {
      return (
        <div
          key={element.id}
          style={{ ...commonStyle, ...selectionStyle }}
          onPointerDown={(event) => handlePointerDown(event, element)}
          onClick={(event) => {
            event.stopPropagation();
            setSelectedId(element.id);
          }}
          className="flex items-center justify-center border border-zinc-300 bg-white"
          aria-label="QR code element"
        >
          <div className="grid grid-cols-7 gap-0.5 p-2">
            {Array.from({ length: 49 }).map((_, index) => (
              <span
                key={index}
                className={
                  (index * 17 + 3) % 5 < 2
                    ? "h-1.5 w-1.5 bg-zinc-900"
                    : "h-1.5 w-1.5 bg-white"
                }
              />
            ))}
          </div>
        </div>
      );
    }

    if (element.type === "image") {
      return (
        <div
          key={element.id}
          style={{ ...commonStyle, ...selectionStyle }}
          onPointerDown={(event) => handlePointerDown(event, element)}
          onClick={(event) => {
            event.stopPropagation();
            setSelectedId(element.id);
          }}
          className="flex items-center justify-center overflow-hidden border border-dashed border-zinc-400 bg-zinc-100/70 text-[10px] text-zinc-500"
        >
          {element.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={element.image_url}
              alt=""
              className="pointer-events-none h-full w-full object-contain"
            />
          ) : (
            "IMAGE"
          )}
        </div>
      );
    }

    if (element.type === "signatory") {
      const signatory = resolveCertificateSignatory(
        element.signatory_id, signatories, activePreviewMinistry
      );

      if (!signatory) {
        return (
          <div
            key={element.id}
            style={{
              ...commonStyle,
              ...selectionStyle,
            }}
            onPointerDown={(event) => handlePointerDown(event, element)}
            onClick={(event) => {
              event.stopPropagation();
              setSelectedId(element.id);
            }}
            className="flex items-center justify-center border border-dashed border-zinc-400 bg-white/20 text-xs text-muted-foreground"
          >
            {element.signatory_id === DYNAMIC_SIGNATORY_SLOT ? `Dynamic ministry signatory: ${activePreviewMinistry || "choose a ministry"} (no unique active match)` : "No matching active signatory"}
          </div>
        );
      }

      return (
        <div
          key={element.id}
          style={{
            ...commonStyle,
            ...selectionStyle,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            textAlign: element.text_align || "center",
            overflow: "hidden",
            padding: "4px 8px",
          }}
          onPointerDown={(event) => handlePointerDown(event, element)}
          onClick={(event) => {
            event.stopPropagation();
            setSelectedId(element.id);
          }}
        >
          <div style={{ width: "100%", height: "50%", flexShrink: 0, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            {signatory.signature_url ? (
              <img
                src={signatory.signature_url}
                alt=""
                draggable={false}
                style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "center bottom" }}
              />
            ) : (
              <span style={{ fontSize: 10, color: "#71717a" }}>Signature</span>
            )}
          </div>
          <div style={{ width: "100%", marginTop: 5, fontFamily: element.font_family || "Georgia, serif", fontSize: element.font_size || 12, fontWeight: element.font_weight || "bold", color: element.color || "#0f172a", lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {signatory.name}
          </div>
          <div style={{ width: "100%", marginTop: 3, fontFamily: element.font_family || "Georgia, serif", fontSize: Math.max(8, (element.font_size || 12) - 2), color: "#71717a", lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {signatory.title}
          </div>
        </div>
      );
    }

    return (
      <div
        key={element.id}
        style={{
          ...commonStyle,
          ...selectionStyle,
          fontFamily: element.font_family || "Georgia, serif",
          fontSize: element.font_size || 14,
          fontWeight: element.font_weight || "normal",
          fontStyle: element.font_style || "normal",
          fontVariant: (element.text_case ?? (element.type === "member_name" ? settings.recipient_text_case : undefined)) === "small-caps" ? "small-caps" : "normal",
          textTransform: (element.text_case ?? (element.type === "member_name" ? settings.recipient_text_case : undefined)) === "uppercase" ? "uppercase" : "none",
          color: element.color || "#0f172a",
          textAlign: element.text_align || "center",
          overflow: "hidden",
          whiteSpace: "pre-wrap",
          overflowWrap: "break-word",
          wordBreak: "break-word",
          display: "flex",
          alignItems: "center",
          justifyContent:
            element.text_align === "left"
              ? "flex-start"
              : element.text_align === "right"
                ? "flex-end"
                : "center",
          padding: "2px 4px",
        }}
        onPointerDown={(event) => handlePointerDown(event, element)}
        onClick={(event) => {
          event.stopPropagation();
          setSelectedId(element.id);
        }}
      >
        {elementValue(element, currentPreview)}
      </div>
    );
  };

console.log("CERTIFICATE ELEMENTS:", settings.elements);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Visual Canvas</h3>
            <p className="text-xs text-muted-foreground">
              Select and drag elements directly on the certificate.
            </p>
          </div>
          <span className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground">
            {canvasW} × {canvasH}
          </span>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-background p-2">
          <label htmlFor="preview-ministry" className="text-xs font-medium">Preview ministry</label>
          <select
            id="preview-ministry"
            value={activePreviewMinistry}
            onChange={(event) => setPreviewMinistry(event.target.value)}
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs"
          >
            {OFFICIAL_MINISTRIES.map((ministry) => (
              <option key={ministry} value={ministry}>{ministry}</option>
            ))}
          </select>
          <p className="w-full text-[11px] text-muted-foreground">Preview only — does not change saved certificate positions.</p>
        </div>

        <div className="mb-3 rounded-md border border-border bg-background p-2">
          <div className="mb-2 text-[11px] font-medium text-muted-foreground">
            Add Element
          </div>

                    <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["text", "Text"],
                ["member_name", "Member Name"],
                ["parish", "Parish"],
                ["ministry", "Ministry"],
                ["liturgical_year", "Liturgical Year"],
                ["uid", "UID"],
                ["qr", "QR Code"],
                ["image", "Image"],
              ] as const
            ).map(([type, label]) => (
              <button
                key={type}
                type="button"
                onClick={() => addElement(type)}
                className="rounded-md border border-input bg-background px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted transition-colors"
              >
                + {label}
              </button>
            ))}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              defaultValue=""
              onChange={(event) => {
                const id = event.target.value;
                if (!id) return;
                addElement("signatory", id);
                event.currentTarget.value = "";
              }}
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-[11px]"
              aria-label="Add static signatory"
            >
              <option value="">+ Add Static Signatory</option>
              {signatories.filter((item) => item.is_active && item.display_type === "static")
                .map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <button
              type="button"
              onClick={() => addElement("signatory", DYNAMIC_SIGNATORY_SLOT)}
              className="rounded-md border border-input bg-background px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted"
            >
              + Add Dynamic Signatory
            </button>
          </div>
        </div>

        <div className="flex justify-center overflow-auto">
          <div
            ref={canvasRef}
            className="relative w-full overflow-hidden bg-white shadow-md"
            style={{
              aspectRatio: `${canvasW} / ${canvasH}`,
              maxWidth: `${canvasW}px`,
            }}
            onPointerDown={() => setSelectedId(null)}
          >
            <div
              className="absolute left-0 top-0 origin-top-left"
              style={{
                width: `${canvasW}px`,
                height: `${canvasH}px`,
                transform: `scale(${canvasScale})`,
                backgroundImage: settings.template_url
                  ? `url("${settings.template_url}")`
                  : "linear-gradient(to bottom, #F8F1F3, #F1E8EA)",
                backgroundSize: "100% 100%",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
              }}
            >
              {!settings.template_url && (
                <div className="pointer-events-none absolute inset-0 border-[3px] border-[#890022]/50" />
              )}

              {settings.elements
                .filter((element) => element.visible !== false)
                .slice()
                .sort(
                  (a, b) => (a.z_index ?? 0) - (b.z_index ?? 0)
                )
                .map(renderElement)}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Selected Element</h3>

        {!selectedElement ? (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Click an element on the certificate to select it. You can then
            move it by dragging.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Element
              </p>
              <p className="mt-1 text-sm font-semibold">
                {elementLabel(selectedElement)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[11px] text-muted-foreground">X</span>
                <input
                  type="number"
                  value={Math.round(selectedElement.x)}
                  disabled={selectedElement.locked}
                  onChange={(event) =>
                    updateElement(selectedElement.id, {
                      x: Number(event.target.value),
                    })
                  }
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Y</span>
                <input
                  type="number"
                  value={Math.round(selectedElement.y)}
                  disabled={selectedElement.locked}
                  onChange={(event) =>
                    updateElement(selectedElement.id, {
                      y: Number(event.target.value),
                    })
                  }
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] text-muted-foreground">
                  Width
                </span>
                <input
                  type="number"
                  value={Math.round(selectedElement.width)}
                  disabled={selectedElement.locked}
                  onChange={(event) =>
                    updateElement(selectedElement.id, {
                      width: Math.max(1, Number(event.target.value)),
                    })
                  }
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] text-muted-foreground">
                  Height
                </span>
                <input
                  type="number"
                  value={Math.round(selectedElement.height)}
                  disabled={selectedElement.locked}
                  onChange={(event) =>
                    updateElement(selectedElement.id, {
                      height: Math.max(1, Number(event.target.value)),
                    })
                  }
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                />
              </label>
            </div>

            {(selectedElement.type === "signatory" ||
  selectedElement.type === "text" ||
  selectedElement.type === "member_name" ||
  selectedElement.type === "parish" ||
  selectedElement.type === "ministry" ||
  selectedElement.type === "liturgical_year" ||
  selectedElement.type === "uid") && (
              <>

    <div className="space-y-1.5">
      <span className="text-[11px] text-muted-foreground">
        Text Alignment
      </span>

      <div className="grid grid-cols-4 gap-1">
        {(
          [
            ["left", "Left", AlignLeft],
            ["center", "Center", AlignCenter],
            ["right", "Right", AlignRight],
            ["justify", "Justify", AlignJustify],
          ] as const
        ).map(([alignment, label, Icon]) => (
          <button
            key={alignment}
            type="button"
            disabled={selectedElement.locked}
            onClick={() =>
              updateElement(selectedElement.id, {
                text_align: alignment,
              })
            }
            className={`inline-flex items-center justify-center rounded-md border px-2 py-1.5 text-xs transition-colors ${
              selectedElement.text_align === alignment
                ? "border-[#890022] bg-[#890022] text-white"
                : "border-input bg-background hover:bg-muted"
            } disabled:cursor-not-allowed disabled:opacity-50`}
            title={label}
            aria-label={label}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    </div>

                <label className="block space-y-1.5">
                  <span className="text-[11px] text-muted-foreground">Font Family</span>
                  <select
                    value={(() => {
                      const family = selectedElement.font_family || settings.font_family || "Georgia, serif";
                      if (selectedElement.type === "member_name" &&
                          settings.recipient_font_url && family === settings.recipient_font_family) {
                        return "__uploaded_recipient__";
                      }
                      return FONT_OPTIONS.some((font) => font.value === family) ? family : "__custom__";
                    })()}
                    disabled={selectedElement.locked}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === "__custom__") return;
                      updateElement(selectedElement.id, {
                        font_family: value === "__uploaded_recipient__"
                          ? settings.recipient_font_family || "Georgia, serif"
                          : value,
                      });
                    }}
                    className="w-full rounded-none border border-[#D9CDD1] bg-white px-2.5 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#890022]/30 disabled:opacity-50"
                  >
                    {FONT_OPTIONS.map((font) => (
                      <option key={font.label} value={font.value}>{font.label}</option>
                    ))}
                    {selectedElement.type === "member_name" && settings.recipient_font_url && (
                      <option value="__uploaded_recipient__">Uploaded recipient font</option>
                    )}
                    <option value="__custom__">Custom font stack / existing font</option>
                  </select>
                </label>
                {!FONT_OPTIONS.some((font) =>
                  font.value === (selectedElement.font_family || settings.font_family || "Georgia, serif")
                ) && !(selectedElement.type === "member_name" && settings.recipient_font_url &&
                  selectedElement.font_family === settings.recipient_font_family) && (
                  <label className="block space-y-1">
                    <span className="text-[11px] text-muted-foreground">
                      Custom font stack
                    </span>
                    <input
                      type="text"
                      value={selectedElement.font_family || settings.font_family || "Georgia, serif"}
                      disabled={selectedElement.locked}
                      onChange={(event) => updateElement(selectedElement.id, {
                        font_family: event.target.value,
                      })}
                      className="w-full rounded-none border border-[#D9CDD1] bg-white px-2.5 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#890022]/30 disabled:opacity-50"
                    />
                  </label>
                )}
                <details className="group text-[11px] text-muted-foreground">
                  <summary className="cursor-pointer text-[#682037]">Advanced: enter a custom font stack</summary>
                  <input
                    type="text"
                    aria-label="Custom font stack"
                    value={selectedElement.font_family || settings.font_family || "Georgia, serif"}
                    disabled={selectedElement.locked}
                    onChange={(event) => updateElement(selectedElement.id, { font_family: event.target.value })}
                    className="mt-2 w-full rounded-none border border-[#D9CDD1] bg-white px-2.5 py-2 text-xs text-foreground"
                  />
                </details>
                <label className="block space-y-1">
                  <span className="text-[11px] text-muted-foreground">Capitalization</span>
                  <select
                    value={selectedElement.text_case ?? (selectedElement.type === "member_name" ? settings.recipient_text_case : undefined) ?? "normal"}
                    disabled={selectedElement.locked}
                    onChange={(event) => updateElement(selectedElement.id, {
                      text_case: event.target.value as "normal" | "uppercase" | "small-caps",
                    })}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                  >
                    <option value="normal">Normal case</option>
                    <option value="uppercase">ALL CAPS</option>
                    <option value="small-caps">Small Caps</option>
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">
                      Size
                    </span>
                    <input
                      type="number"
                      value={selectedElement.font_size || 14}
                      disabled={selectedElement.locked}
                      onChange={(event) =>
                        updateElement(selectedElement.id, {
                          font_size: Math.max(
                            1,
                            Number(event.target.value)
                          ),
                        })
                      }
                      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">
                      Color
                    </span>
                    <input
                      type="text"
                      value={selectedElement.color || "#0f172a"}
                      disabled={selectedElement.locked}
                      onChange={(event) =>
                        updateElement(selectedElement.id, {
                          color: event.target.value,
                        })
                      }
                      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                    />
                  </label>
                </div>

                {selectedElement.type === "text" && (
                  <label className="block space-y-1">
                    <span className="text-[11px] text-muted-foreground">
                      Text
                    </span>
                    <textarea
                      value={selectedElement.text || ""}
                      disabled={selectedElement.locked}
                      onChange={(event) =>
                        updateElement(selectedElement.id, {
                          text: event.target.value,
                        })
                      }
                      rows={3}
                      className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                    />
                  </label>
                )}
              </>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <span className="text-xs text-muted-foreground shrink-0">
                {selectedElement.locked ? "Locked" : "Unlocked"}
              </span>

              <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() =>
                    updateElement(selectedElement.id, {
                      locked: !selectedElement.locked,
                    })
                  }
                  className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  {selectedElement.locked ? "Unlock" : "Lock"}
                </button>

                <button
                  type="button"
                  onClick={() => duplicateElement(selectedElement.id)}
                  className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  Duplicate
                </button>

                <button
                  type="button"
                  onClick={() => deleteElement(selectedElement.id)}
                  disabled={selectedElement.locked}
                  className="rounded-md border border-[#C9A5AF] bg-white px-2.5 py-1.5 text-xs font-medium text-[#890022] hover:bg-[#F8F1F3] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}