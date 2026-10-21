"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ebGaramond, inter } from "@/app/fonts";

const SUPPORT_EMAIL = "help@cowl-dok.online";

function DiocesanCoat() {
  return (
    <svg viewBox="705 0 277 230" width="36" height="34" role="img" aria-label="Diocesan coat of arms" className="shrink-0 overflow-hidden">
      <image href="/images/Asset_1.svg" x="0" y="0" width="1686.95" height="444.5" />
    </svg>
  );
}

export default function ForgotPasswordPage() {
  const inFlight = useRef(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || sending || submitted) return;
    inFlight.current = true;
    setSending(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/admin/reset-password`,
      });
      // Do not reveal whether an address belongs to an account. Supabase may
      // return different responses for unknown addresses or rate limits.
      // Technical connectivity errors are shown without revealing account status.
      if (resetError && /fetch|network|connection/i.test(resetError.message)) {
        setError("We could not connect to the email service. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("We could not process your request right now. Please try again.");
    } finally {
      setSending(false);
      inFlight.current = false;
    }
  }

  return (
    <main className={`${inter.className} min-h-screen bg-[#FBF9F9] text-[#271C20]`}>
      <div className="grid min-h-screen lg:grid-cols-[minmax(320px,42%)_minmax(0,1fr)]">
        <aside className="relative flex min-h-[205px] flex-col overflow-hidden bg-[#890022] px-6 pb-7 pt-9 text-white sm:px-10 lg:min-h-screen lg:px-12 lg:pt-14">
          <div className="relative z-10">
            <p className={`${ebGaramond.className} text-[16px] italic leading-tight text-white/90 sm:text-lg`}>
              Diocesan Commission on Worship &amp; Liturgy
            </p>
            <p className={`${ebGaramond.className} mt-1 text-[48px] font-medium leading-[0.95] sm:text-[60px] lg:text-[64px]`}>
              Admin Portal
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
          <Link href="/" className="inline-flex w-fit items-center gap-1.5 text-[12px] font-semibold text-[#0B5C5A] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B5C5A]">
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" /> Back to the public site
          </Link>
          <div className="flex flex-1 items-center justify-center py-8 lg:py-10">
            <div className="w-full max-w-[440px]">
              <div className="mb-6 flex items-center gap-2.5">
                <DiocesanCoat />
                <p className={`${ebGaramond.className} text-[19px] leading-tight text-[#1E1114]`}>Liturgical Ministry Registry</p>
              </div>

              {submitted ? (
                <>
                  <CheckCircle2 aria-hidden="true" className="mb-4 h-7 w-7 text-[#0B5C5A]" />
                  <h1 className={`${ebGaramond.className} text-[44px] font-medium leading-[1.15] text-[#1E1114] sm:text-[48px]`}>Check your email</h1>
                  <p className="mt-3 text-sm leading-6 text-[#706167]">
                    If that address matches an admin account, a password reset link is on its way.
                  </p>
                  <p className="mt-5 border border-[#E6DADC] bg-white px-4 py-4 text-sm leading-6 text-[#706167]">
                    Nothing there? Check your spam folder. You can return to sign in or contact the Commission for assistance.
                  </p>
                  <Link href="/admin" className="mt-6 flex h-14 w-full items-center justify-center border border-[#890022] text-sm font-semibold text-[#890022] transition hover:bg-[#890022]/5">
                    Back to sign in
                  </Link>
                </>
              ) : (
                <>
                  <h1 className={`${ebGaramond.className} text-[44px] font-medium leading-[1.15] text-[#1E1114] sm:text-[48px]`}>Reset your password</h1>
                  <p className="mt-3 text-sm leading-6 text-[#706167]">
                    Enter your email. If it matches an admin account, we will send you a link to reset the password.
                  </p>

                  {error && (
                    <div role="alert" className="mt-6 flex items-start gap-3 border border-[#B42330] bg-[#FFF0F0] px-4 py-3 text-sm leading-6 text-[#92202A]">
                      <AlertCircle aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="mt-7 space-y-5">
                    <div className="space-y-2">
                      <label htmlFor="reset-email" className="block text-sm font-semibold text-[#302428]">Email</label>
                      <input
                        id="reset-email"
                        name="email"
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        disabled={sending}
                        placeholder="Enter your email"
                        className="h-14 w-full rounded-none border border-[#CDBFC3] bg-white px-4 text-base text-[#271C20] outline-none transition placeholder:text-[#8D8184] focus:border-[#890022] focus:ring-2 focus:ring-[#890022]/15 disabled:cursor-not-allowed disabled:bg-[#F0ECEC]"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={sending}
                      aria-busy={sending}
                      className="flex h-14 w-full items-center justify-center gap-2 rounded-none bg-[#890022] px-5 text-base font-semibold text-white transition hover:bg-[#70001B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#890022] disabled:cursor-not-allowed disabled:bg-[#D9CFD1] disabled:text-[#6F6366]"
                    >
                      {sending ? <><Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" /> Sending…</> : "Send reset link"}
                    </button>
                  </form>
                  <Link href="/admin" className="mt-6 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0B5C5A] underline-offset-4 hover:underline">
                    <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" /> Back to sign in
                  </Link>
                </>
              )}

              <p className="mt-8 text-xs leading-6 text-[#706167]">
                Need assistance? <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-[#0B5C5A] underline">{SUPPORT_EMAIL}</a>
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
