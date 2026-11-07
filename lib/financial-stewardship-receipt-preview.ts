/**
 * Phase 1: display-only transcription of the physical receipt supplied for
 * interface design. This is NOT a transaction, inventory assignment, or
 * validation of the official diocesan accounting code / fee schedule.
 */
export type ReceiptReference = {
  serial: string;
  issuer: string;
  receiptDate: string;
  receivedFrom: string;
  ministryOnPaper: string;
  ministryInRegistry: string;
  renewalYear: string;
  purpose: string;
  printedDescription: string;
  participantCount: number;
  feeCentavos: number;
  amountCentavos: number;
  printedCode: string;
  amountInWords: string;
  paymentMethod: string;
};

export const REFERENCE_RECEIPT: ReceiptReference = {
  serial: "057785",
  issuer: "The Roman Catholic Bishop of Kalookan",
  receiptDate: "2026-10-29",
  receivedFrom: "San Bartolome Parish",
  ministryOnPaper: "MINISTRY ON LITURGICAL MUSIC",
  ministryInRegistry: "Ministry of Liturgical Music",
  renewalYear: "2026",
  purpose: "Renewal Year 2026 — Solidarity Fee",
  printedDescription: "PDF - Remittance for COWL",
  participantCount: 113,
  feeCentavos: 5000,
  amountCentavos: 565000,
  printedCode: "4433025",
  amountInWords: "Five Thousand Six Hundred Fifty Pesos Only",
  // The image shows a cash amount but does not clearly show a checked box.
  paymentMethod: "Not conclusively marked on sample",
};

/** Fictional fee breakdowns for the existing demo ledger (not policy rates). */
export const DEMO_RECEIPT_BREAKDOWNS: Record<string, {
  participantCount: number;
  feeCentavos: number;
  renewalYear: string;
  printedCode: string;
}> = {
  "000101": { participantCount: 40, feeCentavos: 5000, renewalYear: "2026", printedCode: "" },
  "000102": { participantCount: 30, feeCentavos: 5000, renewalYear: "2026", printedCode: "" },
  "000103": { participantCount: 50, feeCentavos: 5000, renewalYear: "2026", printedCode: "" },
  "000104": { participantCount: 36, feeCentavos: 5000, renewalYear: "2026", printedCode: "" },
  "000105": { participantCount: 64, feeCentavos: 5000, renewalYear: "2026", printedCode: "" },
  "000106": { participantCount: 24, feeCentavos: 5000, renewalYear: "2026", printedCode: "" },
};

/** String parsing only; never convert a receipt's printed serial to number. */
export function parsePesoAmountToCentavos(value: string): number | null {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const amount = Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
}
