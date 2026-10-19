
"use client";

import {
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  renderCertificate,
  downloadCertificateAsPdf,
  type CertificateData,
} from "@/lib/certificate";
import type {
  CertificateTemplateSettings,
  Signatory,
} from "@/lib/types";

export interface CertificateDesignHandle {
  download: (
    filename: string,
    reprintSuffix?: string
  ) => Promise<void>;
  getCanvas: () => HTMLCanvasElement | null;
  render: (
    reprintSuffix?: string
  ) => Promise<HTMLCanvasElement | null>;
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

  const queueRender = (reprintSuffix?: string) => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return Promise.resolve();
    }

    const renderData: CertificateData =
      reprintSuffix === undefined
        ? data
        : {
            ...data,
            reprintSuffix,
          };

    const renderJob = renderQueueRef.current.then(async () => {
      const currentCanvas = canvasRef.current;

      if (!currentCanvas) return;

      await renderCertificate(
        currentCanvas,
        renderData,
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
    download: async (
      filename: string,
      reprintSuffix?: string
    ) => {
      await downloadCertificateAsPdf(
        { ...data, reprintSuffix: reprintSuffix ?? data.reprintSuffix },
        settings,
        signatories,
        filename
      );
    },

    render: async (reprintSuffix?: string) => {
      await queueRender(reprintSuffix);
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
