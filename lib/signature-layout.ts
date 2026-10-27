/**
 * Shared signatory geometry for the visual editor and the exported certificate.
 * Positive offsets lower the signature into the name line; 12px is the default overlap.
 * Position remains a property of the draggable certificate element, not the
 * reusable signatory record.
 */
export const DEFAULT_SIGNATURE_OFFSET = 12;
export const LEGACY_SIGNATURE_OFFSET = 4;

/**
 * 4px was the old default stored on signatory elements. A legacy 4px value
 * now means 12px; other legacy custom values are preserved. Version 2 means
 * a deliberately chosen offset, including an explicit choice of 4px.
 */
export function effectiveSignatureOffset(element: {
  signature_offset?: number;
  signature_offset_version?: 2;
}): number {
  const value = element.signature_offset;
  if (element.signature_offset_version !== 2 &&
      (value == null || value === LEGACY_SIGNATURE_OFFSET)) {
    return DEFAULT_SIGNATURE_OFFSET;
  }
  return typeof value === "number" && Number.isFinite(value)
    ? value : DEFAULT_SIGNATURE_OFFSET;
}

/** In-memory upgrade; database persistence happens only on explicit Save. */
export function upgradeSignatoryOffsets<T extends {
  type: string;
  signature_offset?: number;
  signature_offset_version?: 2;
}>(elements: T[]): T[] {
  return elements.map((element) =>
    element.type === "signatory" && element.signature_offset_version !== 2
      ? {
          ...element,
          signature_offset: effectiveSignatureOffset(element),
          signature_offset_version: 2 as const,
        }
      : element
  );
}


export function signatoryLayout(
  elementHeight: number,
  nameSize: number,
  titleSize: number,
  signatureOffset = DEFAULT_SIGNATURE_OFFSET
) {
  const contentHeight = Math.max(1, elementHeight - 8);
  const top = -contentHeight / 2;
  const titleY = contentHeight / 2 - titleSize / 2;
  const nameY = titleY - titleSize / 2 - 3 - nameSize / 2;
  const signatureBottom = nameY - nameSize / 2 + signatureOffset;
  return {
    nameY,
    titleY,
    signatureTop: top,
    signatureBottom,
    signatureMaxHeight: Math.max(1, signatureBottom - top),
  };
}

export type SignatureCrop = { x: number; y: number; width: number; height: number };

/** Determine visible signature bounds without resizing or deforming the strokes. */
export function signatureInkBounds(image: HTMLImageElement): SignatureCrop {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const fallback = { x: 0, y: 0, width, height };
  if (!width || !height) return fallback;

  try {
    const scale = Math.min(1, 1024 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return fallback;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const offset = (y * canvas.width + x) * 4;
        // Ignore transparent pixels and near-white margins, but keep soft ink.
        if (pixels[offset + 3] < 18 ||
            (pixels[offset] > 247 && pixels[offset + 1] > 247 && pixels[offset + 2] > 247)) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    if (maxX < 0) return fallback;
    const left = Math.max(0, minX - 2);
    const top = Math.max(0, minY - 2);
    const right = Math.min(canvas.width, maxX + 3);
    const bottom = Math.min(canvas.height, maxY + 3);
    const sx = width / canvas.width, sy = height / canvas.height;
    return {
      x: left * sx,
      y: top * sy,
      width: (right - left) * sx,
      height: (bottom - top) * sy,
    };
  } catch {
    // Keep the original image if browser pixel inspection is unavailable.
    return fallback;
  }
}

/** Browser-only image preparation for the editor preview, matching PDF cropping. */
export async function trimmedSignaturePreview(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Signature image unavailable");
  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Unable to decode signature"));
      image.src = objectUrl;
    });
    const crop = signatureInkBounds(image);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(crop.width));
    canvas.height = Math.max(1, Math.ceil(crop.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) return url;
    ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Per-signatory artwork positioning, independent of certificate placement. */
export type SignatureComposition = { x: number; y: number; scale: number };
export const SIGNATURE_LAYOUT_KEY_PREFIX = "certificate_signatory_layout_";
export const DEFAULT_SIGNATURE_COMPOSITION: SignatureComposition = { x: 0, y: 0, scale: 1 };

function constrain(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value)) : fallback;
}
export function normalizeSignatureComposition(value: unknown): SignatureComposition {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_SIGNATURE_COMPOSITION };
  }
  const v = value as Partial<SignatureComposition>;
  return { x: constrain(v.x, -0.45, 0.45, 0),
    y: constrain(v.y, -0.45, 0.45, 0),
    scale: constrain(v.scale, 0.4, 2.5, 1) };
}

/** Attaches layout settings to fetched signatories without altering their table. */
export function attachSignatureCompositions<
  T extends { id: string; signature_layout?: SignatureComposition }
>(items: T[], rows: { key: string; value: unknown }[]): T[] {
  const preset = new Map(rows
    .filter((row) => row.key.startsWith(SIGNATURE_LAYOUT_KEY_PREFIX))
    .map((row) => [row.key.slice(SIGNATURE_LAYOUT_KEY_PREFIX.length), normalizeSignatureComposition(row.value)]));
  return items.map((item) => {
    const layout = preset.get(item.id);
    return layout ? { ...item, signature_layout: layout } : item;
  });
}

/**
 * Shared dimensions for admin mini-canvas, certificate canvas, and PDF export.
 * X/Y are fractional shifts of the full signatory block's width/height.
 * Scaling the ink leaves name/title positions unchanged.
 */
export function signatureInkPlacement(
  blockWidth: number, blockHeight: number, nameSize: number, titleSize: number,
  imageWidth: number, imageHeight: number, offset: number,
  preset?: SignatureComposition | null
) {
  const position = normalizeSignatureComposition(preset);
  const layout = signatoryLayout(blockHeight, nameSize, titleSize, offset);
  const factor = Math.min(
    Math.max(1, blockWidth - 16) / Math.max(1, imageWidth),
    layout.signatureMaxHeight / Math.max(1, imageHeight)
  );
  const width = imageWidth * factor * position.scale;
  const height = imageHeight * factor * position.scale;
  return {
    left: -width / 2 + position.x * blockWidth,
    top: layout.signatureBottom - height + position.y * blockHeight,
    width, height,
  };
}
