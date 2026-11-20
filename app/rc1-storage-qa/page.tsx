import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StorageQaClient from "./storage-qa-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "RC1 TEST Storage Authorization QA",
  robots: { index: false, follow: false },
};

/** No Storage QA entrypoint exists outside a TEST-backed Vercel Preview. */
export default function Rc1StorageQaPage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let matchesTest = false;
  try {
    matchesTest = new URL(url).hostname === "rtptybxugjhvpfjvcvgw.supabase.co";
  } catch {
    // Fail closed on an absent/malformed configuration.
  }
  if (process.env.VERCEL_ENV !== "preview" || !matchesTest) notFound();
  return <StorageQaClient />;
}
