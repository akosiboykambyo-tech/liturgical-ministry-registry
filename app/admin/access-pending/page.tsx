"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  AdminAccessNotice,
  adminAccessPrimaryAction,
  adminAccessSecondaryAction,
} from "@/components/admin-access-notice";

/**
 * UI only: a valid login does not establish any registry or finance role.
 * This page never grants permissions or changes authorization metadata.
 */
export default function AccessPendingPage() {
  const { signOut } = useAuth();
  const router = useRouter();

  return (
    <AdminAccessNotice
      title="Role approval required"
      description="Your sign-in is valid, but COWL-DOK could not confirm an approved Registry, COWL financial, or Curia financial assignment. Administrative pages and financial records remain restricted."
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
        Contact the designated diocesan administrator to verify or activate your assignment.
        Financial roles require explicit appointment and may be revoked.
      </p>
    </AdminAccessNotice>
  );
}
