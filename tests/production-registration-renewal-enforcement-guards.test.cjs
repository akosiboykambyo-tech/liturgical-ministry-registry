const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=(f)=>fs.readFileSync(path.join(root,f),"utf8");
const staging=read("docs/sql/pr55-staging-one-year-ministry-guard.INSTALL-ISOLATED-ONLY.sql");
const review=read("docs/sql/pr55-production-one-year-ministry-validity.REVIEW-ONLY.sql");
const rpc=read("docs/sql/pr55-production-hardened-renewal-batch.REVIEW-ONLY.sql");
const lab=read("docs/sql/pr55-staging-renewal-batch-lab.ROLLBACK-ONLY.sql");
const scratch=read("docs/sql/pr55-staging-renewal-constraint-lab.ROLLBACK-ONLY.sql");

test("the permanent ministry validity guard is isolated to staging",()=>{
 assert.match(staging,/ISOLATED STAGING ONLY/);
 assert.match(staging,/to_regclass\('public\.recommendation_renewal_batches'\) IS NOT NULL/);
 assert.match(staging,/count\(\*\) FROM public\.members\) <> 1008/);
 assert.match(staging,/count\(\*\) FROM public\.member_ministries\) <> 12/);
 assert.match(staging,/CREATE TRIGGER trg_pr55_ministry_one_year/);
 assert.match(staging,/BEFORE INSERT OR UPDATE ON public\.member_ministries/);
 assert.match(staging,/SECURITY INVOKER/);
 assert.match(staging,/SET search_path = ''/);
 assert.match(staging,/REVOKE ALL ON FUNCTION registry_private\.enforce_member_ministry_year_v1/);
});
test("ministry validity is one calendar year after the proper status-specific anchor",()=>{
 for(const f of [staging,review]){
  assert.match(f,/WHEN NEW\.status = 'New' THEN NEW\.start_date/);
  assert.match(f,/ELSE NEW\.renewal_date/);
  assert.match(f,/NEW\.expiration_date IS DISTINCT FROM \(v_anchor \+ INTERVAL '1 year'\)::date/);
  assert.match(f,/NEW\.status IS DISTINCT FROM OLD\.status/);
  assert.match(f,/NEW\.renewal_date IS DISTINCT FROM OLD\.renewal_date/);
  assert.match(f,/IF NOT v_check OR NEW\.status NOT IN \('New','Renewed'\) THEN/);
 }
});
test("production proposals are deliberately unreachable, dependent on admin security and exact-year database constraints",()=>{
 for(const f of [review,rpc]){
  assert.match(f,/BEGIN;/);
  assert.match(f,/RAISE EXCEPTION[\s\S]*NO-GO/);
  assert.match(f,/registry_private\.registration_administrators/);
 }
 assert.match(review,/CHECK \(next_renewal_date = \(renewal_date \+ INTERVAL '1 year'\)::date\)/);
 assert.match(review,/CONSTRAINT pr55_renewal_snapshot_exact_year/);
 assert.match(review,/NOT VALID/);
 assert.match(rpc,/v_expires := \(p_renewal_date \+ INTERVAL '1 year'\)::date/);
 assert.match(rpc,/p_next_renewal_date IS DISTINCT FROM v_expires/);
 assert.match(rpc,/v_expires,p_renewal_date,p_document_url/);
 assert.match(rpc,/renewal_date=p_renewal_date,/);
 assert.match(rpc,/expiration_date=v_expires/);
 assert.doesNotMatch(rpc,/expiration_date=p_next_renewal_date/);
});
test("renewal RPC uses the revocable administrator grant, row locking, exact selection, and pending summary",()=>{
 assert.match(rpc,/a\.user_id=v_actor AND a\.active AND a\.revoked_at IS NULL FOR SHARE/);
 assert.match(rpc,/PERFORM public\.check_renewal_admin_access\(\)/);
 assert.match(rpc,/ORDER BY m\.id FOR UPDATE/);
 assert.match(rpc,/ORDER BY mm\.id FOR UPDATE/);
 assert.match(rpc,/mm\.status IN \('New','Renewed'\)/);
 assert.match(rpc,/v_expected<>cardinality\(p_membership_ids\)/);
 assert.match(rpc,/WHEN state\.pending>0 THEN 'Pending Verification'/);
 assert.match(rpc,/REVOKE ALL ON FUNCTION public\.process_recommendation_renewal_batch/);
});
test("renewal lab is explicitly ROLLBACK ONLY and checks historical exceptions, leap day and auth",()=>{
 assert.match(lab,/^BEGIN;/m);
 assert.match(lab,/ROLLBACK;\s*$/);
 assert.match(lab,/CREATE SCHEMA registry_renewal_lab/);
 assert.match(lab,/PERFORM set_config\('request\.jwt\.claim\.sub',gen_random_uuid\(\)::text,true\)/);
 assert.match(lab,/Nonadmin invoked renewal successfully/);
 assert.match(lab,/Historical invalid row accepted validity change/);
 assert.match(lab,/Pending ministry illegally renewed/);
 assert.match(lab,/Tampered next date accepted/);
 assert.match(scratch,/^BEGIN;/m);
 assert.match(scratch,/ROLLBACK;\s*$/);
 assert.match(scratch,/date '2028-02-29'/);
 assert.match(scratch,/date '2029-02-28'/);
 assert.match(scratch,/Shorter-than-year batch accepted/);
 assert.match(scratch,/Longer-than-year batch accepted/);
});
