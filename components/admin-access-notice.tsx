import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ebGaramond, inter } from "@/app/fonts";
import { ArrowLeft, ShieldAlert } from "@/components/phosphor-icons";

type AdminAccessNoticeProps = {
  title: string;
  description: string;
  children?: ReactNode;
  actions: ReactNode;
};

function DiocesanCoat() {
  return (
    <svg
      viewBox="705 0 277 230"
      width="36"
      height="34"
      role="img"
      aria-label="Diocesan coat of arms"
      className="shrink-0 overflow-hidden"
    >
      <image href="/images/Asset_1.svg" x="0" y="0" width="1686.95" height="444.5" />
    </svg>
  );
}

/**
 * Shared authentication-style shell for denied/unavailable admin access.
 * Mirrors the sign-in and password-recovery pages. It presents a status;
 * access decisions remain exclusively in the existing authorization logic.
 */
export function AdminAccessNotice({
  title,
  description,
  children,
  actions,
}: AdminAccessNoticeProps) {
  return (
    <main className={inter.className + " min-h-screen bg-[#FBF9F9] text-[#271C20]"}>
      <div className="grid min-h-screen lg:grid-cols-[minmax(320px,42%)_minmax(0,1fr)]">
        <aside className="relative flex min-h-[205px] flex-col overflow-hidden bg-[#890022] px-6 pb-7 pt-9 text-white sm:px-10 lg:min-h-screen lg:px-12 lg:pt-14">
          <div className="relative z-10">
            <p className={ebGaramond.className + " text-[16px] italic leading-tight text-white/90 sm:text-lg"}>
              Diocesan Commission on Worship &amp; Liturgy
            </p>
            <p className={ebGaramond.className + " mt-1 text-[48px] font-medium leading-[0.95] sm:text-[60px] lg:text-[64px]"}>
              COWL-DOK Portal
            </p>
          </div>
          <Image
            src="/images/church-facade-placeholder.svg"
            alt=""
            aria-hidden="true"
            width={900}
            height={1000}
            priority
            className="pointer-events-none absolute bottom-[-95px] left-1/2 h-[330px] w-auto max-w-none -translate-x-1/2 object-contain opacity-40 sm:bottom-[-120px] sm:h-[410px] lg:bottom-[-4%] lg:h-[65%]"
          />
        </aside>

        <section aria-labelledby="admin-access-title" className="flex min-w-0 flex-col px-6 pb-12 pt-5 sm:px-12 lg:px-12 lg:pt-9">
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-1.5 text-[14px] font-semibold text-[#0B5C5A] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B5C5A]"
          >
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" /> Back to the public site
          </Link>

          <div className="flex flex-1 items-center justify-center py-8 lg:py-10">
            <div className="w-full max-w-[440px]">
              <div className="mb-6 flex items-center gap-2.5">
                <DiocesanCoat />
                <p className={ebGaramond.className + " text-[19px] leading-tight text-[#1E1114]"}>
                  Liturgical Ministry Registry
                </p>
              </div>

              <ShieldAlert aria-hidden="true" className="mb-4 h-7 w-7 text-[#890022]" />
              <h1
                id="admin-access-title"
                className={ebGaramond.className + " text-[44px] font-medium leading-[1.1] text-[#1E1114] sm:text-[48px]"}
              >
                {title}
              </h1>
              <p className="mt-3 text-sm leading-6 text-[#706167]">{description}</p>
              {children}

              <div className="mt-7 space-y-3">{actions}</div>

              <p className="mt-8 text-xs leading-6 text-[#706167]">
                Need assistance?{" "}
                <a
                  href="mailto:help@cowl-dok.online"
                  className="font-semibold text-[#0B5C5A] underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B5C5A]"
                >
                  help@cowl-dok.online
                </a>
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

/** Reuse the 56px controls from the existing sign-in and password-reset pages. */
export const adminAccessPrimaryAction =
  "inline-flex h-14 w-full items-center justify-center rounded-none bg-[#890022] px-5 text-base font-semibold text-white transition-colors hover:bg-[#70001B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#890022] disabled:cursor-not-allowed disabled:bg-[#D9CFD1] disabled:text-[#6F6366]";

export const adminAccessSecondaryAction =
  "inline-flex h-14 w-full items-center justify-center rounded-none border border-[#890022] bg-white px-5 text-sm font-semibold text-[#890022] transition-colors hover:bg-[#890022]/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#890022]";
