import type { Metadata } from "next";
import { PublicErrorPage } from "@/components/public-error-page";

export const metadata: Metadata = {
  title: "Access Restricted",
  robots: { index: false, follow: false },
};

/**
 * Presentation route for the 403 design. Actual protected pages and APIs must
 * continue to enforce authorization server-side (a visual page isn't a guard).
 */
export default function AccessRestrictedPage() {
  return (
    <PublicErrorPage
      status="403"
      title="Knock, and it shall be opened. Just not this door."
      description="We counted the flock at the gate, and you're not on the list for this pasture. This page is only for signed-in registry staff. If you think you should have access, sign in with the right account or write to us."
      actions={[
        { href: "/admin", label: "Admin sign-in" },
        { href: "/", label: "Return Home" },
      ]}
    />
  );
}
