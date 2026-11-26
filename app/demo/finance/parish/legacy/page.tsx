import {notFound} from "next/navigation";
import ParishSubmission from "@/components/financial-stewardship/rc31-parish-submission";
export default function Page(){
 if(process.env.NEXT_PUBLIC_RENEWAL_DEMO!=="enabled")notFound();
 return <ParishSubmission/>;
}
