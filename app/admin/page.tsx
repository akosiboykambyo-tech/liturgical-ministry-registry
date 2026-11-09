"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { AlertCircle, ArrowLeft, Loader2 } from "@/components/phosphor-icons";
import { useAuth } from "@/lib/auth-context";
import { ebGaramond, inter } from "@/app/fonts";

const SUPPORT_EMAIL = "help@cowl-dok.online";

// Crop the coat of arms from the existing wide identity artwork.
// The SVG itself remains unchanged in /public/images/Asset_1.svg.
function DiocesanCoat() {
  return (
    <svg viewBox="705 0 277 230" width="36" height="34" role="img" aria-label="Diocesan coat of arms" className="shrink-0 overflow-hidden">
      <image href="/images/Asset_1.svg" x="0" y="0" width="1686.95" height="444.5" />
    </svg>
  );
}

const GENERIC_ERROR =
  "We could not sign you in. Check your email and password, then try again.";

export default function AdminLoginPage() {
  const { signIn, session, loading } = useAuth();
  const router = useRouter();
  const inFlight = useRef(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);

  useEffect(() => {
    if (!loading && session) router.replace("/admin/dashboard");
  }, [loading, session, router]);

  const busy = loading || submitting || Boolean(session);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current || busy || rateLimited) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);

    try {
      const result = await signIn(email.trim(), password);
      if (result.error) {
        const throttled = /too many|rate.?limit|over_request_rate_limit|429|security purposes.*seconds|temporarily blocked/i.test(result.error);
        setRateLimited(throttled);
        setError(
          throttled
            ? "Too many sign-in attempts. For your security, sign in is temporarily paused. Please try again later."
            : GENERIC_ERROR
        );
      }
    } catch {
      setError("We could not complete sign-in right now. Please try again later.");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

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
          <Link href="/" className="inline-flex w-fit items-center gap-1.5 text-[14px] font-semibold text-[#0B5C5A] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B5C5A]">
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" /> Back to the public site
          </Link>
          <div className="flex flex-1 items-center justify-center py-8 lg:py-10">
            <div className="w-full max-w-[440px]">
              <div className="mb-6 flex items-center gap-2.5">
                <DiocesanCoat />
                <p className={`${ebGaramond.className} text-[19px] leading-tight text-[#1E1114]`}>Liturgical Ministry Registry</p>
              </div>

            <h1 className={`${ebGaramond.className} text-[44px] font-medium leading-none text-[#1E1114] sm:text-[48px]`}>Sign in</h1>
            <p className="mt-3 text-sm text-[#706167]">Authorized Head Office access only.</p>

            {rateLimited && error && (
              <div role="alert" className="mt-6 flex items-start gap-3 border border-[#B42330] bg-[#FFF0F0] px-4 py-3 text-sm leading-6 text-[#92202A]">
                <AlertCircle aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div className="space-y-2">
                <label htmlFor="admin-email" className="block text-sm font-semibold text-[#302428]">Email</label>
                <input
                  id="admin-email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={busy || rateLimited}
                  required
                  autoComplete="username"
                  placeholder="Enter your email"
                  className="h-14 w-full rounded-none border border-[#CDBFC3] bg-white px-4 text-base text-[#271C20] outline-none transition placeholder:text-[#8D8184] focus:border-[#890022] focus:ring-2 focus:ring-[#890022]/15 disabled:cursor-not-allowed disabled:bg-[#F0ECEC]"
                />
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="admin-password" className="text-sm font-semibold text-[#302428]">Password</label>
                  <Link href="/admin/forgot-password" className="text-xs font-semibold text-[#0B5C5A] underline-offset-4 hover:underline">Forgot your password?</Link>
                </div>
                <div className="relative">
                  <input
                    id="admin-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={busy || rateLimited}
                    required
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    className="h-14 w-full rounded-none border border-[#CDBFC3] bg-white py-3 pl-4 pr-20 text-base text-[#271C20] outline-none transition placeholder:text-[#8D8184] focus:border-[#890022] focus:ring-2 focus:ring-[#890022]/15 disabled:cursor-not-allowed disabled:bg-[#F0ECEC]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    disabled={busy || rateLimited}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 flex min-w-16 items-center justify-center px-3 text-sm font-semibold text-[#890022] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#890022] disabled:opacity-50"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {error && !rateLimited && (
                <div role="alert" className="flex items-start gap-3 border border-[#B42330] bg-[#FFF0F0] px-4 py-3 text-sm leading-6 text-[#92202A]">
                  <AlertCircle aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={busy || rateLimited}
                aria-busy={submitting}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-none bg-[#890022] px-5 text-base font-semibold text-white transition hover:bg-[#70001B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#890022] disabled:cursor-not-allowed disabled:bg-[#D9CFD1] disabled:text-[#6F6366]"
              >
                {submitting ? <><Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" /> Signing in…</> : rateLimited ? "Sign in is paused" : "Sign in"}
              </button>
            </form>
            {rateLimited ? (
              <div className="mt-5 space-y-3 text-sm leading-6 text-[#706167]">
                <p>
                  You can <Link href="/admin/forgot-password" className="font-semibold text-[#0B5C5A] underline underline-offset-2">reset your password</Link> now, or write to{" "}
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-[#0B5C5A] underline underline-offset-2">{SUPPORT_EMAIL}</a>.
                </p>
                <p className="text-xs">Once the restriction has expired, reload this page to try again. The authentication service determines when sign-in is available.</p>
              </div>
            ) : (
              <p className="mt-7 text-center text-xs leading-6 text-[#706167]">
                Problems signing in?{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-[#0B5C5A] underline">Write to {SUPPORT_EMAIL}</a>
              </p>
            )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
