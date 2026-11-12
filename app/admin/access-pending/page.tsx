"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  AdminAuthShell,
  authPrimaryButtonClass,
  authSecondaryButtonClass,
  authStatusBoxClass,
  authTextClass,
  authTitleClass,
} from "@/components/admin-auth-ui";

/**
 * Signed-in does not mean authorized. Keep missing permissions distinct from
 * temporary authorization-service outages, using the standard sign-in shell.
 * Server-side authorization remains unchanged.
 */
export default function AccessPendingPage() {
  const { signOut } = useAuth();
  const router = useRouter();
  const [verificationUnavailable, setVerificationUnavailable] = useState(false);

  useEffect(() => {
    setVerificationUnavailable(
      new URLSearchParams(window.location.search).get("verification") === "unavailable"
    );
  }, []);

  return (
    <AdminAuthShell showSupport backHref="/" backLabel="Back to the public registry">
      <h1 className={authTitleClass}>
        {verificationUnavailable ? "Access verification unavailable" : "Role approval required"}
      </h1>
      <p className={authTextClass}>
        {verificationUnavailable
          ? "We could not verify your account permissions right now. Your administrative and financial access remains restricted."
          : "You are signed in, but this account does not currently have an approved Registry, COWL financial, or Curia financial role."}
      </p>
      <p role="status" className={authStatusBoxClass}>
        {verificationUnavailable
          ? "Please check your access again. If this continues, contact your designated administrator or COWL-DOK support."
          : "Administrative and financial records remain protected until a designated administrator approves your assignment. If you believe you should have access, contact your administrator."}
      </p>
      <div className="mt-7 space-y-3">
        <Link href="/admin" className={authPrimaryButtonClass}>
          Check access again
        </Link>
        <button
          type="button"
          className={authSecondaryButtonClass}
          onClick={async () => {
            await signOut();
            router.replace("/admin");
          }}
        >
          Sign out
        </button>
      </div>
    </AdminAuthShell>
  );
}
