"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  AdminAccessNotice,
  adminAccessPrimaryAction,
  adminAccessSecondaryAction,
} from "@/components/admin-access-notice";

/**
 * Presentation only. A signed-in identity is never an authorization grant.
 * Keep role denial and temporary authorization-service outages distinct.
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
      showIcon={false}
      title={verificationUnavailable ? "Access verification unavailable" : "Role approval required"}
      description={
        verificationUnavailable
          ? "We could not confirm your account permissions at this time. Administrative pages and financial records remain restricted."
          : "Your sign-in is valid, but COWL-DOK could not confirm an approved Registry, COWL financial, or Curia financial assignment. Administrative pages and financial records remain restricted."
      }
      actions={
        <>
          <Link href="/admin" className={adminAccessSecondaryAction}>
            Check access again
          </Link>
          <button
            type="button"
            className={adminAccessPrimaryAction}
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
      <p className="mt-3 text-sm leading-6 text-[#5F4A4F]">
        {verificationUnavailable
          ? "The authorization service may be temporarily unavailable. Try checking access again, or contact COWL-DOK support if the problem continues."
          : "Contact the designated diocesan administrator to verify or activate your assignment. Financial roles require explicit appointment and may be revoked."}
      </p>
    </AdminAccessNotice>
  );
}
