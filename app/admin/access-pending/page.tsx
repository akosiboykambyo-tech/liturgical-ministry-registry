"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  AdminAccessNotice,
  adminAccessPrimaryAction,
  adminAccessSecondaryAction,
} from "@/components/admin-access-notice";

/**
 * The message distinguishes an unapproved role from an unavailable
 * verification service; neither state grants access or changes permissions.
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
    <AdminAccessNotice
      title={verificationUnavailable ? "Access verification unavailable" : "Role approval required"}
      description={
        verificationUnavailable
          ? "We couldn't confirm your account permissions right now. This may be a temporary connection or authorization-service issue. Your access to restricted pages remains blocked."
          : "You're signed in, but your account does not currently have a verified Registry, COWL financial, or Curia financial assignment. Restricted pages and financial records remain unavailable."
      }
      actions={
        <>
          <Link href="/admin" className={adminAccessPrimaryAction}>
            Check access again
          </Link>
          <button
            type="button"
            className={adminAccessSecondaryAction}
            onClick={async () => {
              await signOut();
              router.replace("/admin");
            }}
          >
            Sign out
          </button>
        </>
      }
    >
      <p className="mt-4 text-sm leading-6 text-[#706167]">
        {verificationUnavailable
          ? "Please try again. If verification continues to fail, contact COWL-DOK support."
          : "Contact the designated diocesan administrator to verify or activate your assignment. Financial roles require explicit appointment."}
      </p>
    </AdminAccessNotice>
  );
}
