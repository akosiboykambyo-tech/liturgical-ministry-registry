"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import {
  AlertTriangle, ArrowLeftRight, BookOpenCheck, CheckCircle2, Clock3,
  Database, FileWarning, Landmark, Loader2, LogOut, RefreshCw, ShieldCheck,
} from "lucide-react";
import { ebGaramond } from "@/app/fonts";
import PortalShell, { type PortalNavGroup } from "@/components/portal-shell";
import { getFinancialStagingClient } from "@/lib/financial-stewardship/staging-client";
import StagingFinancialOperations from "@/components/financial-stewardship/staging-financial-operations";

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
const burgundy = "#890022";
const control = "h-11 w-full min-w-0 rounded-sm border border-[#CDBFC3] bg-white px-3 text-sm outline-none focus:border-[#890022] focus:ring-1 focus:ring-[#890022]";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-sm px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40";
const solid = button + " bg-[#890022] text-white hover:bg-[#71001C]";
const outline = button + " border border-[#CDBFC3] bg-white text-[#49363A] hover:border-[#890022]";
const card = "rounded-sm border border-[#E6DADC] bg-white p-5 sm:p-6";
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
    <span className="mb-1.5 block text-xs font-semibold text-[#635359]">{label}</span>
    <input className={control} type={type} required={required} autoComplete="off"
      placeholder={placeholder} value={value} onChange={e => setValue(e.target.value)} />
  </label>;
}
function ErrorMessage({ value }: { value: Feedback | null }) {
  if (!value) return null;
  return <div role="status" className={"border px-4 py-3 text-sm leading-6 " +
    (value.ok ? "border-[#B8DCD3] bg-[#ECF8F3] text-[#145747]"
      : "border-[#E6B6BB] bg-[#FFF1F2] text-[#922A38]")}>
    {value.message}
  </div>;
}

export default function StagingReceiptCustody({ mode }: { mode: Mode }) {
  const client = useMemo(() => getFinancialStagingClient(), []);
  const requiredRole = mode === "curia"
    ? "curia_receipt_custodian" : "cowl_receipt_issuer";
  const [section, setSection] = useState<"custody" | "collections" | "remittances">("custody");
  const [authLoading, setAuthLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [rolesForUser, setRolesForUser] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
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
      .select("role_code,revoked_at,expires_at")
      .eq("user_id", user.id)
      .then(({ data, error }) => {
        if (!active) return;
        const now = Date.now();
        setRoles(error ? [] : (data || []).filter(grant =>
          !grant.revoked_at && (!grant.expires_at || Date.parse(grant.expires_at) > now)
        ).map(grant => grant.role_code));
        setRolesForUser(user.id);
        setRoleLoading(false);
      });
    return () => { active = false; };
  }, [client, user?.id]);

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
  const exceptions = numbers.filter(n => n.status === "voided" || n.status === "missing").length;

  async function operate(fn: string, params: Record<string, unknown>, done: string) {
    if (!client || !allowed || working) return;
    setWorking(true);
    setFeedback(null);
    const result = await client.rpc(fn, params);
    setWorking(false);
    if (result.error) {
      setFeedback({ ok: false, message: result.error.message });
      return;
    }
    setFeedback({ ok: true, message: done });
    if (fn === "fs_curia_register_checked_booklet" && typeof result.data === "string") setSelectedId(result.data);
    if (fn === "fs_curia_register_receipt_series" && typeof result.data === "string") setSeriesId(result.data);
    setCheckedRegister(false); setCheckedHandover(false); setCheckedAck(false); setCheckedException(false);
    setExceptionSerialId(""); setExceptionReason("");
    await refresh();
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!client || signingIn) return;
    setSigningIn(true);
    setFeedback(null);
    const result = await client.auth.signInWithPassword({ email: email.trim(), password });
    setSigningIn(false);
    setPassword("");
    if (result.error) setFeedback({ ok: false, message: "Staging sign-in failed. Check your test-project credentials." });
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
    setUser(null); setRoles([]); setRolesForUser(null); setBooklets([]); setNumbers([]); setSeries([]); setEvents([]);
    setFeedback(null);
  }

  if (!client) return <div className="min-h-screen bg-[#FBF9F9] px-5 py-16">
    <div className="mx-auto max-w-xl border border-[#E6DADC] bg-white p-8">
      <FileWarning className="h-8 w-8 text-[#890022]" />
      <h1 className={ebGaramond.className + " mt-3 text-3xl"}>Financial staging unavailable</h1>
      <p className="mt-3 text-sm leading-6 text-[#5F4A4F]">This route only connects when isolated test-project environment variables are present. Production credentials are never used as a fallback.</p>
    </div>
  </div>;

  if (authLoading || (user && roleLoading)) return <div className="grid min-h-screen place-items-center bg-[#FBF9F9]">
    <div role="status" className="flex items-center gap-3 text-sm text-[#890022]"><Loader2 className="h-5 w-5 animate-spin" /> Checking isolated staging access</div>
  </div>;

  if (!user) return <div className="grid min-h-screen place-items-center bg-[#FBF9F9] p-5">
    <section className="w-full max-w-md border border-[#E6DADC] bg-white p-7 shadow-sm sm:p-9">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#890022]">COWL-DOK · Isolated staging</p>
      <h1 className={ebGaramond.className + " mt-3 text-4xl"}>{mode === "curia" ? "Curia Receipt Custody" : "COWL Receipt Custody"}</h1>
      <p className="mt-3 text-sm leading-6 text-[#5F4A4F]">Sign in using an approved <strong>Ministry-Registry-Test</strong> account. Your regular COWL-DOK administrator session does not authorize access here.</p>
      <form onSubmit={signIn} className="mt-6 space-y-4">
        <Field label="Test account email" value={email} setValue={setEmail} type="email" placeholder="name@example.com" />
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#635359]">Password</span>
          <input className={control} type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        <button className={solid + " w-full"} type="submit" disabled={signingIn}>
          {signingIn && <Loader2 className="h-4 w-4 animate-spin" />} Sign in to staging
        </button>
      </form>
      <div className="mt-4"><ErrorMessage value={feedback} /></div>
      <p className="mt-5 text-xs leading-5 text-[#72646A]">Test-project credentials and role grants are provisioned separately. No real diocesan receipt stock is loaded.</p>
      <Link href={mode === "curia" ? "/curia" : "/admin/financial-stewardship-preview"} className="mt-4 inline-block text-sm font-semibold text-[#0B5C5A] underline underline-offset-4">Return to browser-only demo</Link>
    </section>
  </div>;

  if (!allowed) return <div className="grid min-h-screen place-items-center bg-[#FBF9F9] p-5">
    <section className="w-full max-w-lg border border-[#E6DADC] bg-white p-7">
      <ShieldCheck className="h-9 w-9 text-[#890022]" />
      <h1 className={ebGaramond.className + " mt-3 text-3xl"}>Role approval required</h1>
      <p className="mt-3 text-sm leading-6 text-[#5F4A4F]">This test identity has no active <strong>{requiredRole.replaceAll("_", " ")}</strong> grant. Financial data is protected until an authorized test administrator provisions the role.</p>
      <p className="mt-3 break-all text-xs text-[#6F6265]">Signed in as {user.email || user.id}</p>
      <div className="mt-5 flex gap-3"><button onClick={() => void signOut()} className={outline}>Sign out</button>
        <Link href={mode === "curia" ? "/staging/financial-stewardship/cowl" : "/staging/financial-stewardship/curia"} className={outline}>Other workspace</Link>
      </div>
    </section>
  </div>;

  const groups: PortalNavGroup[] = [
    { name: "Financial Stewardship", items: [
      { id: "stock", label: "Official Receipt Inventory", icon: BookOpenCheck, active: section === "custody",
        onSelect: () => { setSection("custody"); void refresh(); } },
      { id: "collections", label: "Collections and Receipts", icon: Database, active: section === "collections",
        onSelect: () => setSection("collections") },
      { id: "remittances", label: "Remittances and Curia Review", icon: ArrowLeftRight, active: section === "remittances",
        onSelect: () => setSection("remittances") },
      { id: "curia", label: "Curia workspace", icon: Landmark, href: "/staging/financial-stewardship/curia" },
      { id: "cowl", label: "COWL workspace", icon: ShieldCheck, href: "/staging/financial-stewardship/cowl" },
    ] },
  ];
  const label = mode === "curia" ? "Curia Portal" : "COWL Financial Stewardship";
  return <PortalShell title={label} subtitle="Isolated staging · Receipt custody"
    homeHref={mode === "curia" ? "/staging/financial-stewardship/curia" : "/staging/financial-stewardship/cowl"}
    navigationLabel="Financial staging navigation" groups={groups}
    footer={<div className="space-y-2">
      <p className="truncate text-xs text-white/85" title={user.email}>{user.email}</p>
      <p className="text-xs font-semibold text-white/90">TEST DATABASE ONLY</p>
      <button className="inline-flex min-h-10 items-center gap-2 text-sm text-white hover:underline" onClick={() => void signOut()}><LogOut className="h-4 w-4" /> Sign out</button>
    </div>}
    compactFooter={<button aria-label="Sign out of staging" title="Sign out of staging" onClick={() => void signOut()} className="grid h-11 w-11 place-items-center text-white hover:bg-white/15"><LogOut className="h-5 w-5" /></button>}>
    <div className="mx-auto w-full max-w-[1350px] space-y-6 px-4 py-7 sm:px-7 lg:px-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#890022]">Financial Stewardship · Phase 4.3 operational staging</p>
          <h1 className={ebGaramond.className + " mt-2 text-[38px] font-medium leading-tight sm:text-[47px]"}>
            {mode === "curia" ? "Curia Portal" : "Financial Stewardship"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#65575A]">{mode === "curia"
            ? "Shared Curia receipt custody, incoming COWL remittances and independent accounting review."
            : "Secure COWL receipt inventory, verified collections and accountable remittances to Curia."}</p>
        </div>
        <button type="button" disabled={refreshing} onClick={() => void refresh()} className={outline}>
          <RefreshCw className={"h-4 w-4 " + (refreshing ? "animate-spin" : "")}/> Refresh inventory
        </button>
      </header>
      <div role="note" className="border-l-4 border-[#890022] bg-[#F8EDEF] px-4 py-3 text-sm leading-6 text-[#4D343A]">
        <strong>Isolated Supabase staging.</strong> These workspaces use the same database, but enforce distinct COWL and Curia staff privileges. They contain no approved real financial account or seeded receipt stock. Use fictional test stock and test-only entries until Curia authorizes official handling.
      </div>
      <ErrorMessage value={feedback} />
      <nav aria-label="Financial Stewardship sections" className="flex flex-wrap gap-2 border-b border-[#E6DADC] pb-4">
        {([
          ["custody", "Receipt Inventory", BookOpenCheck],
          ["collections", "Collections & Receipts", Database],
          ["remittances", "Remittances & Curia", ArrowLeftRight],
        ] as const).map(([key,label,Icon]) =>
          <button key={key} type="button" onClick={() => { setSection(key); setFeedback(null); }}
            className={"inline-flex min-h-11 items-center gap-2 rounded-sm border px-3 py-2 text-sm font-semibold " +
              (section===key ? "border-[#890022] bg-[#890022] text-white" : "border-[#E6DADC] bg-white text-[#49363A] hover:border-[#890022]")}>
            <Icon className="h-4 w-4" />{label}
          </button>)}
      </nav>
      {section === "custody" ? (custodyAllowed ? <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Registered test booklets", booklets.length],
          ["Individual printed serials", total],
          ["Available / unused", available],
          ["Issued / voided / missing", issued + exceptions],
        ].map(([name, count]) => <div key={name} className={card}>
          <p className="text-xs font-semibold text-[#6F6265]">{name}</p>
          <p className="mt-2 text-[27px] font-semibold tabular-nums">{count}</p>
        </div>)}
      </div>
      {mode === "curia" && <div className="grid gap-5 xl:grid-cols-2">
        <form className={card} onSubmit={e => { e.preventDefault(); void operate("fs_curia_register_receipt_series",
          { p_issuing_entity: issuer, p_series_code: seriesCode }, "Curia series registered in the isolated test database."); }}>
          <div className="flex items-center gap-2"><Landmark className="h-5 w-5 text-[#890022]" /><h2 className={ebGaramond.className + " text-[27px]"}>Register receipt series</h2></div>
          <p className="mt-2 text-xs leading-5 text-[#6F6265]">Use the actual issuing entity and identifying series from authorized physical stock. Fictional values only in staging.</p>
          <div className="mt-4 grid gap-3">
            <Field label="Curia issuing entity (as authorized)" value={issuer} setValue={setIssuer} placeholder="Enter issuing entity" />
            <Field label="Printed series identifier" value={seriesCode} setValue={setSeriesCode} placeholder="Enter series reference" />
          </div>
          <button type="submit" disabled={working} className={solid + " mt-4"}><BookOpenCheck className="h-4 w-4" /> Register test series</button>
        </form>
        <form className={card} onSubmit={e => { e.preventDefault(); void operate("fs_curia_register_checked_booklet",
          { p_series_id: seriesId, p_booklet_reference: bookletReference.trim(), p_first_no: firstNo.trim(),
            p_last_no: lastNo.trim(), p_physical_range_checked: checkedRegister },
          "Preprinted booklet recorded in the shared test database, currently held by Curia."); }}>
          <h2 className={ebGaramond.className + " text-[27px]"}>Register physical booklet</h2>
          <p className="mt-2 text-xs leading-5 text-[#6F6265]">Never generate a receipt number. Enter the exact first and last numbers printed on the booklet.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-[#635359]">Registered Curia series</span>
              <select className={control} required value={seriesId} onChange={e => setSeriesId(e.target.value)}>
                <option value="">Select series</option>{series.map(s => <option key={s.id} value={s.id}>{s.issuing_entity} · {s.series_code}</option>)}
              </select>
            </label>
            <div className="sm:col-span-2"><Field label="Internal booklet identifier" value={bookletReference} setValue={setBookletReference} placeholder="e.g. TEST-CUR-001" /></div>
            <Field label="First preprinted No." value={firstNo} setValue={setFirstNo} placeholder="000301" />
            <Field label="Last preprinted No." value={lastNo} setValue={setLastNo} placeholder="000350" />
          </div>
          <label className="mt-4 flex items-start gap-2 text-sm leading-6"><input type="checkbox" checked={checkedRegister} onChange={e => setCheckedRegister(e.target.checked)} className="mt-1 accent-[#890022]"/>
            <span>I physically checked this booklet's exact printed range and count.</span></label>
          <button type="submit" disabled={working || !checkedRegister || !seriesId} className={solid + " mt-4"}>Register checked booklet</button>
        </form>
      </div>}
      <section className={card}>
        <h2 className={ebGaramond.className + " text-[29px]"}>Shared booklet inventory</h2>
        <p className="mt-2 text-xs leading-5 text-[#6F6265]">These are actual database records in the isolated test project, not the browser-local Phase 2/3 sample inventory.</p>
        {booklets.length === 0 ? <div className="mt-4 border border-dashed border-[#D7C5CC] p-6 text-sm text-[#6F6265]">
          No test receipt booklets are registered. Only an authorized Curia custodian may create the first series and booklet.
        </div> : <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {booklets.map(b => <button key={b.id} type="button" onClick={() => {
            setSelectedId(b.id); setShowAllNumbers(false); setFeedback(null);
            setCheckedAck(false);setCheckedHandover(false);setExceptionSerialId("");
          }} className={"rounded-sm border px-4 py-4 text-left " + (selected?.id === b.id
            ? "border-[#890022] bg-[#FFF7F9]" : "border-[#E6DADC] bg-white hover:border-[#BFA1AA]")}>
            <span className="font-semibold">{b.booklet_reference}</span>
            <span className="mt-1 block text-sm tabular-nums">{b.first_printed_no}–{b.last_printed_no}</span>
            <span className="mt-2 block text-xs font-semibold text-[#890022]">{prettyState(b.custody_state)}</span>
          </button>)}
        </div>}
      </section>
      {selected && <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-wider text-[#890022]">Selected booklet</p>
            <h2 className={ebGaramond.className + " mt-1 text-[29px]"}>{selected.booklet_reference}</h2>
            <p className="mt-1 text-sm tabular-nums">{selected.first_printed_no}–{selected.last_printed_no}</p></div>
          <span className="border border-[#DAC6CC] bg-[#FBF7F8] px-3 py-2 text-xs font-semibold text-[#890022]">{prettyState(selected.custody_state)}</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            ["Receipt series", series.find(s => s.id === selected.series_id)?.series_code || "—"],
            ["Assigned custodian", custodians.find(c => c.user_id === selected.assigned_to)?.display_label || (selected.assigned_to ? "Assigned (authorized account)" : "Not assigned")],
            ["COWL acknowledged at", selected.acknowledged_at ? new Date(selected.acknowledged_at).toLocaleString("en-PH") : "Pending"],
          ].map(([name, val]) => <div key={name} className="bg-[#FBF9F9] p-3"><p className="text-xs text-[#6F6265]">{name}</p><p className="mt-1 break-words text-sm font-semibold">{val}</p></div>)}
        </div>
        {mode === "curia" && selected.custody_state === "curia_stock" && <form className="mt-5 border border-[#E6DADC] bg-[#FFFCFD] p-4" onSubmit={e => {
          e.preventDefault();void operate("fs_curia_assign_receipt_booklet",{
            p_booklet_id:selected.id,p_cowl_custodian_id:assignee,p_handover_confirmed:checkedHandover,
          },"Curia handover recorded; awaiting independent COWL acknowledgment.");}}>
          <h3 className="font-semibold">Hand over physical booklet to COWL</h3>
          <label className="mt-3 block"><span className="mb-1.5 block text-xs font-semibold text-[#635359]">Authorized receiving COWL custodian</span>
            <select value={assignee} onChange={e=>setAssignee(e.target.value)} required className={control}>
              <option value="">Select test officer</option>
              {custodians.map(c => <option key={c.user_id} value={c.user_id}>{c.display_label}</option>)}
            </select></label>
          {custodians.length===0 && <p className="mt-2 text-xs leading-5 text-[#8A4D29]">No authorized COWL receipt custodians are provisioned in the test project yet.</p>}
          <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={checkedHandover} onChange={e=>setCheckedHandover(e.target.checked)} className="mt-1 accent-[#890022]"/>
            <span>I handed over the physical booklet and verified the receiving officer.</span></label>
          <button className={solid + " mt-3"} type="submit" disabled={working || !assignee || !checkedHandover}>Record Curia handover</button>
        </form>}
        {mode === "cowl" && selected.custody_state === "awaiting_cowl_ack" && <form className="mt-5 border border-[#E6DADC] bg-[#FFFCFD] p-4" onSubmit={e => {
          e.preventDefault();void operate("fs_cowl_acknowledge_receipt_booklet",{
            p_booklet_id:selected.id,p_physically_checked:checkedAck,
          },"COWL physical custody acknowledged in the shared test database.");}}>
          <h3 className="font-semibold">Acknowledge physical COWL custody</h3>
          <p className="mt-2 text-sm text-[#6F6265]">Only the actual officer designated by Curia can acknowledge this physical booklet.</p>
          <label className="mt-3 flex items-start gap-2 text-sm leading-6">
            <input type="checkbox" checked={checkedAck} onChange={e=>setCheckedAck(e.target.checked)} className="mt-1 accent-[#890022]"/>
            <span>I physically counted and checked the printed receipt numbers <strong>{selected.first_printed_no}–{selected.last_printed_no}</strong>.</span>
          </label>
          <button type="submit" disabled={working || !checkedAck || selected.assigned_to!==user.id} className={solid + " mt-3"}><CheckCircle2 className="h-4 w-4" /> Acknowledge custody</button>
          {selected.assigned_to!==user.id && <p className="mt-3 text-xs text-[#8A4D29]">This booklet is assigned to another custodian. Your account cannot acknowledge it.</p>}
        </form>}
        {mode === "cowl" && selected.custody_state === "cowl_custody" && <form className="mt-5 border border-[#E6DADC] bg-[#FFFCFD] p-4" onSubmit={e => {
          e.preventDefault();void operate("fs_cowl_report_receipt_exception",{
            p_receipt_number_id:exceptionSerialId,p_status:exceptionType,
            p_reason:exceptionReason,p_physically_verified:checkedException,
          },"Receipt exception recorded and removed from available test stock.");}}>
          <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-[#922A38]"/><h3 className="font-semibold">Report unusable printed receipt</h3></div>
          <p className="mt-2 text-xs text-[#6F6265]">Issued receipts cannot be voided through this form. This records a pre-issue physical exception only.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#635359]">Available printed number</span>
              <select value={exceptionSerialId} onChange={e=>setExceptionSerialId(e.target.value)} required className={control}>
                <option value="">Select unused serial</option>{selectedNumbers.filter(n=>n.status==="available").map(n=><option key={n.id} value={n.id}>{n.printed_no}</option>)}
              </select></label>
            <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#635359]">Exception type</span>
              <select value={exceptionType} onChange={e=>setExceptionType(e.target.value)} className={control}>
                <option value="voided">Voided</option><option value="missing">Missing</option>
              </select></label>
          </div>
          <label className="mt-3 block"><span className="mb-1.5 block text-xs font-semibold text-[#635359]">Physical evidence and reason (minimum 10 characters)</span>
            <textarea required minLength={10} value={exceptionReason} onChange={e=>setExceptionReason(e.target.value)}
              className="min-h-24 w-full border border-[#CDBFC3] p-3 text-sm outline-none focus:border-[#890022]" />
          </label>
          <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={checkedException} onChange={e=>setCheckedException(e.target.checked)} className="mt-1 accent-[#890022]"/>
            <span>I inspected or accounted for the physical paper and its exception.</span></label>
          <button type="submit" disabled={working || !checkedException || !exceptionSerialId || exceptionReason.trim().length<10} className={outline + " mt-3"}>Record physical exception</button>
        </form>}
        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold">Preprinted serial accountability ({selectedNumbers.length})</h3>
              {selectedNumbers.length>12 && <button type="button" onClick={()=>setShowAllNumbers(v=>!v)} className="text-xs font-semibold text-[#0B5C5A] underline underline-offset-2">
                {showAllNumbers ? "Show fewer" : "Show all"}
              </button>}
            </div>
            <div className="mt-3 max-h-80 overflow-auto border border-[#E6DADC]">
              <table className="w-full min-w-[300px] text-left text-sm"><thead className="sticky top-0 bg-[#FBF9F9] text-xs text-[#6F6265]"><tr><th className="px-3 py-2">Official Receipt No.</th><th className="px-3 py-2">Status</th></tr></thead>
                <tbody className="divide-y divide-[#F1E8EB]">{(showAllNumbers?selectedNumbers:selectedNumbers.slice(0,12)).map(n=>
                  <tr key={n.id}><td className="px-3 py-2 font-semibold tabular-nums">{n.printed_no}</td><td className="px-3 py-2 capitalize">{n.status}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
          <div><h3 className="font-semibold">Physical custody history</h3>
            {selectedEvents.length ? <div className="mt-3 divide-y divide-[#E6DADC] border-y border-[#E6DADC]">
              {selectedEvents.map(e=><div key={e.id} className="py-3">
                <p className="text-sm font-semibold">{prettyState(e.event_kind)}</p>
                <p className="mt-1 text-xs text-[#6F6265]">{new Date(e.event_at).toLocaleString("en-PH")} · {e.notes || "Custody event"}</p>
              </div>)}</div> : <p className="mt-3 text-sm text-[#6F6265]">No custody events are visible to this role.</p>}
          </div>
        </div>
      </section>}
      </> : <div className="flex items-start gap-3 border border-[#E6DADC] bg-white p-5">
        <ShieldCheck className="h-5 w-5 shrink-0 text-[#890022]" />
        <div><h2 className="font-semibold">Receipt custodian role required</h2>
          <p className="mt-1 text-sm text-[#6F6265]">This workspace is available only to the assigned {mode === "curia" ? "Curia receipt custodian" : "COWL receipt issuer / custodian"}. A finance or treasury role alone does not permit control of printed receipt stock.</p>
        </div>
      </div>) : <StagingFinancialOperations mode={mode} section={section} roles={roles} />}
      <footer className="border-t border-[#E6DADC] pt-5 text-xs leading-5 text-[#6F6265]">
        <div className="flex flex-wrap items-center gap-2"><Database className="h-4 w-4" /> Test-project records only · Requires distinct Curia and COWL staff authorization · Manual refresh or focus refresh across devices</div>
        <p className="mt-2">No financial staff privilege is inferred from receipt custody. Posting and confirmation require their specific test staff grants, approved evidence, and guarded database operations.</p>
      </footer>
    </div>
  </PortalShell>;
}
