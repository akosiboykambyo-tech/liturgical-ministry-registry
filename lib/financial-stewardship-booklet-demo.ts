"use client";

import { useCallback, useEffect, useState } from "react";
import { REFERENCE_RECEIPT } from "@/lib/financial-stewardship-receipt-preview";
import { MINISTRIES, PARISHES } from "@/lib/constants";

export type BookletState = "curia_stock" | "awaiting_cowl_ack" | "cowl_custody";
export type ReceiptState = "available" | "issued" | "voided" | "missing";
export type ReceiptUsage = { serial: string; collectionRef: string; issuedBy: string; date: string };
export type ReceiptException = { serial: string; kind: "voided" | "missing"; reason: string; reportedBy: string; date: string };
export type BookletEvent = { action: string; date: string; officer: string; detail: string };
export type ReceiptBookletDemo = {
  id: string; series: string; first: string; last: string;
  state: BookletState; curiaOfficer: string; issuedDate: string;
  cowlCustodian: string; acknowledgedBy: string; acknowledgedDate: string;
  usage: ReceiptUsage[]; exceptions: ReceiptException[];
  history: BookletEvent[];
};

export type FinancialCollectionDemo = {
  id: string; bookletId: string; serial: string; parish: string; parishPrinted: string;
  ministry: string; ministryPrinted: string; renewalYear: string; date: string;
  participants: number; feeCentavos: number; amountCentavos: number;
  purpose: string; printedCode: string; paymentMethod: "cash" | "check" | "other";
  collectedBy: string; remittanceId: string | null;
};
export type FinancialRemittanceDemo = {
  id: string; collectionIds: string[]; totalCentavos: number; duplicateCount: number;
  preparedBy: string; submittedDate: string; status: "pending" | "confirmed" | "discrepancy";
  curiaCountCentavos?: number; verifiedCollectionIds?: string[];
  curiaOfficer?: string; curiaReference?: string; reviewedDate?: string; discrepancyReason?: string;
};
export type DemoFinancialState = {
  version: 3; booklets: ReceiptBookletDemo[];
  collections: FinancialCollectionDemo[]; remittances: FinancialRemittanceDemo[];
};
const STORE_KEY = "cowl-dok-financial-demo-v3";
const LEGACY_KEY = "cowl-dok-demo-booklets-v2";
const SYNC_EVENT = "cowl-dok-demo-booklets-changed";
export const SAMPLE_BOOKLETS: ReceiptBookletDemo[] = [
  {
    id: "COWL-001", series: "Curia sample series", first: "000101", last: "000150",
    state: "cowl_custody", curiaOfficer: "Curia Custodian (sample)", issuedDate: "2026-11-01",
    cowlCustodian: "COWL Staff (sample)", acknowledgedBy: "COWL Staff (sample)", acknowledgedDate: "2026-11-01",
    usage: [
      { serial: "000101", collectionRef: "COL-2026-001", issuedBy: "COWL Staff A", date: "2026-11-02" },
      { serial: "000102", collectionRef: "COL-2026-002", issuedBy: "COWL Staff A", date: "2026-11-02" },
      { serial: "000103", collectionRef: "COL-2026-003", issuedBy: "COWL Staff B", date: "2026-11-03" },
      { serial: "000104", collectionRef: "COL-2026-004", issuedBy: "COWL Staff A", date: "2026-11-04" },
      { serial: "000105", collectionRef: "COL-2026-005", issuedBy: "COWL Staff B", date: "2026-11-05" },
      { serial: "000106", collectionRef: "COL-2026-006", issuedBy: "COWL Staff A", date: "2026-11-06" },
    ],
    exceptions: [{ serial: "000107", kind: "voided", reason: "Fictional example of a voided paper receipt", reportedBy: "COWL Staff (sample)", date: "2026-11-06" }],
    history: [
      { action: "Registered and assigned", date: "2026-11-01", officer: "Curia Custodian (sample)", detail: "Issued 000101–000150 to COWL" },
      { action: "COWL custody acknowledged", date: "2026-11-01", officer: "COWL Staff (sample)", detail: "Physical booklet received (sample)" },
    ],
  },
  {
    id: "CUR-002", series: "Curia sample series", first: "000151", last: "000200",
    state: "curia_stock", curiaOfficer: "Curia Custodian (sample)", issuedDate: "",
    cowlCustodian: "", acknowledgedBy: "", acknowledgedDate: "",
    usage: [], exceptions: [],
    history: [{ action: "Stock registered", date: "2026-11-01", officer: "Curia Custodian (sample)", detail: "Unassigned physical receipt booklet" }],
  },
];

export function rangeSize(first: string, last: string): number | null {
  if (!/^\d{4,12}$/.test(first) || !/^\d{4,12}$/.test(last) || first.length !== last.length) return null;
  const start = BigInt(first), end = BigInt(last);
  if (end < start || end - start > BigInt(199)) return null;
  return Number(end - start + BigInt(1));
}
export function serialsInBooklet(booklet: ReceiptBookletDemo): string[] {
  const size = rangeSize(booklet.first, booklet.last);
  return size === null ? [] : Array.from({ length: size }, (_, i) => (BigInt(booklet.first) + BigInt(i)).toString().padStart(booklet.first.length, "0"));
}
export function serialState(booklet: ReceiptBookletDemo, serial: string): ReceiptState {
  if (booklet.usage.some(item => item.serial === serial)) return "issued";
  const problem = booklet.exceptions.find(item => item.serial === serial);
  return problem?.kind || "available";
}
export function bookletCounts(booklet: ReceiptBookletDemo) {
  const total = serialsInBooklet(booklet).length;
  return {
    total, issued: booklet.usage.length,
    voided: booklet.exceptions.filter(item => item.kind === "voided").length,
    missing: booklet.exceptions.filter(item => item.kind === "missing").length,
    available: total - booklet.usage.length - booklet.exceptions.length,
  };
}
function clean(value: string) { return value.trim(); }
function cloneSeed(): ReceiptBookletDemo[] {
  return SAMPLE_BOOKLETS.map(b => ({
    ...b, usage: b.usage.map(u => ({ ...u })), exceptions: b.exceptions.map(e => ({ ...e })),
    history: b.history.map(e => ({ ...e })),
  }));
}
function isBookletArray(value: unknown): value is ReceiptBookletDemo[] {
  if (!Array.isArray(value) || value.length > 100) return false;
  return value.every(b =>
    b && typeof b === "object" && typeof b.id === "string" && typeof b.series === "string" &&
    typeof b.first === "string" && typeof b.last === "string" && rangeSize(b.first, b.last) !== null &&
    ["curia_stock", "awaiting_cowl_ack", "cowl_custody"].includes(b.state) &&
    typeof b.curiaOfficer === "string" && typeof b.issuedDate === "string" &&
    typeof b.cowlCustodian === "string" && typeof b.acknowledgedBy === "string" &&
    typeof b.acknowledgedDate === "string" && Array.isArray(b.usage) &&
    Array.isArray(b.exceptions) && Array.isArray(b.history));
}
function seedState(booklets = cloneSeed()): DemoFinancialState {
  return { version: 3, booklets, collections: [], remittances: [] };
}
function isFinancialState(value: unknown): value is DemoFinancialState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<DemoFinancialState>;
  return state.version === 3 && isBookletArray(state.booklets) &&
    Array.isArray(state.collections) && state.collections.length <= 300 &&
    Array.isArray(state.remittances) && state.remittances.length <= 100 &&
    state.collections.every(c => c && typeof c.id === "string" && typeof c.serial === "string" &&
      typeof c.bookletId === "string" && Number.isSafeInteger(c.amountCentavos)) &&
    state.remittances.every(m => m && typeof m.id === "string" && Array.isArray(m.collectionIds) &&
      Number.isSafeInteger(m.totalCentavos));
}
function load(): DemoFinancialState {
  try {
    const stored = localStorage.getItem(STORE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (isFinancialState(parsed)) return parsed;
    }
    // Preserve any previously simulated Phase 2 booklet handovers on this browser.
    const previous = localStorage.getItem(LEGACY_KEY);
    if (previous) {
      const parsed: unknown = JSON.parse(previous);
      if (isBookletArray(parsed)) return seedState(parsed);
    }
  } catch { /* Browser privacy restrictions or invalid local state: use seed. */ }
  return seedState();
}
export type Result = { ok: boolean; error?: string };
type BookletTransition = (items: ReceiptBookletDemo[]) => { result: Result; next: ReceiptBookletDemo[] };
type StateTransition = (current: DemoFinancialState) => { result: Result; next: DemoFinancialState };

export function useReceiptBookletDemo() {
  const [state, setState] = useState<DemoFinancialState>(seedState);
  const { booklets, collections, remittances } = state;
  const [storageReady, setStorageReady] = useState(false);
  useEffect(() => {
    setState(load()); setStorageReady(true);
    const changed = () => setState(load());
    window.addEventListener("storage", changed);
    window.addEventListener(SYNC_EVENT, changed);
    return () => { window.removeEventListener("storage", changed); window.removeEventListener(SYNC_EVENT, changed); };
  }, []);

  const transactState = useCallback((operation: StateTransition): Result => {
    const current = load(); // Recheck whenever another tab might have updated local state.
    const { result, next } = operation(current);
    if (!result.ok) { setState(current); return result; }
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch { return { ok: false, error: "Browser storage is unavailable. Mock changes cannot be shared between portals." }; }
    setState(next);
    window.dispatchEvent(new Event(SYNC_EVENT));
    return result;
  }, []);
  const transact = useCallback((operation: BookletTransition): Result =>
    transactState(current => {
      const { result, next } = operation(current.booklets);
      return { result, next: result.ok ? { ...current, booklets: next } : current };
    }), [transactState]);

  const register = useCallback((draft: {
    id: string; series: string; first: string; last: string; officer: string; date: string;
  }): Result => transact(items => {
    const d = { id: clean(draft.id), series: clean(draft.series), first: clean(draft.first),
      last: clean(draft.last), officer: clean(draft.officer), date: clean(draft.date) };
    const size = rangeSize(d.first, d.last);
    if (!d.id || !d.series || !d.officer || !d.date || size === null) return { result: { ok: false, error: "Enter a reference, series, registering officer, date and a valid numeric serial range (maximum 200)." }, next: items };
    if (d.id.length > 40 || d.series.length > 60 || d.officer.length > 80)
      return { result: { ok: false, error: "One or more identifying fields are too long." }, next: items };
    if (items.some(b => b.id.toLowerCase() === d.id.toLowerCase()))
      return { result: { ok: false, error: "This booklet reference already exists." }, next: items };
    if (d.first.length === REFERENCE_RECEIPT.serial.length &&
        BigInt(d.first) <= BigInt(REFERENCE_RECEIPT.serial) &&
        BigInt(d.last) >= BigInt(REFERENCE_RECEIPT.serial))
      return { result: { ok: false, error: "The uploaded historical receipt 057785 is a format reference, not an assignable demo serial." }, next: items };
    const overlaps = items.some(b => b.series.toLowerCase() === d.series.toLowerCase() &&
      BigInt(d.first) <= BigInt(b.last) && BigInt(d.last) >= BigInt(b.first));
    if (overlaps) return { result: { ok: false, error: "Serial range overlaps an existing booklet in the same series." }, next: items };
    const b: ReceiptBookletDemo = { id: d.id, series: d.series, first: d.first, last: d.last,
      state: "curia_stock", curiaOfficer: d.officer, issuedDate: "", cowlCustodian: "", acknowledgedBy: "", acknowledgedDate: "",
      usage: [], exceptions: [], history: [{ action: "Stock registered", date: d.date, officer: d.officer, detail: "Curia inventory: " + d.first + "–" + d.last }] };
    return { result: { ok: true }, next: [...items, b] };
  }), [transact]);

  const assign = useCallback((id: string, custodian: string, officer: string, date: string): Result => transact(items => {
    const b = items.find(b => b.id === id);
    if (!b || b.state !== "curia_stock") return { result: { ok: false, error: "Only Curia stock can be assigned." }, next: items };
    if (clean(custodian).length < 3 || clean(officer).length < 3 || !date)
      return { result: { ok: false, error: "Enter the COWL custodian, Curia issuing officer and handover date." }, next: items };
    return { result: { ok: true }, next: items.map(item => item.id !== id ? item : {
      ...item, state: "awaiting_cowl_ack", issuedDate: date, curiaOfficer: clean(officer), cowlCustodian: clean(custodian),
      history: [...item.history, { action: "Issued to COWL — pending acceptance", date, officer: clean(officer), detail: "Assigned to " + clean(custodian) + ", " + item.first + "–" + item.last }],
    }) };
  }), [transact]);

  const acknowledge = useCallback((id: string, receiver: string, date: string, confirmed: boolean): Result => transact(items => {
    const b = items.find(b => b.id === id);
    if (!b || b.state !== "awaiting_cowl_ack") return { result: { ok: false, error: "Only booklets awaiting COWL receipt can be acknowledged." }, next: items };
    if (clean(receiver).length < 3 || !date || !confirmed)
      return { result: { ok: false, error: "Identify the receiving custodian and confirm the complete physical serial range." }, next: items };
    return { result: { ok: true }, next: items.map(item => item.id !== id ? item : {
      ...item, state: "cowl_custody", acknowledgedBy: clean(receiver), acknowledgedDate: date,
      history: [...item.history, { action: "COWL custody acknowledged", date, officer: clean(receiver), detail: "Physical range " + item.first + "–" + item.last + " verified (simulation)" }],
    }) };
  }), [transact]);

  const issue = useCallback((id: string, serial: string, collectionRef: string, officer: string, date: string): Result => transact(items => {
    const b = items.find(b => b.id === id);
    if (!b || b.state !== "cowl_custody") return { result: { ok: false, error: "COWL must acknowledge physical custody before recording any receipt usage." }, next: items };
    if (!serialsInBooklet(b).includes(serial) || serialState(b, serial) !== "available")
      return { result: { ok: false, error: "The serial is not available for issuance. Existing issued/voided/missing numbers cannot be reused." }, next: items };
    if (!/^COL-DEMO-[A-Za-z0-9-]{1,25}$/.test(collectionRef) || clean(officer).length < 3 || !date)
      return { result: { ok: false, error: "Enter a demo-only collection reference (COL-DEMO-...), officer and date." }, next: items };
    if (items.some(x => x.usage.some(u => u.collectionRef.toLowerCase() === collectionRef.toLowerCase())))
      return { result: { ok: false, error: "This demo collection reference is already linked to another receipt." }, next: items };
    return { result: { ok: true }, next: items.map(item => item.id !== id ? item : {
      ...item, usage: [...item.usage, { serial, collectionRef, issuedBy: clean(officer), date }],
      history: [...item.history, { action: "Receipt issuance simulated", date, officer: clean(officer), detail: "OR " + serial + " paired with " + collectionRef }],
    }) };
  }), [transact]);

  const flag = useCallback((id: string, serial: string, kind: "voided" | "missing", reason: string, officer: string, date: string): Result => transact(items => {
    const b = items.find(b => b.id === id);
    if (!b || b.state !== "cowl_custody") return { result: { ok: false, error: "Only a booklet in COWL custody can report an exception." }, next: items };
    if (!serialsInBooklet(b).includes(serial) || serialState(b, serial) !== "available")
      return { result: { ok: false, error: "Only an unused, currently available serial may be flagged in this prototype." }, next: items };
    if (clean(reason).length < 10 || clean(officer).length < 3 || !date)
      return { result: { ok: false, error: "Give a reason (at least 10 characters), officer and date." }, next: items };
    return { result: { ok: true }, next: items.map(item => item.id !== id ? item : {
      ...item, exceptions: [...item.exceptions, { serial, kind, reason: clean(reason), reportedBy: clean(officer), date }],
      history: [...item.history, { action: "Receipt " + kind + " — simulated", date, officer: clean(officer), detail: "OR " + serial + " · " + clean(reason) }],
    }) };
  }), [transact]);

  const reset = useCallback((): Result => {
    try { localStorage.removeItem(STORE_KEY); localStorage.removeItem(LEGACY_KEY); }
    catch { return { ok: false, error: "Could not reset the browser-local demonstration." }; }
    setState(seedState()); window.dispatchEvent(new Event(SYNC_EVENT)); return { ok: true };
  }, []);

  return { booklets, collections, remittances, storageReady, register, assign,
    acknowledge, issue, flag, recordCollection, submitRemittance, reviewRemittance, reset };
}
