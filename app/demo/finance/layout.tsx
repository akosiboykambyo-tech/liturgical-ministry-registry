import "./finance-demo.css";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title:"Financial Stewardship — DEMONSTRATION ONLY", robots:{index:false,follow:false} };
export default function DemoLayout({children}:{children:React.ReactNode}) {
 if (process.env.VERCEL_ENV !== "preview" || process.env.NEXT_PUBLIC_FINANCIAL_DEMO !== "enabled" || process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://rtptybxugjhvpfjvcvgw.supabase.co") notFound();
 return <div className="finance-demo"><div role="note" className="finance-banner">DEMONSTRATION ONLY — Fictional data · Not valid for official use</div>{children}</div>;
}
