"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ebGaramond } from "@/app/fonts";

type MaintenanceSetting = {
  enabled: boolean;
  message: string;
  expected_back: string | null;
};

const DEFAULT_MESSAGE = "The registry is being updated.";

function normalizeMaintenance(value: unknown): MaintenanceSetting {
  if (!value || typeof value !== "object") {
    return {
      enabled: false,
      message: DEFAULT_MESSAGE,
      expected_back: null,
    };
  }

  const record = value as Record<string, unknown>;

  return {
    enabled: record.enabled === true,
    message:
      typeof record.message === "string" && record.message.trim()
        ? record.message.trim()
        : DEFAULT_MESSAGE,
    expected_back:
      typeof record.expected_back === "string" && record.expected_back
        ? record.expected_back
        : null,
  };
}

function formatExpectedBack(value: string | null) {
  if (!value) return "To be confirmed";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "To be confirmed";

  return parsed.toLocaleString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PublicMaintenanceGate({ children }: { children: ReactNode }) {
  const [setting, setSetting] = useState<MaintenanceSetting | null>(null);
  const [lastChecked, setLastChecked] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLastChecked(
        new Date().toLocaleString("en-PH", {
          month: "long",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      );

      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "public_maintenance")
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        setSetting({
          enabled: false,
          message: DEFAULT_MESSAGE,
          expected_back: null,
        });
        return;
      }

      setSetting(normalizeMaintenance(data.value));
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!setting) {
    return <div className="min-h-screen bg-[#FBF9F9]" />;
  }

  if (!setting.enabled) return <>{children}</>;

  return (
    <div className="min-h-screen bg-[#FBF9F9] text-[#1E1114]">
      <header className="border-b border-[#E6DADC] bg-[#FBF9F9]">
        <div className="mx-auto flex min-h-[96px] w-full max-w-[1120px] items-center px-6 py-4 sm:px-8 lg:px-0">
          <Image
            src="/images/Asset_1.svg"
            alt="Roman Catholic Diocese of Kalookan — Diocesan Commission on Worship & Liturgy"
            width={460}
            height={120}
            priority
            className="h-auto w-[300px] max-w-[72vw] sm:w-[390px] lg:w-[430px]"
          />
        </div>
      </header>

      <main>
        <section className="bg-[#890022] text-white">
          <div className="mx-auto w-full max-w-[1120px] px-6 py-16 sm:px-8 lg:px-0 lg:py-20">
            <p className={`${ebGaramond.className} text-[30px] font-normal italic leading-tight text-[#F3C6D0] sm:text-[36px]`}>
              One moment,
            </p>
            <h1 className={`${ebGaramond.className} mt-1 max-w-[900px] text-[52px] font-medium leading-[0.98] tracking-[-0.03em] sm:text-[68px] lg:text-[84px]`}>
              the registry is being updated.
            </h1>

            <p className="mt-7 max-w-[620px] text-[17px] leading-8 text-white/90">
              {setting.message}
            </p>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-8 min-h-14 rounded-[3px] bg-[#3A0010] px-7 text-[16px] font-semibold text-white"
            >
              Try again
            </button>
          </div>
        </section>

        <section>
          <div className="mx-auto w-full max-w-[1120px] px-6 py-12 sm:px-8 lg:px-0 lg:py-16">
            <h2 className={`${ebGaramond.className} text-[36px] font-medium sm:text-[44px]`}>
              Status
            </h2>

            <dl className="mt-6 max-w-[760px] border-t border-[#E6DADC]">
              <div className="grid gap-2 border-b border-[#E6DADC] py-4 sm:grid-cols-[180px_1fr]">
                <dt className={`${ebGaramond.className} text-[18px] font-normal italic text-[#5F4A4F]`}>
                  Expected back
                </dt>
                <dd className="text-[16px] font-medium">
                  {formatExpectedBack(setting.expected_back)}
                </dd>
              </div>
              <div className="grid gap-2 border-b border-[#E6DADC] py-4 sm:grid-cols-[180px_1fr]">
                <dt className={`${ebGaramond.className} text-[18px] font-normal italic text-[#5F4A4F]`}>
                  Last checked
                </dt>
                <dd className="text-[16px] font-medium">{lastChecked}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="bg-[#3A0010] text-white">
          <div className="mx-auto w-full max-w-[1120px] px-6 py-9 sm:px-8 lg:px-0">
            <p className="text-[16px] leading-7 text-[#EBCDD5]">
              Need an urgent registry check? Email{" "}
              <a
                href="mailto:help@cowl-dok.online"
                className="font-semibold text-white underline underline-offset-4"
              >
                help@cowl-dok.online
              </a>.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
