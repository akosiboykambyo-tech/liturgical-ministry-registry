"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ebGaramond, inter } from "@/app/fonts";
import { ShieldCheck } from "@/components/phosphor-icons";
import { useAuth } from "@/lib/auth-context";

/** No role or a temporarily unavailable authorization service.
 * Never guesses a finance role or silently grants registry privileges.
 */
export default function AccessPendingPage() {
  const { signOut } = useAuth();
  const router = useRouter();
  return <main className={inter.className + " flex min-h-screen items-center justify-center bg-[#FBF9F9] px-4 text-[#1E1114]"}>
    <section role="alert" className="w-full max-w-lg border border-[#E6DADC] border-t-4 border-t-[#890022] bg-white p-6 sm:p-8">
      <ShieldCheck size={30} className="text-[#890022]" aria-hidden="true"/>
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.15em] text-[#890022]">COWL-DOK ACCESS</p>
      <h1 className={ebGaramond.className + " mt-2 text-[38px] leading-tight"}>Role approval required</h1>
      <p className="mt-3 text-sm leading-6 text-[#5F4A4F]">
        This sign-in is valid, but COWL-DOK could not establish a currently approved
        Registry, COWL financial, or Curia financial assignment. No operational
        pages or financial records are available through this account.
      </p>
      <p className="mt-3 text-sm leading-6 text-[#5F4A4F]">
        Ask the designated diocesan administrator to verify or activate your assignment.
        Financial roles require explicit appointment and may be revoked.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/admin" className="border border-[#D7CACC] px-4 py-2 text-sm font-semibold text-[#890022]">Check access again</Link>
        <button type="button" onClick={async () => { await signOut(); router.replace("/admin"); }}
          className="bg-[#890022] px-4 py-2 text-sm font-semibold text-white">Sign out</button>
      </div>
    </section>
  </main>;
}
