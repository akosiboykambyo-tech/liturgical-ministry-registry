import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export const TEST_URL = "https://rtptybxugjhvpfjvcvgw.supabase.co";
export type Workspace = "cowl" | "curia";
export type Series = { id: string; series_code: string };
export type Booklet = { id: string; series_id: string; booklet_reference: string; first_printed_no: string; last_printed_no: string; custody_state: string; assigned_to: string | null };
export type Custodian = { user_id: string; display_label: string };
export type Inventory = { series: Series[]; booklets: Booklet[]; custodians: Custodian[] };

function testClient(): SupabaseClient {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== TEST_URL) throw new Error("Demo requires the isolated TEST database.");
  return getSupabaseBrowserClient();
}
function check(error: {message: string} | null) { if (error) throw new Error(error.message); }
function demoReference(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!/^DEMO-[A-Z0-9-]{1,30}$/.test(normalized)) throw new Error("Use a fictional reference beginning DEMO-.");
  return normalized;
}
function validateRange(first: string, last: string) {
  if (!/^\d{4,12}$/.test(first) || !/^\d{4,12}$/.test(last) || first.length !== last.length ||
      Number(last) - Number(first) < 0 || Number(last) - Number(first) > 499) {
    throw new Error("Enter matching-width fictional serials (4–12 digits, up to 500 forms).");
  }
}
export interface InventoryService {
  list(workspace: Workspace, userId: string): Promise<Inventory>;
  registerSeries(code: string): Promise<void>;
  registerUnusedBooklet(series: Series, reference: string, first: string, last: string): Promise<void>;
  assign(booklet: Booklet, custodian: string): Promise<void>;
  acknowledge(booklet: Booklet): Promise<void>;
}
/** Presentation adapter only. The operational adapter must be separately reviewed.
 * Auth/RLS and transactional RPC role checks remain the authority, not UI state.
 */
export const testInventoryService: InventoryService = {
  async list(workspace, userId) {
    const client = testClient();
    const s = await client.from("fs_receipt_series").select("id,series_code").like("series_code","DEMO-%").order("series_code");
    check(s.error);
    const series: Series[] = s.data ?? [];
    let booklets: Booklet[] = [];
    if (series.length) {
      let q = client.from("fs_receipt_booklets").select("id,series_id,booklet_reference,first_printed_no,last_printed_no,custody_state,assigned_to")
        .in("series_id", series.map(item => item.id)).like("booklet_reference","DEMO-%").order("booklet_reference");
      if (workspace === "cowl") q = q.eq("assigned_to",userId);
      const result = await q;
      check(result.error); booklets = result.data ?? [];
    }
    let custodians: Custodian[] = [];
    if (workspace === "curia") {
      const result = await client.rpc("fs_curia_list_cowl_custodians");
      check(result.error); custodians = result.data ?? [];
    }
    return {series, booklets, custodians};
  },
  async registerSeries(code) {
    const r = await testClient().rpc("fs_curia_register_receipt_series", {p_issuing_entity:"DEMONSTRATION — NOT VALID",p_series_code:demoReference(code)});
    check(r.error);
  },
  async registerUnusedBooklet(series, reference, first, last) {
    demoReference(series.series_code); validateRange(first,last);
    const r = await testClient().rpc("fs_curia_register_checked_booklet", {p_series_id:series.id,p_booklet_reference:demoReference(reference),p_first_no:first,p_last_no:last,p_physical_range_checked:true});
    check(r.error);
  },
  async assign(booklet, custodian) {
    demoReference(booklet.booklet_reference);
    if (booklet.custody_state !== "curia_stock" || !custodian) throw new Error("Select unassigned demo stock and a TEST custodian.");
    const r = await testClient().rpc("fs_curia_assign_receipt_booklet",{p_booklet_id:booklet.id,p_cowl_custodian_id:custodian,p_handover_confirmed:true});
    check(r.error);
  },
  async acknowledge(booklet) {
    demoReference(booklet.booklet_reference);
    if (booklet.custody_state !== "awaiting_cowl_ack") throw new Error("This booklet is not awaiting acknowledgment.");
    const r = await testClient().rpc("fs_cowl_acknowledge_receipt_booklet",{p_booklet_id:booklet.id,p_physically_checked:true});
    check(r.error);
  },
};
