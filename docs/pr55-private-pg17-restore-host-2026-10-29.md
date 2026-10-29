## October 29 — only the existing Windows PC is available

The operator confirms there is **no second computer, private Linux server or VM**. Earlier local checks showed approximately 8 GB RAM, 29 GB system-drive free, no working WSL2/Docker, and native PostgreSQL 18 without a compatible Supabase Vault extension. We must **not** assert a full Supabase/PostgreSQL 17 restore is possible on this host before reading its current hardware and storage state.

`scripts/pr55-windows-recovery-readiness.ps1` is a small, ordinary-user **read-only and offline** prerequisite inventory for the Windows build, installed RAM, virtualization/SLAT reporting, CPU count, **all local fixed-drive free space**, WSL --status, and Docker CLI presence. It never changes Windows features, installs packages or accesses any backup/production data. This identifies whether WSL2/Docker might be feasible or a lighter DB-only recovery rehearsal needs further review. A successful diagnostic **cannot certify restoration**.

Operator command on PR55 branch:

```powershell
git switch fix/production-registration-compatibility
git pull --ff-only origin fix/production-registration-compatibility
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\pr55-windows-recovery-readiness.ps1
```

The local execution-policy override applies to this process only; it does not change machine configuration. Share the **hardware/status summary** only (no Windows username, directory paths, backups, keys, or passwords). Determine the next feasible recovery method after reviewing actual output.

References: Docker Desktop requires virtualization and 8 GB RAM; Supabase self-hosted all-services minimum 4 GB RAM/40 GB SSD, recommended 8 GB+/80 GB+. The existing October 26 backup is **stale** relative to the production reset; the fresh database plus private Storage objects recovery remains **NO-GO** until a compatible isolated host is certified.
