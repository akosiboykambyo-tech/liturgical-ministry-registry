import { notFound } from "next/navigation";
import type { Metadata } from "next";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title:"Financial Stewardship — DEMONSTRATION ONLY", robots:{index:false,follow:false} };
export default function DemoLayout({children}:{children:React.ReactNode}) {
 if (process.env.VERCEL_ENV !== "preview" || process.env.NEXT_PUBLIC_FINANCIAL_DEMO !== "enabled" || process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://rtptybxugjhvpfjvcvgw.supabase.co") notFound();
 return <><div role="note" className="bg-[#5A3600] px-4 py-2 text-center text-xs font-semibold tracking-wide text-white">DEMONSTRATION ONLY — FICTIONAL DATA · NOT VALID FOR OFFICIAL USE</div>{children}</>;
}
