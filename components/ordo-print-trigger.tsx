"use client";

import { Printer } from "@/components/phosphor-icons";

export function OrdoPrintTrigger({ language }: { language: "en" | "tl" }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[3px] bg-[#970E24] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#75081B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#970E24]"
    >
      <Printer className="h-[18px] w-[18px]" aria-hidden="true" />
      {language === "tl" ? "I-print / I-save bilang PDF" : "Print / Save as PDF"}
    </button>
  );
}
