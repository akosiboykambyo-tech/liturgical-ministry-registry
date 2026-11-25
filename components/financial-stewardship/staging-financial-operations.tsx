"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, ClipboardCheck as BookOpenCheck, CheckCircle2, ClipboardList, Wallet as CreditCard, Wallet as HandCoins, Bank as Landmark, Lock as LockKeyhole, Receipt as ReceiptText, RefreshCw, ShieldCheck } from "@/components/phosphor-icons";
import { ebGaramond } from "@/app/fonts";
import { getFinancialStagingClient } from "@/lib/financial-stewardship/staging-client";

type Role =
  | "cowl_finance_verifier" | "cowl_receipt_issuer" | "cowl_remittance_preparer"
  | "curia_treasury_reviewer" | "curia_receipt_custodian";
type Mode = "cowl" | "curia";
type Section = "collections" | "remittances";
type Collection = {
  id: string; internal_reference: string; payment_request_id: string;
  collection_channel: string; amount_centavos: number; status: string; received_at: string;
};
type Request = {
  id: string; payment_reference: string; total_due_centavos: number;
  status: string; quoted_participants: number;
};
type BankCredit = {id:string;receiving_account_id:string;provider_name:string;bank_external_reference:string;amount_centavos:number;statement_batch_reference:string|null};
type Claim = {
  receiving_account_id:string;
  id: string; payment_request_id: string; submitted_external_reference: string;
  claimed_amount_centavos: number; status: string; provider_name: string;
};
type Issue = {
  id: string; collection_id: string; receipt_number_id: string; issue_date: string;
  amount_centavos: number;
};
type Numbered = { id: string; booklet_id: string; printed_no: string; status: string };
type Booklet = { id: string; booklet_reference: string; custody_state: string };
type Remittance = {
  id: string; remittance_reference: string; declared_amount_centavos: number;
  status: string; fund_transfer_channel: string | null; submitted_at: string | null;
  cowl_to_curia_transfer_reference: string | null;
};
type RemitItem = { remittance_id: string; collection_id: string; receipt_issue_id: string };
type Copy = {
  id: string; remittance_id: string; receipt_issue_id: string;
  status: string; checked_at: string | null;
};
type CuriaFunds = {
  id: string; remittance_id: string; channel: string; amount_centavos: number;
  verified_receipt_at: string;
};
type CuriaReview = { id: string; remittance_id: string; decision: string; reviewed_at: string };
type Notice = { ok: boolean; message: string };

const box = "finance-panel";
const field = "min-h-11 w-full rounded-sm border border-[color:var(--finance-control-border)] bg-white px-3 py-2 text-sm text-[color:var(--registry-ink)] outline-none focus:border-[color:var(--registry-button)] focus:ring-1 focus:ring-[color:var(--registry-button)]";
const primary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-sm bg-[color:var(--registry-button)] px-4 py-2 text-sm font-semibold text-white hover:bg-[color:var(--registry-oxblood)] disabled:cursor-not-allowed disabled:opacity-40";
const secondary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-sm border border-[color:var(--finance-control-border)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--registry-ink)] hover:border-[color:var(--registry-crimson)] disabled:cursor-not-allowed disabled:opacity-40";

function centavos(value: string): number | null {
  const match = value.trim().match(/^(0|[1-9]\d{0,8})(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const result = Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
  return Number.isSafeInteger(result) ? result : null;
}
const money = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value) / 100);
const when = (v: string | null) => v ? new Date(v).toLocaleString("en-PH") : "—";
const localDay = () => new Date().toLocaleDateString("en-CA");
const nowForInput = () => {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};
type Line = { description: string; count: string; rate: string; amount: string };

function Restricted({ title, explanation }: { title: string; explanation: string }) {
  return <div className={box + " flex items-start gap-3"}>
    <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--registry-crimson)]" />
    <div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm leading-6 text-[color:var(--registry-muted)]">{explanation}</p></div>
  </div>;
}
function Input({ label, value, onChange, placeholder, type = "text", required = true }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; required?: boolean;
}) {
  return <label className="block min-w-0">
    <span className="mb-1 block text-xs font-semibold text-[color:var(--registry-muted)]">{label}</span>
    <input className={field} value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} type={type} required={required} autoComplete="off" />
  </label>;
}
function Metric({ name, value }: { name: string; value: string }) {
  return <div className={box+" finance-metric"}><p className="text-xs font-semibold text-[color:var(--registry-muted)]">{name}</p>
    <p className={ebGaramond.className+" finance-metric-value"}>{value}</p></div>;
}

export default function StagingFinancialOperations({
  mode, section, roles,
}: { mode: Mode; section: Section; roles: string[] }) {
  const client = useMemo(() => getFinancialStagingClient(), []);
  const has = (role: Role) => roles.includes(role);
  const canVerify = mode === "cowl" && has("cowl_finance_verifier");
  const canIssue = mode === "cowl" && has("cowl_receipt_issuer");
  const canRemit = mode === "cowl" && has("cowl_remittance_preparer");
  const canTreasury = mode === "curia" && has("curia_treasury_reviewer");
  const canReadCollections = canVerify || canIssue || canRemit || canTreasury;
  const canReadRemittances = canVerify || canRemit || canTreasury;
  const canReadIssued = canReadCollections || (mode === "curia" && has("curia_receipt_custodian"));
  const canReadStock = canIssue || canVerify || canRemit || canTreasury ||
    (mode === "curia" && has("curia_receipt_custodian"));
  // A stock custodian may inspect receipt status in Receipt Inventory, but
  // cannot infer hidden finance totals or view a remittance from that role alone.
  const allowed = section === "collections" ? canReadCollections : canReadRemittances;

  const [collections, setCollections] = useState<Collection[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [credits,setCredits]=useState<BankCredit[]>([]);
  const [qrClaim,setQrClaim]=useState("");
  const [qrCredit,setQrCredit]=useState("");
  const [qrChecked,setQrChecked]=useState(false);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [numbers, setNumbers] = useState<Numbered[]>([]);
  const [booklets, setBooklets] = useState<Booklet[]>([]);
  const [remittances, setRemittances] = useState<Remittance[]>([]);
  const [items, setItems] = useState<RemitItem[]>([]);
  const [copies, setCopies] = useState<Copy[]>([]);
  const [funds, setFunds] = useState<CuriaFunds[]>([]);
  const [reviews, setReviews] = useState<CuriaReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick(n => n + 1), []);

  useEffect(() => {
    let active = true;
    if (!client || !allowed) { setLoading(false); return; }
    // A role may have been revoked or changed without a new Auth identity.
    // Discard previously rendered financial records before loading newly scoped data.
    setCollections([]); setRequests([]); setClaims([]); setCredits([]); setIssues([]);
    setNumbers([]); setBooklets([]); setRemittances([]); setItems([]);
    setCopies([]); setFunds([]); setReviews([]);
    setLoading(true);
    async function load() {
      if (!client) return;
      try {
        const reads: { table: string; columns: string; put: (v: never[]) => void; enabled: boolean }[] = [
          { table: "fs_collections", columns: "id,internal_reference,payment_request_id,collection_channel,amount_centavos,status,received_at",
            put: v => setCollections(v as Collection[]), enabled: canReadCollections },
          { table: "fs_payment_requests", columns: "id,payment_reference,total_due_centavos,status,quoted_participants",
            put: v => setRequests(v as Request[]), enabled: canVerify },
          { table: "fs_payment_claims", columns: "id,payment_request_id,receiving_account_id,submitted_external_reference,claimed_amount_centavos,status,provider_name",
            put: v => setClaims(v as Claim[]), enabled: canVerify },
          {table:"fs_bank_credits",columns:"id,receiving_account_id,provider_name,bank_external_reference,amount_centavos,statement_batch_reference",put:v=>setCredits(v as BankCredit[]),enabled:canVerify},
          { table: "fs_receipt_issues", columns: "id,collection_id,receipt_number_id,issue_date,amount_centavos",
            put: v => setIssues(v as Issue[]), enabled: canReadIssued },
          { table: "fs_receipt_numbers", columns: "id,booklet_id,printed_no,status",
            put: v => setNumbers(v as Numbered[]), enabled: canReadStock },
          { table: "fs_receipt_booklets", columns: "id,booklet_reference,custody_state",
            put: v => setBooklets(v as Booklet[]), enabled: canReadStock },
          { table: "fs_remittances", columns: "id,remittance_reference,declared_amount_centavos,status,fund_transfer_channel,submitted_at,cowl_to_curia_transfer_reference",
            put: v => setRemittances(v as Remittance[]), enabled: canReadRemittances },
          { table: "fs_remittance_items", columns: "remittance_id,collection_id,receipt_issue_id",
            put: v => setItems(v as RemitItem[]), enabled: canReadRemittances },
          { table: "fs_duplicate_copy_handoffs", columns: "id,remittance_id,receipt_issue_id,status,checked_at",
            put: v => setCopies(v as Copy[]), enabled: canReadRemittances || (mode === "curia" && has("curia_receipt_custodian")) },
          { table: "fs_curia_fund_receipts", columns: "id,remittance_id,channel,amount_centavos,verified_receipt_at",
            put: v => setFunds(v as CuriaFunds[]), enabled: canRemit || canTreasury },
          { table: "fs_curia_reviews", columns: "id,remittance_id,decision,reviewed_at",
            put: v => setReviews(v as CuriaReview[]), enabled: canReadRemittances },
        ];
        for (const spec of reads) {
          if (!spec.enabled) continue;
          const { data, error } = await client.from(spec.table).select(spec.columns).limit(1000);
          if (error) throw new Error(error.message);
          if (active) spec.put((data || []) as never[]);
        }
        if (active) setNotice(current => current?.ok ? current : null);
      } catch (err) {
        if (active) setNotice({ ok: false, message: err instanceof Error ? err.message : "Unable to read isolated finance ledger." });
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  // Roles are a stable state array from the parent after verified login.
  }, [client, section, roles.join("|"), tick]);

  const [requestId, setRequestId] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [cashDate, setCashDate] = useState(nowForInput);
  const [cashChecked, setCashChecked] = useState(false);
  const [receiptCollection, setReceiptCollection] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [paperDate, setPaperDate] = useState(localDay);
  const [paperPayer, setPaperPayer] = useState("");
  const [paperMinistry, setPaperMinistry] = useState("");
  const [paperCode, setPaperCode] = useState("");
  const [paperChecked, setPaperChecked] = useState(false);
  const [paperLines, setPaperLines] = useState<Line[]>([{ description: "", count: "", rate: "", amount: "" }]);
  const [selection, setSelection] = useState<string[]>([]);
  const [channel, setChannel] = useState<"bank_transfer" | "cash_handover">("bank_transfer");
  const [transferRef, setTransferRef] = useState("");
  const [transferTime, setTransferTime] = useState(nowForInput);
  const [copiesChecked, setCopiesChecked] = useState(false);
  const [selectedRemit, setSelectedRemit] = useState("");
  const [copyChecked, setCopyChecked] = useState(false);
  const [curiaAmount, setCuriaAmount] = useState("");
  const [curiaTime, setCuriaTime] = useState(nowForInput);
  const [curiaCashCounted, setCuriaCashCounted] = useState(false);
  const [ackRef, setAckRef] = useState("");
  const [discrepancyReason, setDiscrepancyReason] = useState("");

  const issuedCollectionIds = new Set(issues.map(i => i.collection_id));
  const remittedCollectionIds = new Set(items.map(i => i.collection_id));
  const unissued = collections.filter(c => c.status === "posted" && !issuedCollectionIds.has(c.id));
  const eligible = collections.filter(c => c.status === "posted"
    && issuedCollectionIds.has(c.id) && !remittedCollectionIds.has(c.id));
  const pending = remittances.filter(r => r.status === "submitted");
  const chosen = collections.find(c => c.id === receiptCollection);
  const outstandingClaims = claims.filter(c => c.submitted_external_reference.startsWith("DEMO-") && ["submitted","under_review","needs_clarification"].includes(c.status));
  const chosenClaim=outstandingClaims.find(c=>c.id===qrClaim);
  const chosenCredits=credits.filter(c=>chosenClaim&&c.receiving_account_id===chosenClaim.receiving_account_id&&c.bank_external_reference.startsWith("DEMO-"));
  const issueFor = (id: string) => issues.find(i => i.collection_id === id);
  const serialFor = (id: string) => numbers.find(n => n.id === id)?.printed_no || "—";
  const selectedRemittance = remittances.find(r => r.id === selectedRemit);
  const remittanceCopies = copies.filter(c => c.remittance_id === selectedRemit);
  const curiaFund = funds.find(f => f.remittance_id === selectedRemit);
  const totalSelected = eligible.filter(c => selection.includes(c.id))
    .reduce((n, c) => n + Number(c.amount_centavos), 0);
  const paperSum = paperLines.reduce((n, line) => n + (centavos(line.amount) || 0), 0);

  async function act(name: string, params: Record<string, unknown>, done: string) {
    if (!client || busy) return;
    setBusy(true); setNotice(null);
    try {
      const { error } = await client.rpc(name, params);
      if (error) throw new Error(error.message);
      setNotice({ ok: true, message: done });
      setCashChecked(false); setQrChecked(false); setQrClaim(""); setQrCredit(""); setPaperChecked(false); setCopiesChecked(false);
      setCopyChecked(false); setCuriaCashCounted(false);
      setSelection([]);
      reload();
    } catch (err) {
      setNotice({ ok: false, message: err instanceof Error ? err.message : "The operation was rejected." });
    } finally { setBusy(false); }
  }

  function submitReceipt(e: FormEvent) {
    e.preventDefault();
    if (!chosen || !receiptNumber || !paperChecked || paperSum !== Number(chosen.amount_centavos)) return;
    const lines = paperLines.map(line => {
      const amount = centavos(line.amount);
      const fee = line.rate.trim() ? centavos(line.rate) : null;
      const count = line.count.trim() ? Number(line.count) : null;
      if (amount === null || amount <= 0 || !line.description.trim()
        || (fee === null) !== (count === null)
        || (count !== null && (!Number.isInteger(count) || count <= 0 || count * (fee || 0) !== amount))) {
        return null;
      }
      return { description: line.description.trim(), participant_count: count,
        fee_centavos: fee, amount_centavos: amount };
    });
    if (lines.some(l => l === null)) {
      setNotice({ ok: false, message: "Check every printed line's description, amount, participant count and rate." });
      return;
    }
    void act("fs_issue_official_receipt", {
      p_collection_id: chosen.id, p_receipt_number_id: receiptNumber,
      p_paper_checked: true, p_issue_date: paperDate,
      p_payer_written: paperPayer.trim(), p_ministry_written: paperMinistry.trim(),
      p_code_written: paperCode.trim() || null, p_paper_lines: lines,
    }, "The exact preprinted receipt and its written breakdown were recorded.");
  }

  const patchLine = (index: number, property: keyof Line, value: string) =>
    setPaperLines(old => old.map((line, i) => i === index ? { ...line, [property]: value } : line));

  if (!allowed) return <Restricted title="Financial review permission required"
    explanation={mode === "cowl"
      ? "Receipt custody does not automatically authorize collection verification or remittance preparation. An explicitly approved COWL finance or remittance role is required."
      : "Receipt custody does not automatically authorize Curia treasury reconciliation. An explicitly approved Curia treasury reviewer role is required."} />;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-end gap-3">
      <button type="button" disabled={loading || busy} onClick={reload} className={secondary}>
        <RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} /> Refresh
      </button>
    </div>
    {notice && <div role="status" className={"border px-4 py-3 text-sm " + (notice.ok
      ? "border-[color:var(--finance-success-border)] bg-[color:var(--finance-success-surface)] text-[color:var(--finance-success)]"
      : "border-[color:var(--finance-error-border)] bg-[color:var(--finance-error-surface)] text-[color:var(--registry-error)]")}>{notice.message}</div>}
    {loading && <p role="status" className="text-sm text-[color:var(--registry-muted)]">Loading authorized test financial records…</p>}

    {section === "collections" && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric name="Posted COWL collections" value={money(collections.filter(c => c.status === "posted").reduce((s,c)=>s + Number(c.amount_centavos),0))} />
        <Metric name="Official receipts recorded" value={String(issues.length)} />
        <Metric name="Collections awaiting paper receipt" value={String(unissued.length)} />
        <Metric name="Unverified QR Ph claims" value={canVerify ? String(outstandingClaims.length) : "Restricted"} />
      </div>
      {canReadCollections && <section className={box}>
        <h3 className={ebGaramond.className + " text-[26px]"}>Verified collections ledger</h3>
        <p className="mt-1 text-xs leading-5 text-[color:var(--registry-muted)]">Only confirmed QR Ph or counted OTC funds enter this ledger. Receipt issuance and Curia remittance are separate events.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead className="bg-[color:var(--registry-page)] text-xs text-[color:var(--registry-muted)]"><tr>
              <th className="p-3">Collection</th><th className="p-3">Channel</th><th className="p-3">Amount</th>
              <th className="p-3">Official receipt no.</th><th className="p-3">Recorded</th>
            </tr></thead>
            <tbody className="divide-y divide-[#EEE5E7]">
              {collections.map(c => <tr key={c.id}>
                <td className="p-3 font-semibold">{c.internal_reference}</td>
                <td className="p-3 uppercase">{c.collection_channel}</td>
                <td className="p-3 tabular-nums">{money(c.amount_centavos)}</td>
                <td className="p-3 font-semibold tabular-nums">{issueFor(c.id) ? serialFor(issueFor(c.id)!.receipt_number_id) : "Awaiting issue"}</td>
                <td className="p-3">{when(c.received_at)}</td>
              </tr>)}
              {!collections.length && <tr><td colSpan={5} className="p-5 text-center text-[color:var(--registry-muted)]">No verified collections in staging.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>}
      {canVerify && <section className="grid gap-5 xl:grid-cols-2">
        <form className={box} onSubmit={e => { e.preventDefault();
          const amount = centavos(cashAmount);
          if (amount === null || amount <= 0 || !cashChecked) return;
          void act("fs_record_otc_payment", {
            p_payment_request_id: requestId, p_amount_centavos: amount,
            p_counted_at: new Date(cashDate).toISOString(), p_cash_physically_counted: true,
          }, "Fictional OTC collection posted to the TEST ledger.");
        }}>
          <div className="flex items-center gap-2"><HandCoins className="h-5 w-5 text-[color:var(--registry-crimson)]"/><h3 className={ebGaramond.className + " text-[26px]"}>Record OTC payment</h3></div>
          <p className="mt-2 text-xs leading-5 text-[color:var(--registry-muted)]">Restricted to COWL finance verifiers. Use the seeded fictional payment request and simulate counting the stated amount.</p>
          <div className="mt-4 space-y-3">
            <label className="block"><span className="mb-1 block text-xs font-semibold text-[color:var(--registry-muted)]">Approved renewal payment request</span>
              <select required className={field} value={requestId} onChange={e => setRequestId(e.target.value)}>
                <option value="">Select authorized quote</option>{requests.filter(r => ["quoted","awaiting_payment","part_paid"].includes(r.status)).map(r =>
                  <option value={r.id} key={r.id}>{r.payment_reference} · {money(r.total_due_centavos)} due</option>)}
              </select>
            </label>
            <Input label="Counted amount (PHP)" value={cashAmount} onChange={setCashAmount} placeholder="0.00" />
            <Input label="Date and time cash was counted" value={cashDate} onChange={setCashDate} type="datetime-local" />
            <label className="flex items-start gap-2 text-sm leading-6">
              <input type="checkbox" checked={cashChecked} onChange={e => setCashChecked(e.target.checked)} className="mt-1 accent-[color:var(--registry-crimson)]" />
              <span>For this rehearsal, I confirm the fictional cash amount.</span>
            </label>
          </div>
          {!requests.length && <p className="mt-3 text-xs text-[color:var(--registry-amber)]">No approved payment requests exist. Fee schedule and quote authorization are required before cash can be posted.</p>}
          <button className={primary + " mt-4"} disabled={busy || !requestId || !cashChecked || !centavos(cashAmount)} type="submit">Post counted cash</button>
        </form>
        <div className={box}>
          <div className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-[color:var(--registry-crimson)]" /><h3 className={ebGaramond.className + " text-[26px]"}>QR Ph verification queue</h3></div>
          <p className="mt-2 text-xs leading-5 text-[color:var(--registry-muted)]">The portal never marks a screenshot Paid. The receiving-account statement, reference, amount and beneficiary must be checked independently.</p>
          <div className="mt-4 divide-y divide-[#EEE5E7] border-y border-[color:var(--registry-hairline)]">
            {outstandingClaims.map(c => <div key={c.id} className="py-3 text-sm">
              <p className="font-semibold">{c.submitted_external_reference}</p>
              <p className="mt-1 text-xs text-[color:var(--registry-muted)]">{c.provider_name} · {money(c.claimed_amount_centavos)} · {c.status}</p>
            </div>)}
            {!outstandingClaims.length && <p className="py-5 text-sm text-[color:var(--registry-muted)]">No submitted QR Ph payment claims.</p>}
          </div>
          <form className="mt-4 space-y-3" onSubmit={e=>{e.preventDefault();if(!qrChecked||!chosenClaim||!chosenCredits.some(c=>c.id===qrCredit))return;void act("fs_verify_qr_payment",{p_claim_id:qrClaim,p_bank_credit_id:qrCredit},"Matching synthetic QR credit posted to the TEST ledger.");}}>
            <p className="text-xs font-semibold text-[color:var(--registry-amber)]">Synthetic evidence only. Choose a matching credit or deliberately select the mismatched credit to demonstrate rejection.</p>
            <label className="block text-sm">Fictional claim<select className={field} value={qrClaim} onChange={e=>{setQrClaim(e.target.value);setQrCredit("");setQrChecked(false)}} required><option value="">Select claim</option>{outstandingClaims.map(c=><option key={c.id} value={c.id}>{c.submitted_external_reference} · {money(c.claimed_amount_centavos)}</option>)}</select></label>
            <label className="block text-sm">Synthetic bank credit<select className={field} value={qrCredit} onChange={e=>{setQrCredit(e.target.value);setQrChecked(false)}} required><option value="">Select credit</option>{chosenCredits.map(c=><option key={c.id} value={c.id}>{c.bank_external_reference} · {money(c.amount_centavos)}</option>)}</select></label>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={qrChecked} onChange={e=>setQrChecked(e.target.checked)}/><span>I reviewed the fictional reference and amount. No actual bank evidence is represented.</span></label>
            <button type="submit" className={primary} disabled={busy||loading||!qrChecked||!qrClaim||!qrCredit}>Verify simulated QR credit</button>
          </form>
        </div>
      </section>}
      {canIssue && <form className={box} onSubmit={submitReceipt}>
        <div className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-[color:var(--registry-crimson)]"/><h3 className={ebGaramond.className + " text-[27px]"}>Issue the exact Curia-preprinted official receipt</h3></div>
        <p className="mt-2 text-sm leading-6 text-[color:var(--registry-muted)]">Only a verified collection and an unused number from COWL-acknowledged physical stock can be linked. This form records the actual printed line breakdown, not an auto-generated receipt number.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs font-semibold text-[color:var(--registry-muted)]">Verified collection without receipt</span>
            <select required value={receiptCollection} onChange={e => setReceiptCollection(e.target.value)} className={field}>
              <option value="">Select posted collection</option>
              {unissued.map(c=><option value={c.id} key={c.id}>{c.internal_reference} · {money(c.amount_centavos)}</option>)}
            </select></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-[color:var(--registry-muted)]">Actual printed official receipt No.</span>
            <select required value={receiptNumber} onChange={e=>setReceiptNumber(e.target.value)} className={field}>
              <option value="">Select physical unused serial</option>
              {numbers.filter(n=>n.status==="available" && booklets.some(b=>b.id===n.booklet_id && b.custody_state==="cowl_custody"))
                .map(n=><option value={n.id} key={n.id}>{n.printed_no} · {booklets.find(b=>b.id===n.booklet_id)?.booklet_reference}</option>)}
            </select></label>
          <Input label="Paper issue date" value={paperDate} onChange={setPaperDate} type="date" />
          <Input label="Printed accounting code (copy exactly, optional)" value={paperCode} onChange={setPaperCode} required={false} />
          <Input label="Payer name as written on paper" value={paperPayer} onChange={setPaperPayer} />
          <Input label="Ministry as written on paper" value={paperMinistry} onChange={setPaperMinistry} />
        </div>
        <h4 className="mt-5 font-semibold">Physical paper line items</h4>
        <p className="mt-1 text-xs text-[color:var(--registry-muted)]">For each line, copy the description and amount. If the paper shows participants and a rate, include both and the calculation must match.</p>
        <div className="mt-3 space-y-3">
          {paperLines.map((line,index)=><div key={index} className="grid gap-2 border border-[color:var(--registry-hairline)] bg-[color:var(--registry-page)] p-3 sm:grid-cols-4">
            <Input label="Printed description" value={line.description} onChange={v=>patchLine(index,"description",v)} />
            <Input label="Participants (optional)" value={line.count} onChange={v=>patchLine(index,"count",v)} required={false} type="number" />
            <Input label="Rate PHP (optional)" value={line.rate} onChange={v=>patchLine(index,"rate",v)} required={false} />
            <Input label="Line total PHP" value={line.amount} onChange={v=>patchLine(index,"amount",v)} />
            {paperLines.length>1 && <button type="button" onClick={()=>setPaperLines(old=>old.filter((_,i)=>i!==index))}
              className="text-left text-xs font-semibold text-[color:var(--registry-error)] underline sm:col-span-4">Remove this paper line</button>}
          </div>)}
        </div>
        <button type="button" className={secondary + " mt-3"} onClick={()=>setPaperLines(old=>old.length<50?[...old,{description:"",count:"",rate:"",amount:""}]:old)}>Add printed line</button>
        <p className="mt-4 text-sm font-semibold">Written line total: {money(paperSum)} · Verified collection: {chosen?money(chosen.amount_centavos):"Select a collection"}</p>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={paperChecked} onChange={e=>setPaperChecked(e.target.checked)} className="mt-1 accent-[color:var(--registry-crimson)]" />
          <span>For this simulation, I checked this specific Curia-preprinted paper receipt, its exact number, written names and all line items.</span>
        </label>
        <button type="submit" className={primary + " mt-4"} disabled={busy || !chosen || !receiptNumber || !paperChecked || paperSum<=0 || paperSum!==Number(chosen.amount_centavos)}>Record issued official receipt</button>
      </form>}
    </>}

    {section === "remittances" && <>
      {canReadRemittances && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric name="COWL submitted remittances" value={String(remittances.length)} />
        <Metric name="Awaiting Curia review" value={String(pending.length)} />
        <Metric name="Curia confirmed" value={String(remittances.filter(r=>r.status==="curia_confirmed").length)} />
        <Metric name="Curia discrepancies" value={String(remittances.filter(r=>r.status==="discrepancy").length)} />
      </div>}
      {canReadRemittances && <section className={box}>
        <h3 className={ebGaramond.className + " text-[27px]"}>COWL-to-Curia remittance ledger</h3>
        <p className="mt-2 text-xs leading-5 text-[color:var(--registry-muted)]">The parish paying COWL and COWL handing money to Curia are separate transactions. A verified parish payment is not Curia acknowledgment.</p>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm">
          <thead className="bg-[color:var(--registry-page)] text-xs text-[color:var(--registry-muted)]"><tr>
            <th className="p-3">Remittance</th><th className="p-3">Declared amount</th>
            <th className="p-3">Transfer</th><th className="p-3">Copies verified</th><th className="p-3">Status</th>
          </tr></thead>
          <tbody className="divide-y divide-[#EEE5E7]">
            {remittances.map(r => {
              const all=copies.filter(c=>c.remittance_id===r.id);
              return <tr key={r.id}><td className="p-3 font-semibold">{r.remittance_reference}</td>
                <td className="p-3 tabular-nums">{money(r.declared_amount_centavos)}</td>
                <td className="p-3">{r.fund_transfer_channel?.replaceAll("_"," ")||"Not submitted"}</td>
                <td className="p-3">{all.filter(c=>c.status==="curia_verified").length}/{all.length}</td>
                <td className="p-3 capitalize">{r.status.replaceAll("_"," ")}</td></tr>;
            })}
            {!remittances.length && <tr><td colSpan={5} className="p-5 text-center text-[color:var(--registry-muted)]">No submitted remittances.</td></tr>}
          </tbody></table></div>
      </section>}
      {canRemit && <form className={box} onSubmit={e=>{
        e.preventDefault();
        if (!selection.length || !copiesChecked) return;
        void act("fs_submit_cowl_remittance", {
          p_collection_ids:selection,p_channel:channel,
          p_transfer_reference:channel==="bank_transfer"?transferRef.trim():null,
          p_transferred_at:new Date(transferTime).toISOString(),
          p_duplicate_copies_checked:true,
        },"COWL remittance and paper duplicate handoff recorded; independent Curia review remains outstanding.");
      }}>
        <div className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-[color:var(--registry-crimson)]"/><h3 className={ebGaramond.className + " text-[27px]"}>Prepare and submit COWL remittance</h3></div>
        <p className="mt-1 text-xs text-[color:var(--registry-muted)]">Select only verified collections with issued preprinted receipts that have not already been remitted.</p>
        <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
          {eligible.map(c=><label key={c.id} className="flex items-start gap-3 border border-[color:var(--registry-hairline)] p-3 text-sm">
            <input type="checkbox" checked={selection.includes(c.id)}
              onChange={e=>setSelection(old=>e.target.checked?[...old,c.id]:old.filter(id=>id!==c.id))}
              className="mt-1 accent-[color:var(--registry-crimson)]" />
            <span className="flex-1"><strong>{c.internal_reference}</strong> · {serialFor(issueFor(c.id)?.receipt_number_id||"—")}</span>
            <span className="tabular-nums">{money(c.amount_centavos)}</span>
          </label>)}
          {!eligible.length && <p className="border border-dashed border-[color:var(--finance-control-border)] p-4 text-sm text-[color:var(--registry-muted)]">No eligible collections with issued paper receipts.</p>}
        </div>
        <p className="mt-3 text-sm font-semibold">Selected remittance amount: {money(totalSelected)}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs font-semibold text-[color:var(--registry-muted)]">Actual COWL-to-Curia transfer method</span>
            <select className={field} value={channel} onChange={e=>setChannel(e.target.value as typeof channel)}>
              <option value="bank_transfer">Bank transfer</option><option value="cash_handover">Physical cash handover</option>
            </select></label>
          <Input label="Actual handover/transfer time" value={transferTime} onChange={setTransferTime} type="datetime-local" />
          {channel==="bank_transfer" && <div className="sm:col-span-2"><Input label="COWL → Curia bank transaction reference" value={transferRef} onChange={setTransferRef} placeholder="Distinct from parish QR transaction reference" /></div>}
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm leading-6">
          <input type="checkbox" checked={copiesChecked} onChange={e=>setCopiesChecked(e.target.checked)} className="mt-1 accent-[color:var(--registry-crimson)]" />
          <span>For this simulation, the duplicate-copy inspection record is available to Curia; COWL retains the physical duplicates.</span>
        </label>
        <button type="submit" className={primary+" mt-4"} disabled={busy || !selection.length || !copiesChecked || (channel==="bank_transfer" && transferRef.trim().length<5)}>Submit COWL remittance</button>
      </form>}
      {canTreasury && <section className={box}>
        <div className="flex items-center gap-2"><Landmark className="h-5 w-5 text-[color:var(--registry-crimson)]"/><h3 className={ebGaramond.className + " text-[27px]"}>Independent Curia treasury review</h3></div>
        <p className="mt-2 text-xs leading-5 text-[color:var(--registry-muted)]">Only Curia treasury reviewers may confirm funds and paper copies. A Curia receipt custodian alone cannot acknowledge money.</p>
        <label className="mt-4 block"><span className="mb-1 block text-xs font-semibold text-[color:var(--registry-muted)]">Submitted remittance under review</span>
          <select value={selectedRemit} onChange={e=>{setSelectedRemit(e.target.value);setCopyChecked(false);}} className={field}>
            <option value="">Select COWL submission</option>
            {pending.map(r=><option key={r.id} value={r.id}>{r.remittance_reference} · {money(r.declared_amount_centavos)}</option>)}
          </select></label>
        {selectedRemittance && <div className="mt-5 space-y-4">
          <div className="border border-[color:var(--registry-hairline)] bg-[color:var(--registry-page)] p-4 text-sm">
            <p><strong>Declared amount:</strong> {money(selectedRemittance.declared_amount_centavos)}</p>
            <p className="mt-1"><strong>Transfer:</strong> {selectedRemittance.fund_transfer_channel?.replaceAll("_"," ")}</p>
            <p className="mt-1"><strong>COWL transfer reference:</strong> {selectedRemittance.cowl_to_curia_transfer_reference||"Physical cash"}</p>
          </div>
          <div>
            <h4 className="font-semibold">Physical duplicate receipt copies</h4>
            <p className="mt-1 text-xs text-[color:var(--registry-muted)]">Simulate Curia inspection of the COWL-retained duplicates, independently of COWL's attestation.</p>
            <div className="mt-3 space-y-2">
              {remittanceCopies.map(c=><div key={c.id} className="flex flex-wrap items-center justify-between gap-3 border border-[color:var(--registry-hairline)] p-3 text-sm">
                <span>Receipt {serialFor(issues.find(i=>i.id===c.receipt_issue_id)?.receipt_number_id||"")} · <strong>{c.status.replaceAll("_"," ")}</strong></span>
                {c.status==="submitted" && <button type="button" className={secondary} disabled={busy || !copyChecked}
                  onClick={()=>void act("fs_verify_curia_receipt_copy", {
                    p_remittance_id:selectedRemit,p_receipt_issue_id:c.receipt_issue_id,
                    p_physical_copy_examined:true,
                  },"Physical duplicate verified by Curia.")}>
                  <CheckCircle2 className="h-4 w-4"/> Verify copy
                </button>}
              </div>)}
            </div>
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 accent-[color:var(--registry-crimson)]" checked={copyChecked} onChange={e=>setCopyChecked(e.target.checked)} />
              <span>For this simulation, I examined the exact physical duplicate before marking it verified.</span>
            </label>
          </div>
          {!curiaFund && selectedRemittance.fund_transfer_channel==="cash_handover" && <form className="border border-[color:var(--registry-hairline)] bg-[color:var(--registry-page)] p-4" onSubmit={e=>{
            e.preventDefault();const amount=centavos(curiaAmount);
            if (amount===null || !curiaCashCounted) return;
            void act("fs_record_curia_received_funds", {
              p_remittance_id:selectedRemit,p_channel:"cash_handover",p_amount_centavos:amount,
              p_external_reference:null,p_curia_destination_fingerprint:null,
              p_received_at:new Date(curiaTime).toISOString(),p_curia_statement_evidence_path:null,
            },"Curia physically counted cash recorded independently of COWL.");
          }}>
            <h4 className="font-semibold">Record actual Curia cash receipt</h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Input label="Cash independently counted (PHP)" value={curiaAmount} onChange={setCuriaAmount} />
              <Input label="Cash received time" value={curiaTime} onChange={setCuriaTime} type="datetime-local" />
            </div>
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 accent-[color:var(--registry-crimson)]" checked={curiaCashCounted} onChange={e=>setCuriaCashCounted(e.target.checked)} />
              <span>For this simulation, I received and counted the physical cash at Curia.</span>
            </label>
            <button type="submit" disabled={busy || !curiaCashCounted || centavos(curiaAmount)===null} className={primary+" mt-3"}>Record independently received cash</button>
          </form>}
          {!curiaFund && selectedRemittance.fund_transfer_channel==="bank_transfer" &&
            <Restricted title="Authenticated Curia bank-credit evidence required"
              explanation="Bank-transfer confirmation is disabled until Curia statement evidence can be uploaded to the private verified channel. A typed bank reference or COWL's screenshot alone is insufficient." />}
          {curiaFund && <div className="border border-[color:var(--finance-success-border)] bg-[color:var(--finance-success-surface)] p-3 text-sm">
            Curia received {money(curiaFund.amount_centavos)} via {curiaFund.channel.replaceAll("_"," ")} at {when(curiaFund.verified_receipt_at)}.
          </div>}
          {curiaFund && <div className="space-y-3 border-t border-[color:var(--registry-hairline)] pt-4">
            <Input label="Curia acknowledgment reference" value={ackRef} onChange={setAckRef} placeholder="Actual Curia acknowledgment reference" />
            <button type="button" disabled={busy || ackRef.trim().length<5 || remittanceCopies.some(c=>c.status!=="curia_verified")}
              className={primary} onClick={()=>void act("fs_complete_curia_review",{
                p_remittance_id:selectedRemit,p_curia_fund_receipt_id:curiaFund.id,
                p_decision:"confirmed",p_ack_reference:ackRef.trim(),p_discrepancy_notes:null,
              },"Curia independently confirmed the funds and every physical receipt duplicate.")}>
              <ShieldCheck className="h-4 w-4" /> Confirm Curia remittance
            </button>
            <label className="block"><span className="mb-1 block text-xs font-semibold text-[color:var(--registry-muted)]">Discrepancy details (minimum 10 characters)</span>
              <textarea className={field+" min-h-24"} value={discrepancyReason}
                onChange={e=>setDiscrepancyReason(e.target.value)} /></label>
            <button type="button" disabled={busy || discrepancyReason.trim().length<10} className={secondary}
              onClick={()=>void act("fs_complete_curia_review",{
                p_remittance_id:selectedRemit,p_curia_fund_receipt_id:curiaFund.id,
                p_decision:"discrepancy",p_ack_reference:null,p_discrepancy_notes:discrepancyReason.trim(),
              },"Curia recorded the reconciliation discrepancy for formal resolution.")}>
              <AlertTriangle className="h-4 w-4" /> Record discrepancy
            </button>
          </div>}
        </div>}
      </section>}
      {!canRemit && !canTreasury && <Restricted title="Treasury or remittance authorization required"
        explanation={mode==="curia"
          ? "Only an explicitly designated Curia treasury reviewer can verify funds and acknowledge a COWL remittance. Receipt custody alone does not grant that power."
          : "Only an explicitly designated COWL remittance preparer can submit funds and duplicate-copy inspection records. Receipt custody alone does not grant that power."} />}
    </>}
  </div>;
}
