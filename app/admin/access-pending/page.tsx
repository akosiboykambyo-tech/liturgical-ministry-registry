"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "@/components/phosphor-icons";
import { useAuth } from "@/lib/auth-context";
import {
  AdminAuthShell, AuthError, authTitleClass, authTextClass,
  authPrimaryButtonClass, authSecondaryButtonClass,
} from "@/components/admin-auth-ui";

/** A signed-in identity is not automatically assigned a financial role.
 * This page never grants access or changes authentication metadata.
 */
export default function AccessPendingPage() {
  const { signOut } = useAuth();
  const router = useRouter();

  return (
    <AdminAuthShell showSupport>
      <ShieldCheck className="mb-4 h-7 w-7 text-[#890022]" aria-hidden="true" />
      <h1 className={authTitleClass}>Role approval required</h1>
      <p className={authTextClass}>
        You are signed in, but your account does not currently have a verified
        Registry, COWL financial, or Curia financial assignment.
      </p>
      <AuthError className="mt-6">
        Access to administrative pages and financial records is restricted until
        your authorized role has been verified.
      </AuthError>
      <p className="mt-5 text-sm leading-6 text-[#706167]">
        Contact the designated diocesan administrator to confirm or activate your
        appointment. A valid sign-in does not automatically grant staff access.
      </p>
      <div className="mt-7 space-y-3">
        <Link href="/admin" className={authSecondaryButtonClass}>
          Check access again
        </Link>
        <button
          type="button"
          onClick={async () => { await signOut(); router.replace("/admin"); }}
          className={authPrimaryButtonClass}
        >
          Sign out
        </button>
      </div>
    </AdminAuthShell>
  );
}
