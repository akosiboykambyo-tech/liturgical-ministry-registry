"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Pause, Play, ShieldCheck } from "lucide-react";
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
};

function normalizeMarqueeSetting(value: unknown): PublicMarqueeSetting {
  if (!value || typeof value !== "object") {
    return { enabled: true, text: DEFAULT_MARQUEE_TEXT };
  }

  const record = value as Record<string, unknown>;
  const text =
    typeof record.text === "string" && record.text.trim()
      ? record.text.trim()
      : DEFAULT_MARQUEE_TEXT;

  return {
    enabled: record.enabled !== false,
    text,
  };
}

export function RegistryHeader({ current }: RegistryHeaderProps) {
  const [paused, setPaused] = useState(false);
  const [marquee, setMarquee] = useState<PublicMarqueeSetting>({
    enabled: true,
    text: DEFAULT_MARQUEE_TEXT,
  });

  useEffect(() => {
    let cancelled = false;

    const loadMarquee = async () => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", MARQUEE_SETTING_KEY)
        .maybeSingle();

      if (cancelled || error || !data) return;

      setMarquee(normalizeMarqueeSetting(data.value));
    };

    void loadMarquee();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      {marquee.enabled && (
      <div
        className={[
          "registry-marquee relative flex items-center overflow-hidden bg-[#970e24] text-white",
          paused ? "is-paused" : "",
        ].join(" ")}
        role="region"
        aria-label="Diocesan announcement"
      >
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="registry-marquee-track flex w-max items-center">
            <p className="registry-marquee-copy">{marquee.text}</p>
            <p className="registry-marquee-copy" aria-hidden="true">
              {marquee.text}
            </p>
            <p className="registry-marquee-copy" aria-hidden="true">
              {marquee.text}
            </p>
            <p className="registry-marquee-copy" aria-hidden="true">
              {marquee.text}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setPaused((value) => !value)}
          aria-label={
            paused
              ? "Resume scrolling announcement"
              : "Pause scrolling announcement"
          }
          aria-pressed={paused}
          className="registry-marquee-toggle mr-3 grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/40 bg-transparent text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#970e24] sm:mr-5"
        >
          {paused ? (
            <Play className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Pause className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
      )}

      <header className="border-b border-border/70 bg-background">
        <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between gap-4 px-5 py-5 sm:px-7 lg:px-12">
          <Link
            href="/"
            className="min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#970e24]/30 focus-visible:ring-offset-2"
            aria-label="Liturgical Ministry Registry home"
          >
            <Image
              src="/images/Asset_1.svg"
              alt="Roman Catholic Diocese of Kalookan — Diocesan Commission on Worship & Liturgy"
              width={280}
              height={96}
              priority
              className="h-auto w-[190px] sm:w-[245px] lg:w-[280px]"
            />
          </Link>

          <nav
            aria-label="Primary navigation"
            className="flex shrink-0 items-center gap-3 text-sm font-semibold sm:gap-5"
          >
            {current === "home" && (
              <Link
                href="#how-it-works"
                className="hidden rounded-md px-1 py-2 transition-colors hover:text-[#970e24] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#970e24]/30 sm:inline-flex"
              >
                How it works
              </Link>
            )}

            {current === "verify" && (
              <Link
                href="/"
                className="hidden rounded-md px-1 py-2 transition-colors hover:text-[#970e24] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#970e24]/30 sm:inline-flex"
              >
                Home
              </Link>
            )}

            <Link
              href="/admin"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-3.5 py-2 text-sm font-semibold transition-[transform,background-color,border-color] duration-200 hover:-translate-y-0.5 hover:border-[#bd6474] hover:bg-[#faedf0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#970e24]/30 active:translate-y-0"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Admin Portal</span>
              <span className="sm:hidden">Admin</span>
            </Link>
          </nav>
        </div>
      </header>

      <style jsx global>{`
        .registry-marquee {
          min-height: 40px;
        }

        .registry-marquee-track {
          animation: registry-marquee-scroll 38s linear infinite;
          will-change: transform;
        }

        .registry-marquee-copy {
          margin: 0;
          flex: 0 0 auto;
          padding: 8px 56px 8px 24px;
          white-space: nowrap;
          font-size: 12px;
          font-weight: 600;
          line-height: 1.7;
          letter-spacing: 0.09em;
        }

        .registry-marquee.is-paused .registry-marquee-track,
        .registry-marquee:hover .registry-marquee-track,
        .registry-marquee:focus-within .registry-marquee-track {
          animation-play-state: paused;
        }

        @keyframes registry-marquee-scroll {
          to {
            transform: translateX(-25%);
          }
        }

        @media (max-width: 720px) {
          .registry-marquee {
            min-height: 36px;
          }

          .registry-marquee-copy {
            padding: 6px 52px 6px 15px;
            font-size: 11px;
            letter-spacing: 0.07em;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .registry-marquee {
            padding: 6px 15px;
          }

          .registry-marquee-track {
            width: auto;
            animation: none;
            will-change: auto;
          }

          .registry-marquee-copy {
            padding: 0;
            white-space: normal;
            font-size: 11px;
            line-height: 1.6;
            letter-spacing: 0.04em;
          }

          .registry-marquee-copy[aria-hidden="true"] {
            display: none;
          }

          .registry-marquee-toggle {
            display: none;
          }
        }
      `}</style>
    </>
  );
}
