import { DemoCardLink, DemoHeading, DemoTag } from "./_components/demo-ui";

export default function PrototypeHome() {
  return <>
    <DemoHeading eyebrow="COWL-DOK · DESIGN TEST" title="Workflow Prototypes" description="Explore the proposed Member Management reconstruction, OTP-based parish self-service, and Commission–Curia payment reconciliation. The examples use invented parish data and simulate actions only." action={<DemoTag tone="warn">Not connected to production</DemoTag>}/>
    <div className="grid gap-4 lg:grid-cols-3">
      <DemoCardLink href="/prototype/registration" icon="registration" title="Registration Workspace" description="A unified three-view admin desk for CSV drafts, new registrations, renewals, review cases, documentary approval, and history." foot="Test administrative flows"/>
      <DemoCardLink href="/prototype/parish" icon="parish" title="Parish Renewal Portal" description="A single parish-specific page with demo OTP, cross-ministry roster review, unlisted members, recommendation letters, QR or OTC payment claims." foot="Test coordinator experience"/>
      <DemoCardLink href="/prototype/curia" icon="finance" title="Collections & Remittances" description="A reconciliation register distinguishing QR and OTC, receiving custody, verification, remittance, Curia acknowledgment, and adjustments." foot="Test finance review"/>
    </div>
    <section className="mt-7 rounded-lg border-l-4 border-[#890022] bg-[#F7EFF1] p-5">
      <h2 className="text-sm font-semibold">What can be tested?</h2>
      <p className="mt-2 text-sm leading-6 text-[#67545B]">Switch views, create fictional submission drafts, inspect review cases, simulate OTP, select roster entries, add an unlisted minister, attach local filenames, choose payment methods, and reconcile sample transactions. No SMS is sent, no files are uploaded, no QR code accepts money, and all changes reset when the page reloads.</p>
    </section>
  </>;
}
