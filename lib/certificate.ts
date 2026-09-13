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

const CANVAS_W = 600;
const CANVAS_H = 850;

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

async function drawSignatories(
  ctx: CanvasRenderingContext2D,
  signatories: Signatory[],
  selectedMinistry: string | null
): Promise<void> {
  const visible = signatories
    .filter((s) => s.is_active)
    .filter((s) => {
      if (s.display_type === "static") return true;
      return s.ministry && selectedMinistry && s.ministry === selectedMinistry;
    })
    .sort((a, b) => a.sort_order - b.sort_order);

  for (const sig of visible) {
    const sigY = sig.position_y;
    const alignment = sig.alignment ?? "left";
    const w = sig.width;
    let imgX = sig.position_x;
    let textX = sig.position_x;
    if (alignment === "center") {
      imgX = sig.position_x - w / 2;
      textX = sig.position_x;
    } else if (alignment === "right") {
      imgX = sig.position_x - w;
      textX = sig.position_x + w;
    }

    if (sig.signature_url) {
      try {
        const response = await fetch(sig.signature_url);
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
              const aspectRatio = img.height / img.width || 0.4;
              const h = w * aspectRatio;
              ctx.drawImage(img, imgX, sigY, w, h);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = dataUrl;
          });
        }
      } catch {
        // signature image failed to load
      }
    }

    const font = ctx.font;
    const fill = ctx.fillStyle;
    const align = ctx.textAlign;
    ctx.textAlign = alignment as CanvasTextAlign;
    ctx.font = "bold 12px Georgia, serif";
    ctx.fillStyle = "#0f172a";
    ctx.fillText(sig.name, textX, sigY + 50);
    ctx.font = "10px Georgia, serif";
    ctx.fillStyle = "#71717a";
    ctx.fillText(sig.title, textX, sigY + 65);
    ctx.font = font;
    ctx.fillStyle = fill;
    ctx.textAlign = align;
  }
}

export async function renderCertificate(
  canvas: HTMLCanvasElement,
  data: CertificateData,
  settings: CertificateTemplateSettings,
  signatories: Signatory[] = []
): Promise<void> {
  await ensureFontsLoaded();

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;

  const fontFam = settings.font_family || "Georgia, serif";
  const selectedMinistry = data.selectedMinistry ?? null;
  const ministryDisplay = selectedMinistry ?? data.ministries.join(", ");
  const uidDisplay = data.reprintSuffix
    ? `${data.uid}${data.reprintSuffix}`
    : data.uid;

  const drawOverlay = async () => {
    ctx.textAlign = "center";

    // Header text (customizable)
    ctx.font = `bold 24px ${fontFam}`;
    ctx.fillStyle = "#1a1a2e";
    ctx.fillText(
      settings.header_text || "CERTIFICATE OF SERVICE",
      CANVAS_W / 2,
      70
    );
    ctx.font = `italic 13px ${fontFam}`;
    ctx.fillStyle = "#71717a";
    ctx.fillText(
      "Liturgical Ministry Registry — Official Verification",
      CANVAS_W / 2,
      95
    );

    // Body text (customizable intro line)
    ctx.font = `14px ${fontFam}`;
    ctx.fillStyle = "#3f3f46";
    ctx.fillText(
      settings.body_text || "This is to certify that",
      CANVAS_W / 2,
      290
    );

    // Name
    ctx.font = `20px ${fontFam}`;
    ctx.fillStyle = "#0f172a";
    ctx.fillText(
      `${data.firstName} ${data.lastName}`,
      settings.name_x,
      settings.name_y
    );

    // Parish
    ctx.font = `14px ${fontFam}`;
    ctx.fillStyle = "#3f3f46";
    ctx.fillText(data.parish, settings.parish_x, settings.parish_y);

    // Ministry (selected or all)
    ctx.fillText(ministryDisplay, settings.ministry_x, settings.ministry_y);

    // Footer text (customizable)
    ctx.font = `italic 12px ${fontFam}`;
    ctx.fillStyle = "#52525b";
    const footerText =
      settings.footer_text ||
      "has been duly commissioned as a liturgical minister";
    ctx.fillText(footerText, CANVAS_W / 2, settings.ministry_y + 35);

    // Liturgical Year
    ctx.font = `bold 16px ${fontFam}`;
    ctx.fillStyle = "#b8071a";
    ctx.fillText(
      `Liturgical Year ${data.liturgicalYear}`,
      settings.year_x,
      settings.year_y
    );

    // UID footer with reprint suffix
    ctx.font = "11px monospace";
    ctx.fillStyle = "#71717a";
    ctx.fillText(`UID: ${uidDisplay}`, CANVAS_W / 2, CANVAS_H - 30);

    // QR code
    try {
      const qrDataUrl = await QRCode.toDataURL(data.verifyUrl, {
        width: settings.qr_size,
        margin: 1,
        color: { dark: "#0f172a", light: "#ffffff" },
      });
      const qrImg = new Image();
      await new Promise<void>((resolve, reject) => {
        qrImg.onload = () => resolve();
        qrImg.onerror = reject;
        qrImg.src = qrDataUrl;
      });
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(
        settings.qr_x - 4,
        settings.qr_y - 4,
        settings.qr_size + 8,
        settings.qr_size + 8
      );
      ctx.drawImage(
        qrImg,
        settings.qr_x,
        settings.qr_y,
        settings.qr_size,
        settings.qr_size
      );
      ctx.font = "9px sans-serif";
      ctx.fillStyle = "#71717a";
      ctx.textAlign = "center";
      ctx.fillText(
        "Scan to verify authenticity",
        settings.qr_x + settings.qr_size / 2,
        settings.qr_y + settings.qr_size + 14
      );
    } catch {
      // QR generation failed
    }

    // Signatories
    await drawSignatories(ctx, signatories, selectedMinistry);
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
