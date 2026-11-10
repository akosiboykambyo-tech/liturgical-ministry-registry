"use client";

import Link from "next/link";
import { CheckCircle2 } from "@/components/phosphor-icons";
import {
  AdminAuthShell, authTitleClass, authTextClass,
  authStatusBoxClass, authPrimaryButtonClass,
} from "@/components/admin-auth-ui";

/** Informational state only: the email request is performed by Forgot Password.
 * Never claim that an email was delivered to an existing account.
 */
export default function ResetLinkSentPage() {
  return (
    <AdminAuthShell showSupport backHref="/admin" backLabel="Back to sign in">
      <CheckCircle2 aria-hidden="true" className="mb-4 h-7 w-7 text-[#0B5C5A]" />
      <h1 className={authTitleClass}>Check your email</h1>
      <p className={authTextClass}>
        If that address matches an authorized staff account, a secure password
        setup link may be on its way.
      </p>
      <p className={authStatusBoxClass}>
        Nothing there? Check your spam folder. Password setup links expire after
        the period configured by COWL-DOK Authentication.
      </p>
      <div className="mt-7 space-y-4">
        <Link href="/admin" className={authPrimaryButtonClass}>Back to sign in</Link>
        <Link href="/admin/forgot-password"
          className="inline-block text-sm font-semibold text-[#0B5C5A] underline underline-offset-2">
          Request another link
        </Link>
      </div>
    </AdminAuthShell>
  );
}
