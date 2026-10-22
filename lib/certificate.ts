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


/** Wait for the stylesheets' actual font faces before measuring or exporting text. */
async function ensureFontsLoaded(settings: CertificateTemplateSettings): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  if (settings.recipient_font_url && settings.recipient_font_name) {
    const family = settings.recipient_font_name;
    try {
      if (!document.fonts.check(`16px "${family}"`)) {
        const customFont = new FontFace(family, `url("${settings.recipient_font_url}")`);
        await customFont.load();
        document.fonts.add(customFont);
      }
    } catch {
      throw new Error("The uploaded recipient font could not be loaded. PDF generation was stopped to prevent incorrect typography.");
    }
  }
  const stacks = new Set<string>([
    settings.font_family || "Georgia, serif",
    ...(settings.elements ?? []).map((element) => element.font_family || settings.font_family || "Georgia, serif"),
  ]);
  await Promise.all(Array.from(stacks).map(async (family) => {
    try {
      // Load regular and bold faces used by the canvas renderer.
      await Promise.all([
        document.fonts.load(`16px ${family}`),
        document.fonts.load(`bold 16px ${family}`),
      ]);
    } catch {
      // Unavailable font faces fall back to the corresponding system font stack.
    }
  }));
}

function drawDefaultBackground(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number) {
  const grad = ctx.createLinearGradient(0, 0, 0, canvasH);
  grad.addColorStop(0, "#fff5f6");
  grad.addColorStop(1, "#ffe8eb");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.strokeStyle = "#b8071a";
  ctx.lineWidth = 3;
  ctx.strokeRect(20, 20, canvasW - 40, canvasH - 40);
  ctx.strokeStyle = "#e85461";
  ctx.lineWidth = 1;
  ctx.strokeRect(28, 28, canvasW - 56, canvasH - 56);
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

export async function renderCertificate(
  canvas: HTMLCanvasElement,
  data: CertificateData,
  settings: CertificateTemplateSettings,
  signatories: Signatory[] = [],
  scale = 1
): Promise<void> {
  await ensureFontsLoaded(settings);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Certificate canvas is unavailable.");
  const canvasW = settings.canvas_width || 600;
  const canvasH = settings.canvas_height || 850;
  canvas.width = Math.round(canvasW * scale);
  canvas.height = Math.round(canvasH * scale);
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

            ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
            ctx.fillStyle = element.color || "#0f172a";
            ctx.textBaseline = "middle";
            ctx.textAlign = alignment as CanvasTextAlign;

drawWrappedText(
  ctx,
  value,
  element.width,
  element.height,
  alignment
);
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
            ctx.drawImage(img, 0, 0, canvasW, canvasH);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = dataUrl;
        });
      } else {
        drawDefaultBackground(ctx, canvasW, canvasH);
      }
    } catch {
      drawDefaultBackground(ctx, canvasW, canvasH);
    }
  } else {
    drawDefaultBackground(ctx, canvasW, canvasH);
  }

  await drawOverlay();
}

export function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}


/** Print-ready PDF honoring the saved paper size and orientation. */
export async function downloadCertificateAsPdf(
  data: CertificateData,
  settings: CertificateTemplateSettings,
  signatories: Signatory[],
  filename: string
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const canvas = document.createElement("canvas");
  const canvasW = settings.canvas_width || 600;
  const paperSize = settings.paper_size === "letter" ? "letter" : "a4";
  const orientation = settings.orientation === "landscape" ? "landscape" : "portrait";
  const pageW = paperSize === "a4" ? (orientation === "portrait" ? 210 : 297) : (orientation === "portrait" ? 215.9 : 279.4);
  const pageH = paperSize === "a4" ? (orientation === "portrait" ? 297 : 210) : (orientation === "portrait" ? 279.4 : 215.9);
  const scale = (pageW / 25.4 * 300) / canvasW;
  await renderCertificate(canvas, data, settings, signatories, scale);
  const pdf = new jsPDF({ orientation, unit: "mm", format: paperSize, compress: true });
  const imageData = canvas.toDataURL("image/jpeg", 0.96);
  pdf.addImage(imageData, "JPEG", 0, 0, pageW, pageH);
  pdf.save(filename.replace(/\.(png|jpg|jpeg)$/i, ".pdf"));
}
