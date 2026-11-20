import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Rc1QaClient from "./rc1-qa-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "RC1 TEST Authorization QA",
  robots: { index: false, follow: false },
};

/**
 * Intentionally absent from Production and non-RC1 environments.
 * This page has no secrets and does not create a privileged server endpoint.
 */
export default function Rc1QaPage() {
  const endpoint = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let isTestDb = false;
  try {
    isTestDb = new URL(endpoint).hostname === "rtptybxugjhvpfjvcvgw.supabase.co";
  } catch {
    // Fail closed on missing or malformed environment configuration.
  }
  if (process.env.VERCEL_ENV !== "preview" || !isTestDb) notFound();
  return <Rc1QaClient />;
}
