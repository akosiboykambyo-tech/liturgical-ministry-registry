"use client";

import {
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  renderCertificate,
  downloadCanvasAsPng,
  type CertificateData,
} from "@/lib/certificate";
import type {
  CertificateTemplateSettings,
  Signatory,
} from "@/lib/types";

export interface CertificateDesignHandle {
  download: (filename: string) => Promise<void>;
  getCanvas: () => HTMLCanvasElement | null;
  render: () => Promise<HTMLCanvasElement | null>;
}

interface CertificateDesignProps {
  settings: CertificateTemplateSettings;
  data: CertificateData;
  signatories?: Signatory[];
  className?: string;
  style?: React.CSSProperties;
}

export const CertificateDesign = forwardRef<
  CertificateDesignHandle,
  CertificateDesignProps
>(({ settings, data, signatories = [], className, style }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderQueueRef = useRef<Promise<void>>(Promise.resolve());

  const queueRender = () => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return Promise.resolve();
    }

    const renderJob = renderQueueRef.current.then(async () => {
      const currentCanvas = canvasRef.current;

      if (!currentCanvas) return;

      await renderCertificate(
        currentCanvas,
        data,
        settings,
        signatories
      );
    });

    renderQueueRef.current = renderJob.catch(() => undefined);

    return renderJob;
  };

  useEffect(() => {
    void queueRender();
  }, [data, settings, signatories]);

  useImperativeHandle(ref, () => ({
    download: async (filename: string) => {
      await queueRender();

      const canvas = canvasRef.current;

      if (!canvas) return;

      downloadCanvasAsPng(canvas, filename);
    },

    render: async () => {
      await queueRender();
      return canvasRef.current;
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