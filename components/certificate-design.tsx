"use client";

import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import {
  renderCertificate,
  downloadCanvasAsPng,
  type CertificateData,
} from "@/lib/certificate";
import type { CertificateTemplateSettings, Signatory } from "@/lib/types";

export interface CertificateDesignHandle {
  download: (filename: string) => Promise<void>;
  getCanvas: () => HTMLCanvasElement | null;
}

interface CertificateDesignProps {
  settings: CertificateTemplateSettings;
  data: CertificateData;
  signatories?: Signatory[];
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Single source of truth for certificate rendering.
 *
 * Both the admin template preview and the public verify-page download use
 * this component, guaranteeing the on-screen preview and the exported PNG
 * are pixel-identical — same fonts, colors, borders, text positions, and QR
 * code. The canvas is drawn by the shared `renderCertificate` engine so there
 * is never a chance for the two contexts to drift.
 */
export const CertificateDesign = forwardRef<
  CertificateDesignHandle,
  CertificateDesignProps
>(({ settings, data, signatories = [], className, style }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderCertificate(canvas, data, settings, signatories);
  }, [data, settings, signatories]);

  useImperativeHandle(ref, () => ({
    download: async (filename: string) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      await renderCertificate(canvas, data, settings, signatories);
      downloadCanvasAsPng(canvas, filename);
    },
    getCanvas: () => canvasRef.current,
  }));

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={style}
      aria-label={`Certificate for ${data.firstName} ${data.lastName}`}
    />
  );
});

CertificateDesign.displayName = "CertificateDesign";
