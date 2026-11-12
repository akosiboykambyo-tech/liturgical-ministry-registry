"use client";

import type { ReactNode } from "react";
import { ebGaramond } from "@/app/fonts";
import { History, Loader2, RefreshCw } from "@/components/phosphor-icons";

type AdminHistoryPanelProps = {
  title: string;
  description: string;
  refreshing: boolean;
  onRefresh: () => void;
  children: ReactNode;
};

/**
 * Shared Registration workspace history layout. Matches the square white
 * panels, crimson accent and action styling used across the admin interface.
 */
export function AdminHistoryPanel({
  title,
  description,
  refreshing,
  onRefresh,
  children,
}: AdminHistoryPanelProps) {
  return (
    <section className="min-w-0 border border-[#E6DADC] border-t-[3px] border-t-[#890022] bg-white p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className={ebGaramond.className + " text-[30px] font-medium leading-tight text-[#27191D]"}>
            {title}
          </h3>
          <p className="mt-1 text-sm leading-6 text-[#5F4A4F]">{description}</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label={`Refresh ${title.toLowerCase()}`}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start border border-[#E6DADC] bg-white px-4 py-2 text-sm font-semibold text-[#890022] transition-colors hover:border-[#970E24] hover:bg-[#FBF3F4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#970E24] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </button>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function AdminHistoryEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center border border-dashed border-[#E6DADC] bg-white px-4 py-10 text-center">
      <History className="h-10 w-10 text-[#A79BA0]" aria-hidden="true" />
      <p className="mt-3 text-sm font-medium text-[#35262D]">{title}</p>
      <p className="mt-1 max-w-md text-xs leading-5 text-[#66575C]">{description}</p>
    </div>
  );
}

export function AdminHistoryLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center gap-2 text-sm text-[#5F4A4F]" role="status">
      <Loader2 className="h-5 w-5 animate-spin text-[#890022]" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
