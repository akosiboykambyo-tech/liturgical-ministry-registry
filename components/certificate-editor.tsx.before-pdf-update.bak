"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
} from "lucide-react";
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

const CANVAS_W = 600;
const CANVAS_H = 850;

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
      return "Signatory";
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
    ministry: "Lector",
    uid: "LMD-2026-0001",
    liturgicalYear: settings.liturgical_year,
  },
  signatories = [],
}: CertificateEditorProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [canvasScale, setCanvasScale] = useState(1);

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
      setCanvasScale(width > 0 ? Math.min(1, width / CANVAS_W) : 1);
    };

    updateScale();

    const observer = new ResizeObserver(updateScale);
    observer.observe(canvas);

    return () => observer.disconnect();
  }, []);

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
          color: "#b8071a",
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
      x: Math.min(CANVAS_W, element.x + 20),
      y: Math.min(CANVAS_H, element.y + 20),
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
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;

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
          Math.min(CANVAS_W, Math.round(startX + deltaX))
        ),
        y: Math.max(
          0,
          Math.min(CANVAS_H, Math.round(startY + deltaY))
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
          outline: "2px solid hsl(var(--primary))",
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
      const signatory = signatories.find(
        (item) => item.id === element.signatory_id
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
            Select a signatory
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
            justifyContent: "center",
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
          {signatory.signature_url ? (
            <img
              src={signatory.signature_url}
              alt=""
              draggable={false}
              style={{
                display: "block",
                width: "100%",
                maxHeight: "55%",
                objectFit: "contain",
                objectPosition: "center",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "45%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                color: "#71717a",
                borderBottom: "1px solid #d4d4d8",
              }}
            >
              Signature
            </div>
          )}

          <div
            style={{
              marginTop: 4,
              fontFamily: element.font_family || "Georgia, serif",
              fontSize: element.font_size || 12,
              fontWeight: element.font_weight || "bold",
              color: element.color || "#0f172a",
              lineHeight: 1.2,
            }}
          >
            {signatory.name}
          </div>

          <div
            style={{
              marginTop: 2,
              fontFamily: element.font_family || "Georgia, serif",
              fontSize: Math.max(8, (element.font_size || 12) - 2),
              color: "#71717a",
              lineHeight: 1.2,
            }}
          >
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
        {elementValue(element, previewMember)}
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
            600 × 850
          </span>
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

          {signatories.length > 0 && (
            <div className="mt-2">
              <select
                defaultValue=""
                onChange={(event) => {
                  const signatoryId = event.target.value;
                  if (!signatoryId) return;

                  addElement("signatory", signatoryId);
                  event.currentTarget.value = "";
                }}
                className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted transition-colors"
                aria-label="Add signatory"
              >
                <option value="">+ Add Signatory</option>
                {signatories
                  .filter((signatory) => signatory.is_active)
                  .map((signatory) => (
                    <option key={signatory.id} value={signatory.id}>
                      {signatory.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex justify-center overflow-auto">
          <div
            ref={canvasRef}
            className="relative w-full max-w-[600px] overflow-hidden bg-white shadow-md"
            style={{
              aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
            }}
            onPointerDown={() => setSelectedId(null)}
          >
            <div
              className="absolute left-0 top-0 origin-top-left"
              style={{
                width: `${CANVAS_W}px`,
                height: `${CANVAS_H}px`,
                transform: `scale(${canvasScale})`,
                backgroundImage: settings.template_url
                  ? `url("${settings.template_url}")`
                  : "linear-gradient(to bottom, #fff5f6, #ffe8eb)",
                backgroundSize: "100% 100%",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
              }}
            >
              {!settings.template_url && (
                <div className="pointer-events-none absolute inset-0 border-[3px] border-red-700/50" />
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
                ? "border-primary bg-primary text-primary-foreground"
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

                <label className="block space-y-1">
                  <span className="text-[11px] text-muted-foreground">
                    Font Family
                  </span>
                  <input
                    type="text"
                    value={
                      selectedElement.font_family || "Georgia, serif"
                    }
                    disabled={selectedElement.locked}
                    onChange={(event) =>
                      updateElement(selectedElement.id, {
                        font_family: event.target.value,
                      })
                    }
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                  />
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
                  className="rounded-md border border-destructive/30 bg-background px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-40"
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