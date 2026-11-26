import {notFound} from "next/navigation";
import Phase16Portal from "@/components/parish-renewal/phase16-portal";
export default function Page(){
 if(process.env.NEXT_PUBLIC_RENEWAL_DEMO!=="enabled")notFound();
 return <Phase16Portal walkIn/>;
}
