import {notFound} from "next/navigation";
import RenewalDesk from "@/components/financial-stewardship/rc3-renewal-desk";
export default function Page(){
 if(process.env.NEXT_PUBLIC_RENEWAL_DEMO!=="enabled")notFound();
 return <RenewalDesk/>;
}
