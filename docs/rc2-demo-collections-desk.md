# RC2 collections desk

The Collections and Receipts page uses role-filtered internal sections: OTC Payments (default for verifiers), QR Ph Verification, Receipt Issuance, and Collections Ledger. The navigation rail, sign-in and Curia remittance view remain unchanged.

OTC lookup is scoped to existing approved fictional obligations. It resolves parish, ministry, service year and remaining balance using the RLS-protected TEST records. The balance is a UI estimate; the existing guarded database RPC remains authoritative. A successful OTC/QR collection offers the receipt issuer the newly recorded collection; the user must still select their own acknowledged unused receipt and confirm written particulars. No fee or renewal approval is invented at the counter. No production data or schema changes.
