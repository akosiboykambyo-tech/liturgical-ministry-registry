const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const root='components/financial-stewardship/';
test('RC3 admin-only separate landing; finance remains in COWL',()=>{const s=read('lib/financial-stewardship/staging-workspaces.ts');assert.match(s,/if\(access\?\.admin===true\)workspaces\.push\("renewals"\)/);assert.doesNotMatch(s,/admin===true\|\|access\?\.finance/);});
test('RC3 embedded payment obligations use existing COWL shell and finance role',()=>{const s=read(root+'staging-receipt-custody.tsx');assert.match(s,/renewalEnabled&&mode==="cowl"&&roles.includes\("cowl_finance_verifier"\)/);assert.match(s,/<RenewalDesk embedded onOpenCollection=/);assert.match(s,/initialReference=\{collectionHandoff\?\.reference\}/);});
test('RC3 settlement routes reuse approved finance wrappers, not independent cashier',()=>{const s=read(root+'staging-financial-operations.tsx'),d=read(root+'rc3-renewal-desk.tsx');assert.match(s,/rc3_demo_post_otc/);assert.match(s,/rc3_demo_post_qr/);assert.doesNotMatch(d,/rc3_demo_pay"/);assert.match(d,/rc3_demo_prepare_qr/);});
test('RC3 remains TEST guarded',()=>{const s=read('app/demo/finance/layout.tsx');assert.match(s,/VERCEL_ENV !== "preview"/);assert.match(s,/rtptybxugjhvpfjvcvgw/);});
