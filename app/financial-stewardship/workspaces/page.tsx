"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ebGaramond, inter } from "@/app/fonts";
import { Bank, ShieldCheck, Wallet, ArrowRight } from "@/components/phosphor-icons";
import { useAuth } from "@/lib/auth-context";
import { financePath, type FinanceAccess } from "@/lib/financial-stewardship/access-model";

export default function FinancialWorkspaceSelectionPage() {
  const { user, session, loading } = useAuth();
  const router = useRouter();
  const [access, setAccess] = useState<FinanceAccess | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user || !session?.access_token) { router.replace("/admin"); return; }
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await fetch("/api/financial-stewardship/access?workspace=all", {
          headers: { Authorization: "Bearer " + session.access_token },
          cache: "no-store", signal: controller.signal,
        });
        const body = await result.json() as { access?: FinanceAccess; home?: string | null; error?: string };
        if (controller.signal.aborted) return;
        if (!result.ok) {
          setError(body.error ?? "Financial authorization is unavailable.");
          return;
        }
        const scope = body.access;
        if (scope?.cowl.length && scope.curia.length) {
          setAccess(scope);
        } else if (body.home) {
          router.replace(body.home);
        } else {
          router.replace("/admin/access-pending");
        }
      } catch {
        if (!controller.signal.aborted) setError("Financial authorization could not be checked.");
      }
    })();
    return () => controller.abort();
  }, [loading, user?.id, session?.access_token, router]);

  return <main className={inter.className + " flex min-h-screen items-center justify-center bg-[#FBF9F9] px-4 py-8 text-[#1E1114]"}>
    <section className="w-full max-w-3xl border border-[#E6DADC] border-t-[4px] border-t-[#890022] bg-white p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <ShieldCheck size={30} className="text-[#890022]"/>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#890022]">FINANCIAL STEWARDSHIP</p>
          <h1 className={ebGaramond.className + " mt-1 text-[38px] leading-tight"}>Choose a workspace</h1>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-[#5F4A4F]">
        Your current grants permit both Commission and Curia viewing. Select the responsibility you are performing;
        each workspace still enforces its own section permissions.
      </p>
      {error && <p role="alert" className="mt-5 border-l-4 border-[#B00020] bg-[#FBEFEF] p-4 text-sm text-[#B00020]">{error}</p>}
      {!access && !error && <p role="status" className="mt-6 text-sm text-[#5F4A4F]">Checking authorized workspaces…</p>}
      {access && <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link href={financePath("cowl", access.cowl[0])}
          className="flex min-h-[170px] flex-col border border-[#E6DADC] bg-[#FBF9F9] p-5 hover:border-[#890022] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#890022]">
          <Wallet size={24} className="text-[#890022]"/>
          <h2 className={ebGaramond.className + " mt-3 text-[27px]"}>COWL Portal</h2>
          <p className="mt-1 text-xs text-[#5F4A4F]">Commission collection, receipt, and remittance responsibilities</p>
          <ArrowRight size={18} className="mt-auto self-end text-[#890022]"/>
        </Link>
        <Link href={financePath("curia", access.curia[0])}
          className="flex min-h-[170px] flex-col border border-[#E6DADC] bg-[#FBF9F9] p-5 hover:border-[#890022] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#890022]">
          <Bank size={24} className="text-[#890022]"/>
          <h2 className={ebGaramond.className + " mt-3 text-[27px]"}>Curia Portal</h2>
          <p className="mt-1 text-xs text-[#5F4A4F]">Independent treasury and receipt custody responsibilities</p>
          <ArrowRight size={18} className="mt-auto self-end text-[#890022]"/>
        </Link>
      </div>}
    </section>
  </main>;
}
