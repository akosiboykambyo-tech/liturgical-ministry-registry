-- COWL-DOK PR79 recovery dependencies inventory. READ ONLY.
-- Run on each source, then independently on the restored project.
-- Do not read/export rows, credentials, private object keys or customer files.
-- Compare source and its own restored snapshot, NOT TEST against PRODUCTION.
SELECT jsonb_pretty(jsonb_build_object(
  'captured_utc', now(),
  'postgres_version', current_setting('server_version'),
  'database_bytes', pg_database_size(current_database()),
  'user_triggers', (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object('schema', n.nspname, 'table', c.relname,
        'trigger_count', t.cnt)
      ORDER BY n.nspname, c.relname), '[]'::jsonb)
    FROM (
      SELECT tgrelid, count(*) AS cnt FROM pg_trigger
      WHERE NOT tgisinternal GROUP BY tgrelid
    ) t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'auth', 'storage', 'registry_private')
  ),
  'external_extensions', (
    SELECT coalesce(jsonb_agg(extname ORDER BY extname), '[]'::jsonb)
    FROM pg_extension
    WHERE extname IN ('pg_cron', 'pg_net', 'http', 'wrappers', 'pgmq', 'pg_graphql')
  ),
  'realtime_publications', (SELECT count(*) FROM pg_publication),
  'rls_policy_groups', (
    SELECT coalesce(jsonb_object_agg(schemaname, policy_count), '{}'::jsonb)
    FROM (
      SELECT schemaname, count(*) AS policy_count
      FROM pg_policies
      WHERE schemaname IN ('public', 'registry_private', 'storage')
      GROUP BY schemaname
    ) policies
  ),
  'storage_bucket_settings', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'bucket', id,
      'public', public,
      'file_size_limit_bytes', file_size_limit,
      'allowed_mime_type_count', coalesce(cardinality(allowed_mime_types), 0)
    ) ORDER BY id), '[]'::jsonb)
    FROM storage.buckets
  )
)) AS recovery_dependencies;