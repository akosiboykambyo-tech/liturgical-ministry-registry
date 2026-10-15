"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type RegistryHeaderProps = {
  current?: "home" | "verify";
};

const MARQUEE_SETTING_KEY = "public_marquee";
const DEFAULT_MARQUEE_TEXT =
  "ROMAN CATHOLIC DIOCESE OF KALOOKAN · Diocesan Commission on Worship & Liturgy";

type PublicMarqueeSetting = {
  enabled: boolean;
  text: string;
  expires_at: string | null;
};

function normalizeMarqueeSetting(value: unknown): PublicMarqueeSetting {
  if (!value || typeof value !== "object") {
    return { enabled: true, text: DEFAULT_MARQUEE_TEXT, expires_at: null };
  }

  const record = value as Record<string, unknown>;
  return {
    enabled: record.enabled !== false,
    text:
      typeof record.text === "string" && record.text.trim()
        ? record.text.trim()
        : DEFAULT_MARQUEE_TEXT,
    expires_at:
      typeof record.expires_at === "string" && record.expires_at
        ? record.expires_at
        : null,
  };
}

export function RegistryHeader({ current }: RegistryHeaderProps) {
  const [marquee, setMarquee] = useState<PublicMarqueeSetting>({
    enabled: true,
    text: DEFAULT_MARQUEE_TEXT,
    expires_at: null,
  });
  const [dismissed, setDismissed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", MARQUEE_SETTING_KEY)
        .maybeSingle();

      if (cancelled || error || !data) return;
      setMarquee(normalizeMarqueeSetting(data.value));
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const noticeKey = useMemo(
    () => `public-notice:${marquee.text}:${marquee.expires_at ?? "none"}`,
    [marquee.text, marquee.expires_at]
  );

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(noticeKey) === "dismissed");
    } catch {
      setDismissed(false);
    }
  }, [noticeKey]);

  const expired =
    marquee.expires_at !== null &&
    Number.isFinite(Date.parse(marquee.expires_at)) &&
    Date.now() >= Date.parse(marquee.expires_at);

  const showNotice = marquee.enabled && !expired && !dismissed;

  const dismissNotice = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(noticeKey, "dismissed");
    } catch {
      // Dismissal still works for the current page when storage is unavailable.
    }
  };

  return (
    <>
      {showNotice && (
        <div className="bg-[#3A0010] text-white">
          <div className="mx-auto flex min-h-[44px] w-full max-w-[1120px] items-center gap-5 px-6 py-2 sm:px-8 lg:px-0">
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="registry-marquee-track flex w-max items-center">
                {[0, 1, 2, 3].map((copy) => (
                  <p
                    key={copy}
                    className="shrink-0 pr-14 text-[14px] leading-6"
                    aria-hidden={copy > 0 ? "true" : undefined}
                  >
                    {marquee.text}
                  </p>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={dismissNotice}
              aria-label="Dismiss announcement"
              className="grid h-10 w-10 shrink-0 place-items-center text-white transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <header className="border-b border-[#E6DADC] bg-[#FBF9F9]">
        <div className="mx-auto flex min-h-[96px] w-full max-w-[1120px] items-center justify-between gap-6 px-6 py-4 sm:px-8 lg:px-0">
          <Link
            href="/"
            aria-label="Liturgical Ministry Registry home"
            className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#970E24]/35"
          >
            <Image
              src="/images/Asset_1.svg"
              alt="Roman Catholic Diocese of Kalookan — Diocesan Commission on Worship & Liturgy"
              width={460}
              height={120}
              priority
              className="h-auto w-[300px] max-w-[72vw] sm:w-[390px] lg:w-[430px]"
            />
          </Link>

          <nav aria-label="Primary navigation" className="hidden items-center gap-10 text-[15px] font-medium md:flex">
            <Link
              href="/how-it-works"
              className="hover:text-[#970E24] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#970E24]/30"
            >
              How it works
            </Link>
            <Link
              href="/report"
              className="hover:text-[#970E24] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#970E24]/30"
            >
              Inquiries & Concerns
            </Link>
          </nav>

          <button
            type="button"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
            className="grid h-11 w-11 shrink-0 place-items-center md:hidden"
          >
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-7 w-7" />}
          </button>
        </div>

        {menuOpen && (
          <nav aria-label="Mobile navigation" className="border-t border-[#E6DADC] px-6 py-3 md:hidden">
            <div className="mx-auto flex max-w-[1120px] flex-col text-[16px] font-medium">
              <Link href="/how-it-works" className="border-b border-[#E6DADC] py-4" onClick={() => setMenuOpen(false)}>
                How it works
              </Link>
              <Link href="/report" className="py-4" onClick={() => setMenuOpen(false)}>
                Inquiries & Concerns
              </Link>
            </div>
          </nav>
        )}
      </header>

      <style jsx global>{`
        .registry-marquee-track {
          animation: registry-marquee-scroll 38s linear infinite;
          will-change: transform;
        }

        @keyframes registry-marquee-scroll {
          to {
            transform: translateX(-25%);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .registry-marquee-track {
            width: auto;
            animation: none;
            will-change: auto;
          }

          .registry-marquee-track p[aria-hidden="true"] {
            display: none;
          }
        }
      `}</style>
    </>
  );
}
