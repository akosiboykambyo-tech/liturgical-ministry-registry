"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "@/components/phosphor-icons";
import { AdminAuthShell, AuthError } from "@/components/admin-auth-ui";
import { useAuth } from "@/lib/auth-context";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { staffLandingRoute, type RegistryStaffCheck } from "@/lib/staff-entry-routing";
import { ebGaramond } from "@/app/fonts";

const SUPPORT_EMAIL = "help@cowl-dok.online";

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
    if (loading || !session?.access_token) return;
    let cancelled = false;
    const token = session.access_token;
    void (async () => {
      try {
        const registry = await getSupabaseBrowserClient().rpc("registration_is_admin");
        if (cancelled) return;
        const registryCheck: RegistryStaffCheck =
          registry.error ? "unavailable" : registry.data === true ? "granted" : "denied";
        if (registry.data === true && !registry.error) {
          router.replace("/admin/dashboard");
          return;
        }
        // Use a verified server role check, not client-provided metadata.
        const reply = await fetch("/api/financial-stewardship/access?workspace=all", {
          headers: { Authorization: "Bearer " + token }, cache: "no-store",
        });
        const data = await reply.json() as { home?: string | null; access?: { cowl: string[]; curia: string[] } };
        if (cancelled) return;
        // Finance authorization is independently verified by the server.
        // Registry lookup failures must never grant Registry access, but a
        // separately approved finance user may still enter their own workspace.
        router.replace(staffLandingRoute(registryCheck, {
          status: reply.status, home: data.home, access: data.access,
        }));
      } catch {
        if (!cancelled) router.replace("/admin/access-pending?verification=unavailable");
      }
    })();
    return () => { cancelled = true; };
  }, [loading, session?.access_token, router]);

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
    <AdminAuthShell>
            <h1 className={`${ebGaramond.className} text-[44px] font-medium leading-[1.1] text-[#1E1114] sm:text-[48px]`}>Sign in</h1>
            <p className="mt-3 text-sm text-[#706167]">Authorized Registry, Commission, and Curia personnel only.</p>

            {rateLimited && error && (
              <AuthError className="mt-6">{error}</AuthError>
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
                <AuthError>{error}</AuthError>
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
            <p className="mt-5 text-center text-xs leading-6 text-[#706167]">Accepted an invitation without creating a password?{" "}<Link href="/admin/forgot-password" className="font-semibold text-[#0B5C5A] underline">Set up your password</Link>.</p>
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
    </AdminAuthShell>
  );
}
