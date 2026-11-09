"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: {
      persistSession: true,
      autoRefreshToken: true,
      // A staging recovery link belongs ONLY to the separate test Supabase
      // client. Prevent the production registry AuthProvider from consuming
      // its URL fragment first on this branch's isolated financial preview.
      // Production continues to support its original Auth callbacks.
      detectSessionInUrl:
        process.env.NEXT_PUBLIC_FS_STAGING_URL !==
          "https://rtptybxugjhvpfjvcvgw.supabase.co",
    } }
  );
  return _client;
}
