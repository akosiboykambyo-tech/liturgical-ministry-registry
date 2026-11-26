"use client";
import {useState} from "react";
import {ebGaramond} from "@/app/fonts";
import {ArrowRight,ShieldCheck} from "@/components/phosphor-icons";
import {findActiveSampleCoordinator,sampleCoordinators,type SampleCoordinator} from "@/lib/financial-stewardship/sample-parish-coordinators";
const field="min-h-14 w-full border border-[#CDBFC3] bg-white px-4 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#890022]";
const button="flex min-h-14 w-full items-center justify-center gap-2 bg-[#890022] px-4 text-base font-semibold text-white disabled:opacity-40";
export default function SampleParishSignIn({onVerified,records=sampleCoordinators}:{onVerified:(c:SampleCoordinator)=>void;records?:SampleCoordinator[]}){
 const [phone,setPhone]=useState(""),[challenge,setChallenge]=useState(false),[code,setCode]=useState(""),[error,setError]=useState("");
 const [issuedTo,setIssuedTo]=useState("");
 function requestCode(){const c=findActiveSampleCoordinator(phone,records);if(!c){setError("This sample mobile number is not authorized for parish access.");return;}setIssuedTo(c.id);setChallenge(true);setCode("");setError("");}
 function verify(){const c=findActiveSampleCoordinator(phone,records);if(!c||c.id!==issuedTo||code!=="246810"){setError("Unable to verify the sample code. Check the code and try again.");return;}onVerified(c);}
 return <><h1 className={ebGaramond.className+" text-[44px] leading-none sm:text-5xl"}>Parish Portal</h1><p className="mt-3 text-sm text-[#706167]">Sign in using your registered mobile number.</p>
 <form className="mt-7 space-y-4" onSubmit={e=>{e.preventDefault();challenge?verify():requestCode()}}>
 <label className="block space-y-2"><span className="block text-sm font-semibold">Mobile number</span><input className={field} type="tel" inputMode="tel" autoComplete="off" placeholder="09XX XXX XXXX" value={phone} maxLength={20} readOnly={challenge} required onChange={e=>{setPhone(e.target.value);setError("")}}/></label>
 {challenge&&<><p role="status" className="text-sm">Sample SMS code: <strong>246810</strong>. No message is sent.</p><label className="block space-y-2"><span className="block text-sm font-semibold">Verification code</span><input className={field+" tracking-widest"} inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={6} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} required/></label></>}
 {error&&<p role="alert" className="text-sm text-[#92202A]">{error}</p>}
 <button className={button} type="submit" disabled={challenge?code.length!==6:!phone.trim()}>{challenge?"Verify and sign in":"Send verification code"}<ArrowRight className="h-4 w-4"/></button>
 {challenge&&<button className="text-sm font-semibold underline" type="button" onClick={()=>{setChallenge(false);setIssuedTo("");setCode("");setError("")}}>Change mobile number</button>}
 </form><div className="mt-6 border-t pt-4 text-xs leading-5 text-[#706167]"><p>Sample mobile numbers: 09000000021 or 09000000031.</p></div></>;
}
