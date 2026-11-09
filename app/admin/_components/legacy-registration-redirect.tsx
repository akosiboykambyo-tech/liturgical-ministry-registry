"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

type LegacyKind = "import" | "batch" | "renewalReview" | "verification";

const base = "/admin/verification";

function destination(kind: LegacyKind, tab: string | null): string {
  if (kind === "batch") return base + "?tab=submissions&type=renewal&mode=intake&advanced=1";
  if (kind === "renewalReview") return base + "?tab=reviews&view=renewal";
  if (kind === "verification") return base + "?tab=reviews&view=approvals";
  if (tab === "renewal") return base + "?tab=submissions&type=renewal&mode=intake";
  if (tab === "pending") return base + "?tab=reviews&view=duplicates";
  if (tab === "history") return base + "?tab=history&view=renewal";
  return base + "?tab=submissions&type=new&mode=intake";
}

/** Compatibility for old bookmarked admin URLs. Imported page components are
 * mounted directly in Registration and do not pass through this route layout.
 */
export function LegacyRegistrationRedirect({ kind }: { kind: LegacyKind }) {
  const router = useRouter();
  const params = useSearchParams();
  const href = destination(kind, params.get("tab"));

  useEffect(() => {
    router.replace(href);
  }, [router, href]);

  return <div className="rounded-md border border-[#E6DADC] bg-white p-5 text-sm text-[#6B5C62]">
    Moving this legacy workflow to the unified Registration workspace.{" "}
    <Link href={href} className="font-semibold text-[#890022] underline">Open Registration</Link>
  </div>;
}
