"use client";

import QRCode from "qrcode";
import type { CertificateTemplateSettings, Signatory } from "@/lib/types";

export interface CertificateData {
  firstName: string;
  lastName: string;
  parish: string;
  ministries: string[];
  uid: string;
  liturgicalYear: string;
  verifyUrl: string;
  selectedMinistry?: string | null;
  reprintSuffix?: string;
}

export const DYNAMIC_SIGNATORY_SLOT = "__dynamic_ministry_signatory__";

const CANVAS_W = 600;
const CANVAS_H = 850;

/** A dynamic template slot resolves by certificate ministry, not by saved person ID. */
export function resolveCertificateSignatory(
  signatoryId: string | undefined,
  signatories: Signatory[],
  selectedMinistry?: string | null
): Signatory | null {
  const normalized = selectedMinistry?.trim().toLowerCase();
  const resolveDynamic = (): Signatory | null => {
    if (!normalized) return null;
    const matches = signatories.filter(
      (item) => item.is_active &&
        item.display_type === "dynamic" &&
        item.ministry?.trim().toLowerCase() === normalized
    );
    // Multiple assignments are ambiguous: never pick an arbitrary signature.
    return matches.length === 1 ? matches[0] : null;
  };

  if (signatoryId === DYNAMIC_SIGNATORY_SLOT) {
    return resolveDynamic();
  }

  // Existing saved signatory elements remain compatible.
  const anchor = signatories.find((item) => item.id === signatoryId);
  if (!anchor || !anchor.is_active) return null;
  return anchor.display_type === "dynamic" ? resolveDynamic() : anchor;
}


let fontLoadPromise: Promise<void> | null = null;

function ensureFontsLoaded(): Promise<void> {
  if (fontLoadPromise) return fontLoadPromise;
  fontLoadPromise = (async () => {
    const families = ["EB Garamond", "Montserrat", "Playfair Display"];
    await Promise.all(
      families.map(async (family) => {
        try {
          const font = new FontFace(
            family,
            `url(https://fonts.gstatic.com/s/${family.toLowerCase().replace(/ /g, "")}/v1/regular.woff2)`
          );
          await font.load();
          (document.fonts as FontFaceSet).add(font);
        } catch {
          // Font load failed; fallback to Georgia/sans-serif via CSS font stack
        }
      })
    );
    try {
      await (document.fonts as FontFaceSet).ready;
    } catch {
      // ignore
    }
  })();
  return fontLoadPromise;
}

function drawDefaultBackground(ctx: CanvasRenderingContext2D) {
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  grad.addColorStop(0, "#fff5f6");
  grad.addColorStop(1, "#ffe8eb");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.strokeStyle = "#b8071a";
  ctx.lineWidth = 3;
  ctx.strokeRect(20, 20, CANVAS_W - 40, CANVAS_H - 40);
  ctx.strokeStyle = "#e85461";
  ctx.lineWidth = 1;
  ctx.strokeRect(28, 28, CANVAS_W - 56, CANVAS_H - 56);
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
  alignment: "left" | "center" | "right" | "justify"
) {
  const maxWidth = Math.max(1, width);
  const maxHeight = Math.max(1, height);
  const lineHeight = Math.max(1, Number.parseFloat(ctx.font) * 1.2);

  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine
      ? `${currentLine} ${word}`
      : word;

    if (ctx.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    if (ctx.measureText(word).width > maxWidth) {
      let chunk = "";

      for (const character of word) {
        const testChunk = chunk + character;

        if (
          chunk &&
          ctx.measureText(testChunk).width > maxWidth
        ) {
          lines.push(chunk);
          chunk = character;
        } else {
          chunk = testChunk;
        }
      }

      currentLine = chunk;
    } else {
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  if (!lines.length) return;

  const maxLines = Math.max(
    1,
    Math.floor(maxHeight / lineHeight)
  );

  const visibleLines = lines.slice(0, maxLines);
  const totalHeight = visibleLines.length * lineHeight;
  const startY = -totalHeight / 2 + lineHeight / 2;

  for (let index = 0; index < visibleLines.length; index++) {
    const line = visibleLines[index];
    const y = startY + index * lineHeight;
    const isLastLine = index === visibleLines.length - 1;

    if (alignment === "justify" && !isLastLine) {
      const parts = line.split(" ");

      if (parts.length > 1) {
        const wordsWidth = parts.reduce(
          (total, part) => total + ctx.measureText(part).width,
          0
        );

        const gap =
          (maxWidth - wordsWidth) /
          (parts.length - 1);

        let x = -maxWidth / 2;

        ctx.textAlign = "left";

        for (const part of parts) {
          ctx.fillText(part, x, y);
          x += ctx.measureText(part).width + gap;
        }

        continue;
      }
    }

    if (alignment === "left") {
      ctx.textAlign = "left";
      ctx.fillText(line, -maxWidth / 2, y);
    } else if (alignment === "right") {
      ctx.textAlign = "right";
      ctx.fillText(line, maxWidth / 2, y);
    } else {
      ctx.textAlign = "center";
      ctx.fillText(line, 0, y);
    }
  }
}

/**
 * Draw member names without stretching glyphs: prefer a readable single line,
 * then wrap into up to three centered/aligned lines when necessary.
 */
function drawAdaptiveMemberName(
  ctx: CanvasRenderingContext2D, text: string, width: number, height: number,
  alignment: "left" | "center" | "right" | "justify",
  fontFamily: string, fontSize: number, fontWeight: string, fontStyle: string, color: string
) {
  const value = text.trim().replace(/\s+/g, " ");
  if (!value) return;
  const maxWidth = Math.max(1, width);
  const maxHeight = Math.max(1, height);
  const initialSize = Math.max(8, fontSize);
  const minSize = 8;
  const lineHeightFor = (size: number) => size * 1.2;
  const fontFor = (size: number) => `${fontStyle} ${fontWeight} ${size}px ${fontFamily}`;

  const wrapLines = (valueToWrap: string): string[] => {
    const lines: string[] = [];
    let current = "";
    for (const word of valueToWrap.split(" ")) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) { current = candidate; continue; }
      if (current) lines.push(current);
      current = "";
      let chunk = "";
      for (const character of word) {
        const next = chunk + character;
        if (chunk && ctx.measureText(next).width > maxWidth) { lines.push(chunk); chunk = character; }
        else chunk = next;
      }
      current = chunk;
    }
    if (current) lines.push(current);
    return lines;
  };

  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  // Prefer a single line and reduce the font by no more than 28% first.
  const singleLineFloor = Math.max(minSize, initialSize * 0.72);
  for (let size = initialSize; size >= singleLineFloor; size -= 0.5) {
    ctx.font = fontFor(size);
    if (ctx.measureText(value).width <= maxWidth) {
      ctx.textAlign = alignment === "justify" ? "center" : alignment;
      const x = alignment === "left" ? -maxWidth / 2 : alignment === "right" ? maxWidth / 2 : 0;
      ctx.fillText(value, x, 0);
      return;
    }
  }

  // Otherwise, use the largest size that fits the full name in up to three lines.
  for (let size = initialSize; size >= minSize; size -= 0.5) {
    ctx.font = fontFor(size);
    const lines = wrapLines(value);
    const maxLines = Math.min(3, Math.floor(maxHeight / lineHeightFor(size)));
    if (maxLines < 1 || lines.length > maxLines) continue;
    const lineHeight = lineHeightFor(size);
    const startY = -((lines.length - 1) * lineHeight) / 2;
    ctx.textAlign = alignment === "justify" ? "center" : alignment;
    for (let index = 0; index < lines.length; index++) {
      const x = alignment === "left" ? -maxWidth / 2 : alignment === "right" ? maxWidth / 2 : 0;
      ctx.fillText(lines[index], x, startY + index * lineHeight);
    }
    return;
  }

  // Extreme fallback: minimum font size, limited to the available three-line area.
  ctx.font = fontFor(minSize);
  const lines = wrapLines(value).slice(0, Math.max(1, Math.min(3, Math.floor(maxHeight / lineHeightFor(minSize)) )));
  const lineHeight = lineHeightFor(minSize);
  const startY = -((lines.length - 1) * lineHeight) / 2;
  ctx.textAlign = alignment === "justify" ? "center" : alignment;
  for (let index = 0; index < lines.length; index++) {
    const x = alignment === "left" ? -maxWidth / 2 : alignment === "right" ? maxWidth / 2 : 0;
    ctx.fillText(lines[index], x, startY + index * lineHeight);
  }
}


export async function renderCertificate(
  canvas: HTMLCanvasElement,
  data: CertificateData,
  settings: CertificateTemplateSettings,
  signatories: Signatory[] = [],
  scale = 1
): Promise<void> {
  await ensureFontsLoaded();

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Certificate canvas is unavailable.");
  canvas.width = Math.round(CANVAS_W * scale);
  canvas.height = Math.round(CANVAS_H * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  const fontFam = settings.font_family || "Georgia, serif";
  const selectedMinistry = data.selectedMinistry ?? null;
  const ministryDisplay = selectedMinistry ?? data.ministries.join(", ");
  const uidDisplay = data.reprintSuffix
    ? `${data.uid}${data.reprintSuffix}`
    : data.uid;

  const drawOverlay = async () => {
    const elements = [...(settings.elements ?? [])]
      .filter((element) => element.visible !== false)
      .sort((a, b) => (a.z_index ?? 0) - (b.z_index ?? 0));

    const loadImage = async (
  url: string
): Promise<HTMLImageElement | null> => {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();

      reader.onloadend = () => {
        resolve(reader.result as string);
      };

      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    const image = new Image();

    await new Promise<void>((resolve) => {
      image.onload = () => resolve();
      image.onerror = () => resolve();
      image.src = dataUrl;
    });

    return image.naturalWidth > 0 ? image : null;
  } catch {
    return null;
  }
};

    const getTextValue = (
      element: CertificateTemplateSettings["elements"][number]
    ): string => {
      switch (element.type) {
        case "text":
          return element.text ?? "";

        case "member_name":
          return `${data.firstName} ${data.lastName}`;

        case "parish":
          return data.parish;

        case "ministry":
          return selectedMinistry ?? data.ministries.join(", ");

        case "liturgical_year":
          return `Liturgical Year ${data.liturgicalYear}`;

        case "uid":
          return `UID: ${uidDisplay}`;

        default:
          return "";
      }
    };

    for (const element of elements) {
      ctx.save();

      ctx.globalAlpha = element.opacity ?? 1;

      if (element.rotation) {
        ctx.translate(element.x, element.y);
        ctx.rotate((element.rotation * Math.PI) / 180);
      } else {
        ctx.translate(element.x, element.y);
      }

      switch (element.type) {
        case "text":
        case "member_name":
        case "parish":
        case "ministry":
        case "liturgical_year":
        case "uid": {
          const value = getTextValue(element);

          if (value) {
            const fontFamily =
              element.font_family ||
              settings.font_family ||
              "Georgia, serif";

            const fontSize = element.font_size ?? 14;
            const fontWeight = element.font_weight ?? "normal";
            const fontStyle = element.font_style ?? "normal";
            const alignment = element.text_align ?? "center";

            if (element.type === "member_name") {
              drawAdaptiveMemberName(
                ctx, value, element.width, element.height, alignment,
                fontFamily, fontSize, fontWeight, fontStyle, element.color || "#0f172a"
              );
            } else {
              ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
              ctx.fillStyle = element.color || "#0f172a";
              ctx.textBaseline = "middle";
              ctx.textAlign = alignment as CanvasTextAlign;
              drawWrappedText(ctx, value, element.width, element.height, alignment);
            }
          }

          break;
        }

        case "qr": {
          try {
            const qrDataUrl = await QRCode.toDataURL(data.verifyUrl, {
              width: Math.max(1, Math.round(element.width)),
              margin: 1,
              color: {
                dark: "#0f172a",
                light: "#ffffff",
              },
            });

            const qrImage = await loadImage(qrDataUrl);

            if (!qrImage) {
              break;
            }

            ctx.fillStyle = "#ffffff";
            ctx.fillRect(
              -element.width / 2 - 4,
              -element.height / 2 - 4,
              element.width + 8,
              element.height + 8
            );

            ctx.drawImage(
              qrImage,
              -element.width / 2,
              -element.height / 2,
              element.width,
              element.height
            );
          } catch {
            // QR generation failed; leave the element blank.
          }

          break;
        }

        case "image": {
          if (element.image_url) {
            const image = await loadImage(element.image_url);

            if (image) {
              ctx.drawImage(
                image,
                -element.width / 2,
                -element.height / 2,
                element.width,
                element.height
              );
            }
          }

          break;
        }

        case "signatory": {
          const signatory = resolveCertificateSignatory(
            element.signatory_id, signatories, selectedMinistry
          );
          if (!signatory) break;

          const width = Math.max(1, element.width - 16);
          const height = Math.max(1, element.height - 8);
          const nameSize = element.font_size || 12;
          const titleSize = Math.max(8, nameSize - 2);
          const fontFamily = element.font_family || "Georgia, serif";
          const alignment = element.text_align || "center";
          const textX = alignment === "left" ? -width / 2 :
            alignment === "right" ? width / 2 : 0;
          ctx.textAlign = alignment === "justify" ? "center" : alignment;
          ctx.textBaseline = "middle";

          // Fixed baseline positions independent of image aspect ratio.
          const top = -height / 2;
          const titleY = height / 2 - titleSize / 2;
          const nameY = titleY - titleSize / 2 - 3 - nameSize / 2;
          const signatureBottom = nameY - nameSize / 2 - 5;
          const signatureMaxHeight = Math.max(1, signatureBottom - top);

          if (signatory.signature_url) {
            const signature = await loadImage(signatory.signature_url);
            if (signature?.naturalWidth && signature.naturalHeight) {
              const factor = Math.min(
                width / signature.naturalWidth,
                signatureMaxHeight / signature.naturalHeight
              );
              const imageWidth = signature.naturalWidth * factor;
              const imageHeight = signature.naturalHeight * factor;
              ctx.drawImage(
                signature, -imageWidth / 2,
                signatureBottom - imageHeight, imageWidth, imageHeight
              );
            }
          }

          ctx.font = `${element.font_style || "normal"} ${element.font_weight || "bold"} ${nameSize}px ${fontFamily}`;
          ctx.fillStyle = element.color || "#0f172a";
          ctx.fillText(signatory.name, textX, nameY, width);
          ctx.font = `normal ${titleSize}px ${fontFamily}`;
          ctx.fillStyle = "#71717a";
          ctx.fillText(signatory.title, textX, titleY, width);
          break;
        }
      }

      ctx.restore();
    }
  };
  // Background
  const templateUrl = settings.template_url;
  if (templateUrl) {
    try {
      const response = await fetch(templateUrl);
      if (response.ok) {
        const blob = await response.blob();
        const dataUrl: string = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        const img = new Image();
        await new Promise<void>((resolve) => {
          img.onload = () => {
            ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = dataUrl;
        });
      } else {
        drawDefaultBackground(ctx);
      }
    } catch {
      drawDefaultBackground(ctx);
    }
  } else {
    drawDefaultBackground(ctx);
  }

  await drawOverlay();
}

export function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}


/** Print-ready, A4 portrait PDF; raster elements rendered at approximately 300 DPI. */
export async function downloadCertificateAsPdf(
  data: CertificateData,
  settings: CertificateTemplateSettings,
  signatories: Signatory[],
  filename: string
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const canvas = document.createElement("canvas");
  const scale = 2480 / CANVAS_W;
  await renderCertificate(canvas, data, settings, signatories, scale);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const imageData = canvas.toDataURL("image/jpeg", 0.96);
  pdf.addImage(imageData, "JPEG", 0, 0, 210, 297);
  pdf.save(filename.replace(/\.(png|jpg|jpeg)$/i, ".pdf"));
}
