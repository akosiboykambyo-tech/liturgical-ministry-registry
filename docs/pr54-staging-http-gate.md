# PR #54 — staging HTTP integration gate

The new API is `POST /api/admin/production-registration-staging`. It is **not** used by Add Member or CSV and is disabled unless all these environment variables are explicitly set:

```text
PRODUCTION_REGISTRATION_STAGING_ENABLED=true
PRODUCTION_REGISTRATION_STAGING_PROJECT=rtptybxugjhvpfjvcvgw
PRODUCTION_REGISTRATION_STAGING_SCHEMA_READY=true
NEXT_PUBLIC_SUPABASE_URL=https://rtptybxugjhvpfjvcvgw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key belonging to isolated test project>
```

It validates a real Supabase user via `getUser(token)`, calls the database administrator self-check using the **same bearer token**, then invokes the SQL intake function with that token. On a token failure or database fault it fails closed. The API has no service-role key and no production deployment configuration.

**The endpoint is NOT yet ready for live HTTP use.** `public.registration_intake_v1` is installed in isolated staging but authenticated role EXECUTE is deliberately revoked and the new private administrator table has no seeded users. This is intentional: do not claim the endpoint works until its explicit staging-only role/grant rollout and authenticated HTTP tests pass.

Before enabling, validate updated SQL migration and staging grants; confirm the exact staging Auth UID using server verification; seed only the authorized test administrator; approve restricted DB function EXECUTE after checking internal authorization; test revoke, invalid token, duplicate reviews, same-key replay, different-key races, and injection/malformed data; then disable the role and permission or explicitly record why staging needs them. All live test writes must use synthetic names and record IDs for later controlled cleanup.

Production compatibility, review disposition/audit, full SQL-vs-JS fuzzy match equivalence, rollback and concurrency still remain to be validated. **Neither PR #53 nor #54 may be merged as a production registration feature at this point.**
