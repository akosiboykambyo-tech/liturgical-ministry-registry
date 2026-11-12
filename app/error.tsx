"use client";

import { PublicStatusPage } from "@/components/public-status-page";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PublicStatusPage
      status="Page unavailable"
      title="We couldn’t load this page."
      description="An unexpected problem interrupted this page. You can try again, or return to the registry. If the issue continues, please contact COWL-DOK support."
      actions={[{ href: "/", label: "Return to registry" }]}
    >
      <button
        type="button"
        onClick={() => reset()}
        className="inline-flex min-h-11 items-center justify-center bg-[#970E24] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#890022] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#970E24]"
      >
        Try again
      </button>
    </PublicStatusPage>
  );
}
