import {notFound} from "next/navigation";
import PolicyRehearsal from "@/components/financial-stewardship/rc31-policy-rehearsal";
export default function Page(){
 if(process.env.NEXT_PUBLIC_RENEWAL_DEMO!=="enabled")notFound();
 return <PolicyRehearsal/>;
}
