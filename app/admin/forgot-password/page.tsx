"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2 } from "@/components/phosphor-icons";
import { AdminAuthShell, AuthError, authPrimaryButtonClass, authSecondaryButtonClass, authInputClass } from "@/components/admin-auth-ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ebGaramond } from "@/app/fonts";

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
    <AdminAuthShell showSupport>
              {submitted ? (
                <>
                  <CheckCircle2 aria-hidden="true" className="mb-4 h-7 w-7 text-[#0B5C5A]" />
                  <h1 className={`${ebGaramond.className} text-[44px] font-medium leading-[1.1] text-[#1E1114] sm:text-[48px]`}>Check your email</h1>
                  <p className="mt-3 text-sm leading-6 text-[#706167]">
                    If that address matches an authorized staff account, a password setup link is on its way.
                  </p>
                  <p className="mt-5 border border-[#E6DADC] bg-white px-4 py-4 text-sm leading-6 text-[#706167]">
                    Nothing there? Check your spam folder. You can return to sign in or contact the Commission for assistance.
                  </p>
                  <Link href="/admin" className={authSecondaryButtonClass + " mt-6"}>
                    Back to sign in
                  </Link>
                </>
              ) : (
                <>
                  <h1 className={`${ebGaramond.className} text-[44px] font-medium leading-[1.1] text-[#1E1114] sm:text-[48px]`}>Reset your password</h1>
                  <p className="mt-3 text-sm leading-6 text-[#706167]">
                    Enter your email. If it matches an authorized staff account, we will send you a secure link to create or reset your password.
                  </p>

                  {error && (
                    <AuthError className="mt-6">{error}</AuthError>
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
                        className={authInputClass}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={sending}
                      aria-busy={sending}
                      className={authPrimaryButtonClass}
                    >
                      {sending ? <><Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" /> Sending…</> : "Send reset link"}
                    </button>
                  </form>
                  <Link href="/admin" className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0B5C5A] underline-offset-4 hover:underline">
                    <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" /> Back to sign in
                  </Link>
                </>
              )}

    </AdminAuthShell>
  );
}
