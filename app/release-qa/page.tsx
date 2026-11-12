import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ReleaseQaClient from "./release-qa-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TEST-only release authorization verification",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * This QA surface must NEVER render in production, other Supabase projects,
 * local development, or CI's synthetic environment.
 */
export default function ReleaseQaPage() {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.NEXT_PUBLIC_SUPABASE_URL !==
      "https://rtptybxugjhvpfjvcvgw.supabase.co"
  ) {
    notFound();
  }
  return <ReleaseQaClient />;
}
