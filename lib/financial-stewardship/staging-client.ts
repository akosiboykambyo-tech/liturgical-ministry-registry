"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Financial staging is intentionally a DIFFERENT Supabase Auth session.
 * Never fall back to the production Admin Portal credentials.
 */
export function getFinancialStagingClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_FS_STAGING_URL;
  const key = process.env.NEXT_PUBLIC_FS_STAGING_PUBLISHABLE_KEY;
  if (url !== "https://rtptybxugjhvpfjvcvgw.supabase.co" || !key) return null;
  if (!client) client = createClient(url, key, {
    auth: {
      storageKey: "cowl-dok-financial-staging-auth-v1",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}

export type StagingStaffRole =
  | "cowl_receipt_issuer"
  | "curia_receipt_custodian";
