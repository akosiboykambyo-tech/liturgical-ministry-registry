"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Loader2, ShieldCheck } from "@/components/phosphor-icons";
import { ebGaramond, inter } from "@/app/fonts";
import { getFinancialStagingClient } from "@/lib/financial-stewardship/staging-client";
import { getStagingWorkspaces, WORKSPACES, type FinancialWorkspace } from "@/lib/financial-stewardship/staging-workspaces";

const STAGING_URL = "https://rtptybxugjhvpfjvcvgw.supabase.co";

export function isFinancialStaging() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL === STAGING_URL;
}

function InstitutionalLogo() {
  return <Image src="/images/Asset_1.svg" alt="Roman Catholic Diocese of Kalookan — Diocesan Commission on Worship and Liturgy" width={430} height={113} className="h-auto w-full max-w-[390px] object-contain" priority />;
}

export function StagingAuthShell({ children }: { children: React.ReactNode }) {
  return <main className={inter.className + " min-h-screen bg-[color:var(--registry-page)] text-[color:var(--registry-ink)]"}>
    <div className="grid min-h-screen lg:grid-cols-[minmax(320px,40%)_minmax(0,1fr)]">
      <aside className="relative flex min-h-[205px] flex-col overflow-hidden bg-[color:var(--registry-oxblood)] px-6 pb-7 pt-9 text-white sm:px-10 lg:min-h-screen lg:px-12 lg:pt-14">
        <div className="relative z-10">
          <p className={ebGaramond.className + " text-[16px] italic leading-tight text-[color:var(--registry-pale-rose)] sm:text-lg"}>
            Diocesan Commission on Worship &amp; Liturgy
          </p>
          <p className={ebGaramond.className + " mt-1 text-[48px] font-medium leading-[0.95] sm:text-[60px] lg:text-[64px]"}>
            COWL-DOK Portal
          </p>
          <p className="mt-5 text-sm text-[color:var(--registry-pale-rose)]">One secure sign-in. Your assigned role determines your workspace.</p>
        </div>

      </aside>
      <section className="flex min-w-0 flex-col px-6 pb-12 pt-5 sm:px-12 lg:px-12 lg:pt-9">
        <Link href="/demo/finance" className="inline-flex w-fit items-center gap-1.5 text-[14px] font-semibold text-[color:var(--registry-teal)] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--registry-teal)]">
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" /> Financial Stewardship demonstration
        </Link>
        <div className="flex flex-1 items-center justify-center py-8 lg:py-10">
          <div className="w-full max-w-[440px]">
            <div className="mb-8 space-y-4">
              <InstitutionalLogo/>
              <p className={ebGaramond.className + " text-2xl leading-tight text-[color:var(--registry-ink)]"}>Liturgical Ministry Registry</p>
            </div>
            {children}
            <p className="mt-7 text-center text-xs text-[color:var(--registry-muted)]">Fictional financial data only. No actual funds, receipts or production records.</p>
          </div>
        </div>
      </section>
    </div>
  </main>;
}

const field = "h-14 w-full rounded-none border border-[color:var(--finance-control-border)] bg-white px-4 text-base text-[color:var(--registry-ink)] outline-none transition placeholder:text-[color:var(--registry-muted)] focus:border-[color:var(--registry-button)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--registry-crimson)_15%,transparent)] disabled:cursor-not-allowed disabled:bg-[color:var(--registry-page)]";
const button = "flex h-14 w-full items-center justify-center gap-2 rounded-none bg-[color:var(--registry-button)] px-5 text-base font-semibold text-white transition hover:bg-[color:var(--registry-oxblood)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--registry-button)] disabled:cursor-not-allowed disabled:bg-[color:var(--registry-hairline)] disabled:text-[color:var(--registry-muted)]";

export function StagingPortalLogin() {
  const client = useMemo(() => getFinancialStagingClient(), []);
  const router = useRouter();
  const inFlight = useRef(false);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [workspaces, setWorkspaces] = useState<FinancialWorkspace[]>([]);

  const evaluateUser = async () => {
    if (!client) { setError("Test authentication is not configured."); setLoading(false); return; }
    const { data, error: authError } = await client.auth.getUser();
    if (authError || !data.user) {
      setWorkspaces([]); setSignedIn(false); setLoading(false); return;
    }
    try {
      const choices = await getStagingWorkspaces(client, data.user.id);
      setSignedIn(true);
      setWorkspaces(choices);
      if (choices.length === 1) router.replace(WORKSPACES[choices[0]].path);
    } catch {
      setError("Your access permissions could not be verified. Please try again.");
      setSignedIn(true);
      setWorkspaces([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    if (!client) { setLoading(false); return; }
    void client.auth.getUser().then(async ({ data, error }) => {
      if (!active) return;
      if (!error && data.user) await evaluateUser();
      else setLoading(false);
    });
    return () => { active = false; };
  // Recheck after sign-in below rather than responding to auth token-refresh events.
  }, [client]);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!client || submitting || inFlight.current) return;
    inFlight.current = true; setSubmitting(true); setError(null);
    const { error: authError } = await client.auth.signInWithPassword({email:email.trim(),password});
    setPassword("");
    if (authError) {
      setError(/rate.?limit|too many|429/i.test(authError.message)
        ? "Too many attempts. Please allow the authentication limit to clear before trying again."
        : "We could not sign you in. Check your test account credentials and try again.");
    } else {
      await evaluateUser();
    }
    setSubmitting(false); inFlight.current = false;
  };
  const signOut = async () => {
    if (!client) return;
    await client.auth.signOut();
    setSignedIn(false); setWorkspaces([]); setError(null); setEmail(""); setPassword("");
  };

  return <StagingAuthShell>
    {loading ? <div role="status" className="flex items-center gap-3 text-[color:var(--registry-crimson)]">
      <Loader2 className="h-5 w-5 animate-spin" /> Verifying staging identity…
    </div> : signedIn ? <>
      <ShieldCheck className="h-8 w-8 text-[color:var(--registry-crimson)]" />
      <h1 className={ebGaramond.className + " mt-3 text-4xl"}>{workspaces.length ? "Select your workspace" : "Role approval required"}</h1>
      {workspaces.length ? <p className="mt-3 text-sm leading-6 text-[color:var(--registry-muted)]">You have access to more than one authorized workspace.</p>
        : <p className="mt-3 text-sm leading-6 text-[color:var(--registry-muted)]">Your test identity is authenticated, but no active financial workspace permission is available. Ask the office to review your role assignment.</p>}
      <div className="mt-6 space-y-3">{workspaces.map(key =>
        <Link key={key} href={WORKSPACES[key].path} className={button}>{WORKSPACES[key].label}</Link>)}
      </div>
      {error && <p className="mt-4 text-sm text-[color:var(--registry-error)]" role="alert">{error}</p>}
      <button onClick={() => void signOut()} className="mt-6 text-sm font-semibold text-[color:var(--registry-teal)] underline">Sign out / use another account</button>
    </> : <>
      <h1 className={ebGaramond.className + " text-[44px] font-medium leading-none text-[color:var(--registry-ink)] sm:text-[48px]"}>Sign in</h1>
      <p className="mt-3 text-sm text-[color:var(--registry-muted)]">DEMONSTRATION ONLY — sign in with a designated TEST account.</p>
      {error && <div role="alert" className="mt-6 flex items-start gap-3 border border-[color:var(--registry-error)] bg-[color:var(--finance-error-surface)] px-4 py-3 text-sm leading-6 text-[color:var(--registry-error)]">
        <AlertCircle aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />{error}</div>}
      <form className="mt-8 space-y-5" onSubmit={signIn}>
        <div className="space-y-2">
          <label htmlFor="unified-email" className="block text-sm font-semibold text-[color:var(--registry-ink)]">Email</label>
          <input id="unified-email" name="email" className={field} type="email"
            autoComplete="username" placeholder="Enter your email" required disabled={submitting}
            value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="unified-password" className="text-sm font-semibold text-[color:var(--registry-ink)]">Password</label>
            <span className="text-xs text-[color:var(--registry-muted)]">Use your TEST account only</span>
          </div>
          <div className="relative">
            <input id="unified-password" name="password"
              className={field + " py-3 pl-4 pr-20"} type={showPassword ? "text" : "password"}
              autoComplete="current-password" placeholder="Enter your password" required
              disabled={submitting} value={password} onChange={e => setPassword(e.target.value)}/>
            <button type="button" onClick={() => setShowPassword(x => !x)} disabled={submitting}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 flex min-w-16 items-center justify-center px-3 text-sm font-semibold text-[color:var(--registry-crimson)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--registry-button)] disabled:opacity-50">
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        <button className={button} type="submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? <><Loader2 aria-hidden="true" className="h-5 w-5 animate-spin"/> Signing in…</> : "Sign in"}
        </button>
      </form>
    </>}
  </StagingAuthShell>;
}
