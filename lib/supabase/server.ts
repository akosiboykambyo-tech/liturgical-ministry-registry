import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

let _server: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabaseServerClient() {
  if (_server) return _server;
  _server = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  return _server;
}

export async function getAuthenticatedUser() {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
