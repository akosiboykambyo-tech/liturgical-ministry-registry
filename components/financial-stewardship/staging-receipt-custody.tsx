"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { AlertTriangle, ArrowsLeftRight as ArrowLeftRight, ClipboardCheck as BookOpenCheck, CheckCircle2, Clock as Clock3, Layers as Database, FileWarning, Bank as Landmark, Loader2, LogOut, RefreshCw, ShieldCheck } from "@/components/phosphor-icons";
import { ebGaramond } from "@/app/fonts";
import PortalShell, { type PortalNavGroup } from "@/components/financial-stewardship/demo-portal-shell";
import { getFinancialStagingClient } from "@/lib/financial-stewardship/staging-client";
import RenewalDesk from "@/components/financial-stewardship/rc3-renewal-desk";
import StagingFinancialOperations from "@/components/financial-stewardship/staging-financial-operations";
import DemoFinancialReports from "@/components/financial-stewardship/demo-financial-reports";
import ReceiptManagementPreview from "@/components/financial-stewardship/receipt-management-preview";
import StagingReadOnlyViewer from "@/components/financial-stewardship/staging-readonly-viewer";

type Mode = "curia" | "cowl";
type Series = { id: string; issuing_entity: string; series_code: string };
type Booklet = {
  id: string; booklet_reference: string; series_id: string;
  first_printed_no: string; last_printed_no: string;
  custody_state: "curia_stock" | "awaiting_cowl_ack" | "cowl_custody" | "returned";
  registered_at: string; assigned_to: string | null;
  acknowledged_by: string | null; acknowledged_at: string | null;
};
type NumberedReceipt = { id: string; booklet_id: string; printed_no: string; status: string };
type CustodyEvent = {
  id: string; booklet_id: string; event_kind: string;
  event_at: string; actor_id: string; recipient_id: string | null; notes: string | null;
};
type Custodian = { user_id: string; display_label: string };
type Feedback = { ok: boolean; message: string };
const burgundy = "var(--registry-crimson)";
const control = "h-11 w-full min-w-0 rounded-sm border border-[color:var(--finance-control-border)] bg-white px-3 text-sm outline-none focus:border-[color:var(--registry-button)] focus:ring-1 focus:ring-[color:var(--registry-button)]";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-sm px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40";
const solid = button + " bg-[color:var(--registry-button)] text-white hover:bg-[color:var(--registry-oxblood)]";
const outline = button + " border border-[color:var(--finance-control-border)] bg-white text-[color:var(--registry-ink)] hover:border-[color:var(--registry-crimson)]";
const card = "finance-panel";
const prettyState = (s: string) => ({
  curia_stock: "Curia stock",
  awaiting_cowl_ack: "Awaiting COWL acknowledgment",
  cowl_custody: "COWL custody",
  returned: "Returned to Curia",
}[s] || s.replaceAll("_", " "));
function Field({ label, value, setValue, placeholder, type = "text", required = true }: {
  label: string; value: string; setValue: (s: string) => void;
  placeholder?: string; type?: string; required?: boolean;
}) {
  return <label className="block min-w-0">
    <span className="mb-1.5 block text-xs font-semibold text-[color:var(--registry-muted)]">{label}</span>
    <input className={control} type={type} required={required} autoComplete="off"
      placeholder={placeholder} value={value} onChange={e => setValue(e.target.value)} />
  </label>;
}
function ErrorMessage({ value }: { value: Feedback | null }) {
  if (!value) return null;
  return <div role="status" className={"border px-4 py-3 text-sm leading-6 " +
    (value.ok ? "border-[color:var(--finance-success-border)] bg-[color:var(--finance-success-surface)] text-[color:var(--finance-success)]"
      : "border-[color:var(--finance-error-border)] bg-[color:var(--finance-error-surface)] text-[color:var(--registry-error)]")}>
    {value.message}
  </div>;
}

export default function StagingReceiptCustody({ mode }: { mode: Mode }) {
  const client = useMemo(() => getFinancialStagingClient(), []);
  const router = useRouter();
  const requiredRole = mode === "curia"
    ? "curia_receipt_custodian" : "cowl_receipt_issuer";
  const [section, setSection] = useState<"custody" | "collections" | "remittances" | "reports" | "receipt-management" | "obligations">("custody");
  const [collectionHandoff,setCollectionHandoff]=useState<{reference:string;method:"otc"|"qr"}|null>(null);
  const renewalEnabled=process.env.NEXT_PUBLIC_RENEWAL_DEMO==="enabled";
  const [authLoading, setAuthLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [rolesForUser, setRolesForUser] = useState<string | null>(null);
  const [grantRefresh, setGrantRefresh] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [working, setWorking] = useState(false);
  const [series, setSeries] = useState<Series[]>([]);
  const [booklets, setBooklets] = useState<Booklet[]>([]);
  const [numbers, setNumbers] = useState<NumberedReceipt[]>([]);
  const [events, setEvents] = useState<CustodyEvent[]>([]);
  const [custodians, setCustodians] = useState<Custodian[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [showAllNumbers, setShowAllNumbers] = useState(false);

  // No financial preview session can be borrowed from /admin or production Auth.
  useEffect(() => {
    if (!client) { setAuthLoading(false); return; }
    let active = true;
    void client.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      setUser(error ? null : data.user);
      setAuthLoading(false);
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setUser(session?.user || null);
        setAuthLoading(false);
      }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [client]);

  useEffect(() => {
    if (!client || !user) { setRoles([]); setRolesForUser(null); setRoleLoading(false); return; }
    let active = true;
    setRoleLoading(true);
    setRoles([]);
    setRolesForUser(null);
    void client.from("fs_staff_grants")
      .select("role_code,granted_at,revoked_at,expires_at")
      .eq("user_id", user.id)
      .then(({ data, error }) => {
        if (!active) return;
        const now = Date.now();
        setRoles(error ? [] : (data || []).filter(grant =>
          !grant.revoked_at && Number.isFinite(Date.parse(grant.granted_at)) && Date.parse(grant.granted_at) <= now && (!grant.expires_at || Date.parse(grant.expires_at) > now)
        ).map(grant => grant.role_code));
        setRolesForUser(user.id);
        setRoleLoading(false);
      });
    return () => { active = false; };
  }, [client, user?.id, grantRefresh]);

  useEffect(() => {
    const recheck = () => { if (document.visibilityState === "visible") setGrantRefresh(n => n + 1); };
    window.addEventListener("focus", recheck);
    return () => window.removeEventListener("focus", recheck);
  }, []);

  const custodyAllowed = Boolean(user && rolesForUser === user.id && roles.includes(requiredRole));
  const allowed = Boolean(user && rolesForUser === user.id && (
    mode === "cowl"
      ? ["cowl_receipt_issuer", "cowl_finance_verifier", "cowl_remittance_preparer"].some(role => roles.includes(role))
      : ["curia_receipt_custodian", "curia_treasury_reviewer"].some(role => roles.includes(role))
  ));

  const refresh = useCallback(async () => {
    if (!client || !custodyAllowed) return;
    setRefreshing(true);
    try {
      const [sr, br, nr, er, cr] = await Promise.all([
        client.from("fs_receipt_series").select("id,issuing_entity,series_code").order("created_at"),
        client.from("fs_receipt_booklets").select("id,booklet_reference,series_id,first_printed_no,last_printed_no,custody_state,registered_at,assigned_to,acknowledged_by,acknowledged_at").order("registered_at", { ascending: false }),
        client.from("fs_receipt_numbers").select("id,booklet_id,printed_no,status").order("printed_no"),
        client.from("fs_receipt_custody_events").select("id,booklet_id,event_kind,event_at,actor_id,recipient_id,notes").order("event_at", { ascending: false }),
        mode === "curia" ? client.rpc("fs_curia_list_cowl_custodians") : Promise.resolve({ data: [], error: null }),
      ]);
      const failed = [sr, br, nr, er, cr].find(r => r.error);
      if (failed?.error) throw new Error(failed.error.message);
      setSeries((sr.data || []) as Series[]);
      setBooklets((br.data || []) as Booklet[]);
      setNumbers((nr.data || []) as NumberedReceipt[]);
      setEvents((er.data || []) as CustodyEvent[]);
      setCustodians((cr.data || []) as Custodian[]);
    } catch (err) {
      setFeedback({ ok: false, message: err instanceof Error ? err.message : "Cannot load test inventory." });
    } finally {
      setRefreshing(false);
    }
  }, [client, custodyAllowed, mode]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const visibility = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", visibility);
    return () => window.removeEventListener("focus", visibility);
  }, [refresh]);

  const [issuer, setIssuer] = useState("");
  const [seriesCode, setSeriesCode] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [bookletReference, setBookletReference] = useState("");
  const [firstNo, setFirstNo] = useState("");
  const [lastNo, setLastNo] = useState("");
  const [priorIssued,setPriorIssued] = useState("");
  const [priorVoided,setPriorVoided] = useState("");
  const [priorMissing,setPriorMissing] = useState("");
  const serialList=(value:string)=>value.split(/[\s,;]+/).filter(Boolean);
  const [checkedRegister, setCheckedRegister] = useState(false);
  const [assignee, setAssignee] = useState("");
  const [checkedHandover, setCheckedHandover] = useState(false);
  const [checkedAck, setCheckedAck] = useState(false);
  const [exceptionSerialId, setExceptionSerialId] = useState("");
  const [exceptionType, setExceptionType] = useState("voided");
  const [exceptionReason, setExceptionReason] = useState("");
  const [checkedException, setCheckedException] = useState(false);

  const selected = booklets.find(b => b.id === selectedId) || booklets[0] || null;
  const selectedNumbers = numbers.filter(n => n.booklet_id === selected?.id);
  const selectedEvents = events.filter(e => e.booklet_id === selected?.id);
  const total = numbers.length;
  const available = numbers.filter(n => n.status === "available").length;
  const issued = numbers.filter(n => n.status === "issued").length;
  const exceptions = numbers.filter(n => n.status === "voided" || n.status === "missing" || n.status === "returned").length;
  const opening = numbers.filter(n => n.status === "previously_issued" || n.status === "previously_voided").length;

  async function operate(fn: string, params: Record<string, unknown>, done: string) {
    if (!client || !allowed || working) return;
    setWorking(true);
    setFeedback(null);
    if (fn === "fs_curia_register_receipt_series" && !/^DEMO-[A-Z0-9-]+$/i.test(String(params.p_series_code))) { setWorking(false); setFeedback({ok:false,message:"Use a DEMO-prefixed series."}); return; }
    if (fn === "fs_demo_register_opening_serials" && !/^DEMO-[A-Z0-9-]+$/i.test(String(params.p_booklet_reference))) { setWorking(false); setFeedback({ok:false,message:"Use a DEMO-prefixed booklet reference."}); return; }
    let result;
    try { result = await client.rpc(fn, params); } catch { setWorking(false); setFeedback({ok:false,message:"Network error. Refresh before retrying to check whether the operation completed."}); return; }
    setWorking(false);
    if (result.error) {
      setFeedback({ ok: false, message: result.error.message });
      return;
    }
    setFeedback({ ok: true, message: (fn==="fs_demo_new_rehearsal"||fn==="fs_demo_create_qr_rehearsal")&&typeof result.data==="string" ? done+" Reference: "+result.data : done });
    if (fn === "fs_demo_register_opening_serials" && typeof result.data === "string") setSelectedId(result.data);
    if (fn === "fs_curia_register_receipt_series" && typeof result.data === "string") setSeriesId(result.data);
    setCheckedRegister(false); setCheckedHandover(false); setCheckedAck(false); setCheckedException(false);
    setExceptionSerialId(""); setExceptionReason("");
    await refresh();
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
    setUser(null); setRoles([]); setRolesForUser(null); setBooklets([]); setNumbers([]); setSeries([]); setEvents([]);
    setFeedback(null);
    router.replace("/demo/finance");
  }

  useEffect(() => {
    if (!authLoading && client && !user) router.replace("/demo/finance");
  }, [authLoading, client, user, router]);

  if (!client) return <div className="min-h-screen bg-[color:var(--registry-page)] px-5 py-16">
    <div className="mx-auto max-w-xl border border-[color:var(--registry-hairline)] bg-white p-8">
      <FileWarning className="h-8 w-8 text-[color:var(--registry-crimson)]" />
      <h1 className={ebGaramond.className + " mt-3 text-3xl"}>Financial staging unavailable</h1>
      <p className="mt-3 text-sm leading-6 text-[color:var(--registry-muted)]">This route only connects when isolated test-project environment variables are present. Production credentials are never used as a fallback.</p>
    </div>
  </div>;

  if (authLoading || (user && roleLoading)) return <div className="grid min-h-screen place-items-center bg-[color:var(--registry-page)]">
    <div role="status" className="flex items-center gap-3 text-sm text-[color:var(--registry-crimson)]"><Loader2 className="h-5 w-5 animate-spin" /> Checking isolated staging access</div>
  </div>;

  if (!user) return <div className="grid min-h-screen place-items-center bg-[color:var(--registry-page)] p-6">
    <div className="max-w-md text-center">
      <Loader2 className="mx-auto h-6 w-6 animate-spin text-[color:var(--registry-crimson)]" />
      <p className="mt-3 text-sm">Redirecting to the unified COWL-DOK sign-in…</p>
      <Link href="/demo/finance" className="mt-4 inline-block text-sm font-semibold text-[color:var(--registry-teal)] underline">Open sign-in page</Link>
    </div>
  </div>;

  // A temporary viewer can inspect the approved financial layouts but can never
  // render interactive custody, collection, remittance or treasury controls.
  const viewerRole = mode === "curia"
    ? "curia_financial_workspace_viewer" : "cowl_financial_workspace_viewer";
  if (rolesForUser === user.id && roles.includes(viewerRole) && !allowed) {
    return <StagingReadOnlyViewer mode={mode} email={user.email ?? "Test staff"}
      roles={roles} onSignOut={signOut} />;
  }

  if (!allowed) return <div className="grid min-h-screen place-items-center bg-[color:var(--registry-page)] p-5">
    <section className="w-full max-w-lg border border-[color:var(--registry-hairline)] bg-white p-7">
      <ShieldCheck className="h-9 w-9 text-[color:var(--registry-crimson)]" />
      <h1 className={ebGaramond.className + " mt-3 text-3xl"}>Role approval required</h1>
      <p className="mt-3 text-sm leading-6 text-[color:var(--registry-muted)]">This test identity has no active <strong>{requiredRole.replaceAll("_", " ")}</strong> grant. Financial data is protected until an authorized test administrator provisions the role.</p>
      <p className="mt-3 break-all text-xs text-[color:var(--registry-muted)]">Signed in as {user.email || user.id}</p>
      <div className="mt-5 flex gap-3"><button onClick={() => void signOut()} className={outline}>Sign out</button>
        <Link href={mode === "curia" ? "/demo/finance/cowl" : "/demo/finance/curia"} className={outline}>Other workspace</Link>
      </div>
    </section>
  </div>;

  const groups: PortalNavGroup[] = [
    { name: "Financial Stewardship", items: [
      ...(renewalEnabled&&mode==="cowl"&&roles.includes("cowl_finance_verifier")?[{id:"obligations",label:"Payment Obligations",icon:BookOpenCheck,active:section==="obligations",onSelect:()=>{setSection("obligations");setFeedback(null)}}]:[]),
      { id: "stock", label: "Official Receipt Inventory", icon: BookOpenCheck, active: section === "custody",
        onSelect: () => { setSection("custody"); setFeedback(null); void refresh(); } },
      { id: "collections", label: "Collections and Receipts", icon: Database, active: section === "collections",
        onSelect: () => { setCollectionHandoff(null); setSection("collections"); setFeedback(null); } },
      { id: "remittances", label: "Remittances & Curia", icon: ArrowLeftRight, active: section === "remittances",
        onSelect: () => { setSection("remittances"); setFeedback(null); } },
      ...(mode === "cowl" && roles.includes("cowl_receipt_issuer") ? [{id:"receipt-management",label:"Receipt Management",icon:BookOpenCheck,active:section==="receipt-management",onSelect:()=>setSection("receipt-management")}] : []),
      ...((mode==="cowl" && roles.includes("cowl_remittance_preparer") || mode==="curia" && roles.includes("curia_treasury_reviewer")) ? [{id:"reports",label:"Financial Reports",icon:Database,active:section==="reports",onSelect:()=>setSection("reports")}] : []),
      ...(
        roles.some(role => role.startsWith("curia_"))
        && roles.some(role => role.startsWith("cowl_"))
          ? [{ id: "switch", label: "Switch workspace", icon: ArrowLeftRight, href: "/demo/finance" }]
          : []
      ),
    ] },
  ];
  const label = mode === "curia" ? "Curia Portal" : "COWL Portal";
  // The existing sidebar is the only section navigation.
  // Match the primary page title exactly to its active sidebar item.
  const sectionTitle = section === "obligations" ? "Payment Obligations" : section === "custody"
    ? "Official Receipt Inventory"
    : section === "collections"
      ? "Collections and Receipts"
      : section === "reports" ? "Financial Reports" : section === "receipt-management" ? "Receipt Management" : "Remittances & Curia";
  return <PortalShell title={label} subtitle="Financial Stewardship · Test"
    homeHref={mode === "curia" ? "/demo/finance/curia" : "/demo/finance/cowl"}
    navigationLabel="Financial staging navigation" groups={groups}
    footer={<div className="space-y-2">
      <p className="truncate text-xs text-white/85" title={user.email}>{user.email}</p>
      <p className="text-xs font-semibold text-white/90">TEST DATABASE ONLY</p>
      <button className="inline-flex min-h-11 items-center gap-2 text-sm text-white hover:underline" onClick={() => void signOut()}><LogOut className="h-4 w-4" /> Sign out</button>
    </div>}
    compactFooter={<button aria-label="Sign out of staging" title="Sign out of staging" onClick={() => void signOut()} className="grid h-11 w-11 place-items-center text-white hover:bg-white/15"><LogOut className="h-5 w-5" /></button>}>
    <div className="finance-content">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-[color:var(--registry-crimson)]">Financial Stewardship</p>
          <h1 className={ebGaramond.className + " mt-2 finance-page-title"}>
            {sectionTitle}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed sm:text-base text-[color:var(--registry-muted)]">
            {section === "obligations" ? "Authorize document-approved renewal obligations and track settlement." : section === "custody"
              ? "Track registered receipt series, physical booklet custody, and individual printed serials."
              : section === "collections"
                ? "Verify QR Ph and OTC collections, and record official receipt issuance."
                : section === "reports" ? "Reconcile collections, receipts and remittances." : section === "receipt-management" ? "Prepare a watermarked paper overlay, review the register and calibrate a draft." : "Reconcile recorded remittances and Curia treasury acknowledgment."}
          </p>
        </div>
        {section === "custody" && (
          <button type="button" disabled={refreshing} onClick={() => void refresh()} className={outline}>
            <RefreshCw className={"h-4 w-4 " + (refreshing ? "animate-spin" : "")} aria-hidden="true" /> Refresh inventory
          </button>
        )}
      </header>
      <ErrorMessage value={feedback} />
      {section === "custody" ? (custodyAllowed ? <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Registered test booklets", booklets.length],
          ["Individual printed serials", total],
          ["Available / unused", available],
          ["Issued / exceptions", issued + exceptions],
          ["Opening stock already used", opening],
        ].map(([name, count]) => <div key={name} className={card+" finance-metric"}>
          <p className="text-xs font-semibold text-[color:var(--registry-muted)]">{name}</p>
          <p className={ebGaramond.className + " finance-metric-value"}>{count}</p>
        </div>)}
      </div>
      {mode === "curia" && <section className={card}><h2 className="font-semibold">Start a fresh rehearsal</h2><p className="mt-2 text-sm text-[color:var(--registry-muted)]">Creates a new fictional 50-form booklet (10 previously issued, 2 previously voided, 38 unused) and a ₱500 unpaid quote. Earlier rehearsals remain in the audit history; no records are deleted.</p><button type="button" disabled={working} className={solid+" mt-4"} onClick={()=>void operate("fs_demo_new_rehearsal",{},"New rehearsal created. Select the new booklet and assign it to COWL.")}>Create OTC rehearsal</button> <button type="button" disabled={working} className={outline+" mt-4"} onClick={()=>void operate("fs_demo_create_qr_rehearsal",{},"QR rehearsal created. Assign its booklet to COWL; matching and mismatched synthetic credits are available in Collections.")}>Create QR rehearsal</button></section>}
      {mode === "curia" && <div className="grid gap-5 xl:grid-cols-2">
        <form className={card} onSubmit={e => { e.preventDefault(); void operate("fs_curia_register_receipt_series",
          { p_issuing_entity: issuer, p_series_code: seriesCode }, "Curia series registered in the isolated test database."); }}>
          <div className="flex items-center gap-2"><Landmark className="h-5 w-5 text-[color:var(--registry-crimson)]" /><h2 className={ebGaramond.className + " text-[27px]"}>Register receipt series</h2></div>
          <p className="mt-2 text-xs leading-5 text-[color:var(--registry-muted)]">Use a DEMO-prefixed series.</p>
          <div className="mt-4 grid gap-3">
            <Field label="Curia issuing entity (as authorized)" value={issuer} setValue={setIssuer} placeholder="Enter issuing entity" />
            <Field label="Printed series identifier" value={seriesCode} setValue={setSeriesCode} placeholder="DEMO-SERIES-01" />
          </div>
          <button type="submit" disabled={working} className={solid + " mt-4"}><BookOpenCheck className="h-4 w-4" /> Register test series</button>
        </form>
        <form className={card} onSubmit={e => { e.preventDefault(); void operate("fs_demo_register_opening_serials",
          { p_series_id: seriesId, p_booklet_reference: bookletReference.trim(), p_first_no: firstNo.trim(),
            p_last_no: lastNo.trim(), p_issued:serialList(priorIssued),p_voided:serialList(priorVoided),p_missing:serialList(priorMissing),p_checked: checkedRegister },
          "Preprinted booklet recorded in the shared test database, currently held by Curia."); }}>
          <h2 className={ebGaramond.className + " text-[27px]"}>Register new or partially used demo booklet</h2>
          <p className="mt-2 text-xs leading-5 text-[color:var(--registry-muted)]">List each previously issued, voided or missing number, separated by commas or spaces. Leave all three fields blank for new stock. Unlisted forms remain available; earlier use does not create revenue.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-[color:var(--registry-muted)]">Registered Curia series</span>
              <select className={control} required value={seriesId} onChange={e => setSeriesId(e.target.value)}>
                <option value="">Select series</option>{series.map(s => <option key={s.id} value={s.id}>{s.issuing_entity} · {s.series_code}</option>)}
              </select>
            </label>
            <div className="sm:col-span-2"><Field label="Internal booklet identifier" value={bookletReference} setValue={setBookletReference} placeholder="e.g. DEMO-CUR-001" /></div>
            <Field label="First preprinted No." value={firstNo} setValue={setFirstNo} placeholder="000301" />
            <Field label="Last preprinted No." value={lastNo} setValue={setLastNo} placeholder="000350" />
            <Field label="Previously issued serials" value={priorIssued} setValue={setPriorIssued} required={false} placeholder="000301, 000303"/>
            <Field label="Previously voided serials" value={priorVoided} setValue={setPriorVoided} required={false} placeholder="000305"/>
            <Field label="Missing serials" value={priorMissing} setValue={setPriorMissing} required={false} placeholder="000309"/>
          </div>
          <label className="mt-4 flex items-start gap-2 text-sm leading-6"><input type="checkbox" checked={checkedRegister} onChange={e => setCheckedRegister(e.target.checked)} className="mt-1 accent-[color:var(--registry-crimson)]"/>
            <span>I checked this booklet's exact printed range and count.</span></label>
          <button type="submit" disabled={working || !checkedRegister || !seriesId} className={solid + " mt-4"}>Register checked booklet</button>
        </form>
      </div>}
      <section className={card}>
        <h2 className={ebGaramond.className + " text-[29px]"}>Shared booklet inventory</h2>
        {booklets.length === 0 ? <div className="mt-4 border border-dashed border-[color:var(--finance-control-border)] p-6 text-sm text-[color:var(--registry-muted)]">
          No test receipt booklets are registered. Only an authorized Curia custodian may create the first series and booklet.
        </div> : <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {booklets.map(b => <button key={b.id} type="button" onClick={() => {
            setSelectedId(b.id); setShowAllNumbers(false); setFeedback(null);
            setCheckedAck(false);setCheckedHandover(false);setExceptionSerialId("");
          }} className={"rounded-sm border px-4 py-4 text-left " + (selected?.id === b.id
            ? "border-[color:var(--registry-crimson)] bg-[color:var(--finance-soft-rose)]" : "border-[color:var(--registry-hairline)] bg-white hover:border-[color:var(--finance-control-border)]")}>
            <span className="font-semibold">{b.booklet_reference}</span>
            <span className="mt-1 block text-sm tabular-nums">{b.first_printed_no}–{b.last_printed_no}</span>
            <span className="mt-2 block text-xs font-semibold text-[color:var(--registry-crimson)]">{prettyState(b.custody_state)}</span>
          </button>)}
        </div>}
      </section>
      {selected && <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-wider text-[color:var(--registry-crimson)]">Selected booklet</p>
            <h2 className={ebGaramond.className + " mt-1 text-[29px]"}>{selected.booklet_reference}</h2>
            <p className="mt-1 text-sm tabular-nums">{selected.first_printed_no}–{selected.last_printed_no}</p></div>
          <span className="border border-[color:var(--registry-hairline)] bg-[color:var(--registry-page)] px-3 py-2 text-xs font-semibold text-[color:var(--registry-crimson)]">{prettyState(selected.custody_state)}</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            ["Receipt series", series.find(s => s.id === selected.series_id)?.series_code || "—"],
            ["Assigned custodian", custodians.find(c => c.user_id === selected.assigned_to)?.display_label || (selected.assigned_to ? "Assigned (authorized account)" : "Not assigned")],
            ["COWL acknowledged at", selected.acknowledged_at ? new Date(selected.acknowledged_at).toLocaleString("en-PH") : "Pending"],
          ].map(([name, val]) => <div key={name} className="bg-[color:var(--registry-page)] p-3"><p className="text-xs text-[color:var(--registry-muted)]">{name}</p><p className="mt-1 break-words text-sm font-semibold">{val}</p></div>)}
        </div>
        {mode === "curia" && selected.custody_state === "curia_stock" && <form className="mt-5 border border-[color:var(--registry-hairline)] bg-[color:var(--registry-page)] p-4" onSubmit={e => {
          e.preventDefault();void operate("fs_curia_assign_receipt_booklet",{
            p_booklet_id:selected.id,p_cowl_custodian_id:assignee,p_handover_confirmed:checkedHandover,
          },"Curia handover recorded; awaiting independent COWL acknowledgment.");}}>
          <h3 className="font-semibold">Hand over physical booklet to COWL</h3>
          <label className="mt-3 block"><span className="mb-1.5 block text-xs font-semibold text-[color:var(--registry-muted)]">Authorized receiving COWL custodian</span>
            <select value={assignee} onChange={e=>setAssignee(e.target.value)} required className={control}>
              <option value="">Select test officer</option>
              {custodians.map(c => <option key={c.user_id} value={c.user_id}>{c.display_label}</option>)}
            </select></label>
          {custodians.length===0 && <p className="mt-2 text-xs leading-5 text-[color:var(--registry-amber)]">No authorized COWL receipt custodians are provisioned in the test project yet.</p>}
          <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={checkedHandover} onChange={e=>setCheckedHandover(e.target.checked)} className="mt-1 accent-[color:var(--registry-crimson)]"/>
            <span>I handed over the booklet and verified the receiving officer.</span></label>
          <button className={solid + " mt-3"} type="submit" disabled={working || !assignee || !checkedHandover}>Record Curia handover</button>
        </form>}
        {mode === "cowl" && selected.custody_state === "awaiting_cowl_ack" && <form className="mt-5 border border-[color:var(--registry-hairline)] bg-[color:var(--registry-page)] p-4" onSubmit={e => {
          e.preventDefault();void operate("fs_cowl_acknowledge_receipt_booklet",{
            p_booklet_id:selected.id,p_physically_checked:checkedAck,
          },"COWL physical custody acknowledged in the shared test database.");}}>
          <h3 className="font-semibold">Acknowledge physical COWL custody</h3>
          <p className="mt-2 text-sm text-[color:var(--registry-muted)]">Only the actual officer designated by Curia can acknowledge this physical booklet.</p>
          <label className="mt-3 flex items-start gap-2 text-sm leading-6">
            <input type="checkbox" checked={checkedAck} onChange={e=>setCheckedAck(e.target.checked)} className="mt-1 accent-[color:var(--registry-crimson)]"/>
            <span>I counted and checked the printed receipt numbers <strong>{selected.first_printed_no}–{selected.last_printed_no}</strong>.</span>
          </label>
          <button type="submit" disabled={working || !checkedAck || selected.assigned_to!==user.id} className={solid + " mt-3"}><CheckCircle2 className="h-4 w-4" /> Acknowledge custody</button>
          {selected.assigned_to!==user.id && <p className="mt-3 text-xs text-[color:var(--registry-amber)]">This booklet is assigned to another custodian. Your account cannot acknowledge it.</p>}
        </form>}
        {mode === "cowl" && selected.custody_state === "cowl_custody" && <form className="mt-5 border border-[color:var(--registry-hairline)] bg-[color:var(--registry-page)] p-4" onSubmit={e => {
          e.preventDefault();void operate("fs_cowl_report_receipt_exception",{
            p_receipt_number_id:exceptionSerialId,p_status:exceptionType,
            p_reason:exceptionReason,p_physically_verified:checkedException,
          },"Receipt exception recorded and removed from available test stock.");}}>
          <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-[color:var(--registry-error)]"/><h3 className="font-semibold">Report unusable printed receipt</h3></div>
          <p className="mt-2 text-xs text-[color:var(--registry-muted)]">Issued receipts cannot be voided through this form. This records a pre-issue physical exception only.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[color:var(--registry-muted)]">Available printed number</span>
              <select value={exceptionSerialId} onChange={e=>setExceptionSerialId(e.target.value)} required className={control}>
                <option value="">Select unused serial</option>{selectedNumbers.filter(n=>n.status==="available").map(n=><option key={n.id} value={n.id}>{n.printed_no}</option>)}
              </select></label>
            <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[color:var(--registry-muted)]">Exception type</span>
              <select value={exceptionType} onChange={e=>setExceptionType(e.target.value)} className={control}>
                <option value="voided">Voided</option><option value="missing">Missing</option>
              </select></label>
          </div>
          <label className="mt-3 block"><span className="mb-1.5 block text-xs font-semibold text-[color:var(--registry-muted)]">Physical evidence and reason (minimum 10 characters)</span>
            <textarea required minLength={10} value={exceptionReason} onChange={e=>setExceptionReason(e.target.value)}
              className="min-h-24 w-full border border-[color:var(--finance-control-border)] p-3 text-sm outline-none focus:border-[color:var(--registry-button)]" />
          </label>
          <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={checkedException} onChange={e=>setCheckedException(e.target.checked)} className="mt-1 accent-[color:var(--registry-crimson)]"/>
            <span>I inspected the receipt exception.</span></label>
          <button type="submit" disabled={working || !checkedException || !exceptionSerialId || exceptionReason.trim().length<10} className={outline + " mt-3"}>Record physical exception</button>
        </form>}
        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold">Preprinted serial accountability ({selectedNumbers.length})</h3>
              {selectedNumbers.length>12 && <button type="button" onClick={()=>setShowAllNumbers(v=>!v)} className="text-xs font-semibold text-[color:var(--registry-teal)] underline underline-offset-2">
                {showAllNumbers ? "Show fewer" : "Show all"}
              </button>}
            </div>
            <div className="mt-3 max-h-80 overflow-auto border border-[color:var(--registry-hairline)]">
              <table className="w-full min-w-[300px] text-left text-sm"><thead className="sticky top-0 bg-[color:var(--registry-page)] text-xs text-[color:var(--registry-muted)]"><tr><th className="px-3 py-2">Official Receipt No.</th><th className="px-3 py-2">Status</th></tr></thead>
                <tbody className="divide-y divide-[#F1E8EB]">{(showAllNumbers?selectedNumbers:selectedNumbers.slice(0,12)).map(n=>
                  <tr key={n.id}><td className="px-3 py-2 font-semibold tabular-nums">{n.printed_no}</td><td className="px-3 py-2 capitalize">{n.status.replaceAll("_"," ")}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
          <div><h3 className="font-semibold">Physical custody history</h3>
            {selectedEvents.length ? <div className="mt-3 divide-y divide-[#E6DADC] border-y border-[color:var(--registry-hairline)]">
              {selectedEvents.map(e=><div key={e.id} className="py-3">
                <p className="text-sm font-semibold">{prettyState(e.event_kind)}</p>
                <p className="mt-1 text-xs text-[color:var(--registry-muted)]">{new Date(e.event_at).toLocaleString("en-PH")} · {e.notes || "Custody event"}</p>
              </div>)}</div> : <p className="mt-3 text-sm text-[color:var(--registry-muted)]">No custody events are visible to this role.</p>}
          </div>
        </div>
      </section>}
      </> : <div className="flex items-start gap-3 border border-[color:var(--registry-hairline)] bg-white p-5">
        <ShieldCheck className="h-5 w-5 shrink-0 text-[color:var(--registry-crimson)]" />
        <div><h2 className="font-semibold">Receipt custodian role required</h2>
          <p className="mt-1 text-sm text-[color:var(--registry-muted)]">This workspace is available only to the assigned {mode === "curia" ? "Curia receipt custodian" : "COWL receipt issuer / custodian"}. A finance or treasury role alone does not permit control of printed receipt stock.</p>
        </div>
      </div>) : section==="reports" ? <DemoFinancialReports/> : section==="receipt-management" ? <ReceiptManagementPreview/> : section==="obligations" ? (renewalEnabled&&mode==="cowl"&&roles.includes("cowl_finance_verifier")?<RenewalDesk embedded onOpenCollection={(reference,method)=>{setCollectionHandoff({reference,method});setSection("collections")}}/>:null) : <StagingFinancialOperations key={section+":"+ (collectionHandoff?.reference??"")+":"+(collectionHandoff?.method??"")} mode={mode} section={section} roles={roles} initialReference={collectionHandoff?.reference} initialTab={collectionHandoff?.method} /> }
    </div>
  </PortalShell>;
}
