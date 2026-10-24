import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { preflightRegistrationAdministrator } from "@/lib/production-registration-preflight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const PROJECT = "rtptybxugjhvpfjvcvgw";
function fail(status: number, error: string) {
 return NextResponse.json({ok:false,error},{status,headers:{"Cache-Control":"no-store"}});
}
export async function POST(request: Request) {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 let host="";
 try {host=url?new URL(url).hostname:"";} catch {}
 if(process.env.PRODUCTION_REGISTRATION_STAGING_ENABLED!=="true"||
    process.env.PRODUCTION_REGISTRATION_STAGING_PROJECT!==PROJECT||
    process.env.PRODUCTION_REGISTRATION_STAGING_SCHEMA_READY!=="true"||
    host!==PROJECT+".supabase.co"||!key) return fail(503,"Staging review disabled");
 const match=/^Bearer (\S+)$/i.exec(request.headers.get("authorization")||"");
 if(!match) return fail(401,"Authentication required");
 const authentication=createClient(url!,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const caller=createClient(url!,key,{auth:{persistSession:false,autoRefreshToken:false},
   global:{headers:{Authorization:"Bearer "+match[1]}}});
 const access=await preflightRegistrationAdministrator(match[1],authentication,caller,"true",true);
 if(!access.authorized) return fail(access.reason==="unauthenticated"?401:403,"Unauthorized");
 let payload:unknown;
 try {const raw=await request.text();if(raw.length>5000)return fail(413,"Request too large");payload=JSON.parse(raw);}catch{return fail(400,"Invalid JSON");}
 if(!payload||typeof payload!=="object"||Array.isArray(payload))return fail(400,"Invalid payload");
 const {reviewId,action,note}=payload as Record<string,unknown>;
 if(typeof reviewId!=="string"||! /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(reviewId)||
  (action!=="approved"&&action!=="dismissed")||typeof note!=="string"||note.trim().length<5||note.trim().length>1000)
  return fail(400,"Invalid disposition");
 try {
  const {data,error}=await caller.rpc("registration_resolve_review_v1",{p_review:reviewId,p_action:action,p_note:note});
  if(error) {
   if(error.code==="42501")return fail(403,"Forbidden");
   if(error.code==="23505")return fail(409,"Review already resolved");
   if(error.code==="P0002")return fail(404,"Review not found");
   if(error.code==="22023")return fail(400,"Invalid disposition");
   return fail(503,"Review resolution unavailable");
  }
  return NextResponse.json({ok:true,...data},{headers:{"Cache-Control":"no-store"}});
 }catch{return fail(503,"Review resolution unavailable");}
}
