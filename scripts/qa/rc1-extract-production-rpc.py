#!/usr/bin/env python3
"""Extract source-identical Production Registry RPC definitions for LOCAL-only QA.

The published RC1 migration contains Production's actual function bodies (the
live source was normalized and compared in a read-only catalog inspection).
This intentionally SKIPS the Production-only preflight and postflight DO
blocks; isolated fixture preconditions are enforced separately by the test.
Never call this against TEST or Production.
"""
import pathlib, re, sys

source = pathlib.Path("supabase/migrations/20261120161500_rc1_production_guarded_registry_rpc_compatibility.sql").read_text(encoding="utf-8")
out = []
for name in ("registry_sync_member_mirror_v1", "registry_admin_member_write_v1", "registry_verify_ministries_v3"):
    schema = "registry_private" if name == "registry_sync_member_mirror_v1" else "public"
    pattern = r"CREATE OR REPLACE FUNCTION " + re.escape(f"{schema}.{name}") + r"\([^\n]+\)[\s\S]*?\$function\$\s*;"
    match = re.search(pattern, source)
    if not match:
        sys.exit(f"Required RC1 function not found in migration: {schema}.{name}")
    out.append(match.group())
start = source.index("-- Explicit privilege boundary; ownership is via Supabase migration executor.")
end = source.index("DO $postflight$", start)
out.append(source[start:end])
target = pathlib.Path(sys.argv[1])
target.write_text("-- Exact published RC1 functions (NO Production preflight/postflight).\n" + "\n\n".join(out), encoding="utf-8")
print("Extracted exactly three published RC1 RPC functions and their grants for isolated QA.")
