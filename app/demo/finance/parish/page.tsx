import {notFound} from "next/navigation";
import Phase33Portal from "@/components/parish-renewal/phase33-portal";
export default function Page(){if(process.env.NEXT_PUBLIC_RENEWAL_DEMO!=="enabled")notFound();return <Phase33Portal/>;}
