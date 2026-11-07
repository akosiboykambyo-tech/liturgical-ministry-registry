import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * All legacy registry writes now use an owner-guarded, transactional database
 * entrypoint. NEVER retry a failed write through .from(...).insert/update/delete.
 * The server validates the Supabase Auth identity against the private admin
 * allowlist; a browser role label alone grants nothing.
 */
export type RegistryWriteAction =
  | "create" | "create_batch" | "merge" | "save" | "delete"
  | "document" | "renew" | "detach" | "set_status"
  | "flag_duplicate" | "import_begin" | "import_finish";

export async function registryAdminWrite<T = Record<string, unknown>>(
  action: RegistryWriteAction,
  data: Record<string, unknown>,
): Promise<T> {
  const supabase = getSupabaseBrowserClient();
  const { data: result, error } = await supabase.rpc(
    "registry_admin_member_write_v1",
    { p_action: action, p_data: data },
  );
  if (error) {
    const message = error.code === "PGRST202" || error.code === "42883"
      ? "Secure member-writing service is not installed yet. No changes were made."
      : error.message;
    throw new Error(message);
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("Invalid secure registry response.");
  }
  return result as T;
}
