import type { Metadata } from "next";
import { PublicStatusPage } from "@/components/public-status-page";

export const metadata: Metadata = {
  title: "Access Restricted",
  robots: { index: false, follow: false },
};

/** Informational page only; server-side authorization stays with protected routes. */
export default function AccessRestrictedPage() {
  return (
    <PublicStatusPage
      status="403 · Access restricted"
      title="You don’t have access to this page."
      description="This area is limited to authorized staff. If you have an approved account, sign in to the administrative portal. Otherwise, contact the designated diocesan administrator."
      actions={[
        { href: "/admin", label: "Admin sign-in" },
        { href: "/", label: "Return to registry" },
      ]}
    />
  );
}
