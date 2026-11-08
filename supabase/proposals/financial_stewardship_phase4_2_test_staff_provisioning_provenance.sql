-- Phase 4.2 test only: audit provenance for operator-provisioned staging roles.
-- A user explicitly directed that two EXISTING test Auth accounts be assigned
-- separate COWL and Curia custody roles. The operator used a privileged,
-- traceable database administrative action, not a signed-in staff approver.
-- Do not attribute that grant falsely to any test user's Auth identity.
alter table public.fs_staff_grants
  add column provisioning_method text not null default 'staff_approved'
    check (provisioning_method in ('staff_approved','operator_authorized_test')),
  add column authorization_reference text;

alter table public.fs_staff_grants
  alter column granted_by drop not null;

alter table public.fs_staff_grants
  add constraint fs_staff_grant_provisioning_provenance_ck
  check (
    (provisioning_method='staff_approved' and granted_by is not null)
    or
    (provisioning_method='operator_authorized_test'
      and granted_by is null
      and length(btrim(coalesce(authorization_reference,''))) between 20 and 500)
  );

comment on column public.fs_staff_grants.authorization_reference is
  'Nonsecret source of external approval, required for isolated test operator provisioning; no passwords or PII.';
