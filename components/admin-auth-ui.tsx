import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, AlertCircle, Check, Circle } from "@/components/phosphor-icons";
import { ebGaramond, inter } from "@/app/fonts";

/**
 * Canonical COWL-DOK sign-in visual system. All account and exception pages
 * share the exact same hero, coat, content width and responsive spacing.
 * Does not read or change authentication state.
 */
export const authTitleClass =
  `${ebGaramond.className} text-[44px] font-medium leading-[1.1] text-[#1E1114] sm:text-[48px]`;
export const authTextClass = "mt-3 text-sm leading-6 text-[#706167]";
export const authLabelClass = "block text-sm font-semibold text-[#302428]";
export const authInputClass =
  "h-14 w-full min-w-0 rounded-none border border-[#CDBFC3] bg-white px-4 text-base text-[#271C20] outline-none transition placeholder:text-[#8D8184] focus:border-[#890022] focus:ring-2 focus:ring-[#890022]/15 disabled:cursor-not-allowed disabled:bg-[#F0ECEC]";
export const authPrimaryButtonClass =
  "flex h-14 w-full items-center justify-center gap-2 rounded-none bg-[#890022] px-5 text-base font-semibold text-white transition hover:bg-[#70001B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#890022] disabled:cursor-not-allowed disabled:bg-[#D9CFD1] disabled:text-[#6F6366]";
export const authSecondaryButtonClass =
  "flex h-14 w-full items-center justify-center gap-2 border border-[#890022] bg-white px-4 text-sm font-semibold text-[#890022] transition hover:bg-[#890022]/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#890022]";
export const authToggleClass =
  "absolute inset-y-0 right-0 flex min-w-16 items-center justify-center px-3 text-sm font-semibold text-[#890022] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#890022] disabled:opacity-50";
export const authStatusBoxClass = "mt-5 border border-[#E6DADC] bg-white px-4 py-4 text-sm leading-6 text-[#706167]";

export function AdminAuthShell({
  children, backHref = "/", backLabel = "Back to the public site", showSupport = false,
}: {
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
  showSupport?: boolean;
}) {
  return (
    <main className={`${inter.className} min-h-screen bg-[#FBF9F9] text-[#271C20]`}>
      <div className="grid min-h-screen lg:grid-cols-[minmax(320px,42%)_minmax(0,1fr)]">
        <aside className="relative flex min-h-[205px] flex-col overflow-hidden bg-[#890022] px-6 pb-7 pt-9 text-white sm:px-10 lg:min-h-screen lg:px-12 lg:pt-14">
          <div className="relative z-10">
            <p className={`${ebGaramond.className} text-[16px] italic leading-tight text-white/90 sm:text-lg`}>
              Diocesan Commission on Worship &amp; Liturgy
            </p>
            <p className={`${ebGaramond.className} mt-1 text-[48px] font-medium leading-[0.95] sm:text-[60px] lg:text-[64px]`}>
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
        <section className="flex min-w-0 flex-col px-6 pb-12 pt-5 sm:px-12 lg:px-12 lg:pt-9">
          <Link
            href={backHref}
            className="inline-flex w-fit items-center gap-1.5 text-[14px] font-semibold text-[#0B5C5A] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B5C5A]"
          >
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
            {backLabel}
          </Link>
          <div className="flex flex-1 items-center justify-center py-8 lg:py-10">
            <div className="w-full max-w-[440px] min-w-0">
              <div className="mb-6 flex items-center gap-2.5">
                <svg viewBox="705 0 277 230" width="36" height="34" role="img"
                  aria-label="Diocesan coat of arms" className="shrink-0 overflow-hidden">
                  <image href="/images/Asset_1.svg" x="0" y="0" width="1686.95" height="444.5" />
                </svg>
                <p className={`${ebGaramond.className} text-[19px] leading-tight text-[#1E1114]`}>
                  Liturgical Ministry Registry
                </p>
              </div>
              {children}
              {showSupport && (
                <p className="mt-8 text-xs leading-6 text-[#706167]">
                  Need assistance?{" "}
                  <a href="mailto:help@cowl-dok.online" className="font-semibold text-[#0B5C5A] underline underline-offset-2">
                    help@cowl-dok.online
                  </a>
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

/**
 * Shared password-request confirmation, without a decorative status icon.
 * Never disclose account existence or promise successful email delivery.
 */
export function PasswordResetEmailConfirmation() {
  return (
    <>
      <h1 className={authTitleClass}>Check your email</h1>
      <p className={authTextClass}>
        If the email address matches a staff account, a password setup link may be on its way.
      </p>
      <p className={authStatusBoxClass}>
        Check your inbox and spam folder. If you still need help, contact COWL-DOK support.
      </p>
      <div className="mt-7 space-y-3">
        <Link href="/admin" className={authPrimaryButtonClass}>Back to sign in</Link>
        <Link
          href="/admin/forgot-password"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-[#0B5C5A] underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B5C5A]"
        >
          Try another email address
        </Link>
      </div>
    </>
  );
}

export function AuthError({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div role="alert" className={`flex items-start gap-3 border border-[#B42330] bg-[#FFF0F0] px-4 py-3 text-sm leading-6 text-[#92202A] ${className}`}>
      <AlertCircle aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function AuthPasswordRules({
  rules,
}: {
  rules: readonly { label: string; passed: boolean }[];
}) {
  return (
    <div className="border border-[#E6DADC] bg-white p-4 text-sm" aria-label="Password requirements">
      <p className="mb-3 font-semibold text-[#302428]">Password requirements</p>
      <ul className="space-y-2" aria-live="polite" aria-relevant="text">
        {rules.map(rule => (
          <li key={rule.label} className={`flex items-start gap-2 ${rule.passed ? "text-[#0B5C5A]" : "text-[#706167]"}`}>
            <span aria-hidden="true" className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
              {rule.passed
                ? <Check className="h-4 w-4" strokeWidth={2.5} />
                : <Circle className="h-3.5 w-3.5 text-[#8A8588]" strokeWidth={1.5} />}
            </span>
            <span>{rule.label}<span className="sr-only"> — {rule.passed ? "met" : "not met"}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
