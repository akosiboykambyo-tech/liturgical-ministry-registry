"use client";

import {
  AdminAuthShell,
  PasswordResetEmailConfirmation,
} from "@/components/admin-auth-ui";

/** Informational only: this route neither sends email nor confirms an account exists. */
export default function ResetLinkSentPage() {
  return (
    <AdminAuthShell showSupport backHref="/admin" backLabel="Back to sign in">
      <PasswordResetEmailConfirmation />
    </AdminAuthShell>
  );
}
