"use client";

import { Suspense } from "react";
import { ebGaramond } from "@/app/fonts";
import { PublicMaintenanceGate } from "@/components/public-maintenance-gate";
import { PublicReportForm } from "@/components/public-report-form";
import { RegistryFooter } from "@/components/registry-footer";
import { RegistryHeader } from "@/components/registry-header";

export default function ReportPage() {
  return (
    <PublicMaintenanceGate>
      <div className="min-h-screen bg-[#FBF9F9] text-[#1E1114]">
        <RegistryHeader />

        <main>
          <section className="bg-[#890022] text-white">
            <div className="mx-auto w-full max-w-[1120px] px-6 py-14 sm:px-8 lg:px-0">
              <p className={`${ebGaramond.className} text-[30px] font-normal italic text-[#F3C6D0]`}>
                Reach out
              </p>
              <h1 className={`${ebGaramond.className} mt-1 text-[52px] font-medium leading-none sm:text-[68px]`}>
                inquiries &amp; concerns.
              </h1>
              <p className="mt-5 max-w-[650px] text-[17px] leading-8 text-white/90">
                Ask about renewal procedures, request liturgical assistance or vestments,
                report an incident, or correct a registry record.
              </p>
            </div>
          </section>

          <section className="mx-auto w-full max-w-[1120px] px-6 py-12 sm:px-8 lg:px-0 lg:py-16">
            <Suspense fallback={<div className="min-h-[420px]" />}>
              <PublicReportForm />
            </Suspense>
          </section>
        </main>

        <RegistryFooter />
      </div>
    </PublicMaintenanceGate>
  );
}
