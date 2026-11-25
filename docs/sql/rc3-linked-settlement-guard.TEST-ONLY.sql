-- TEST ONLY. Rollback: drop trigger rc3_linked_settlement_after_status on public.fs_payment_requests; drop function rc3_demo.enforce_linked_settlement(); (review linked settlements before rollback).
set local lock_timeout='3s';
create function rc3_demo.enforce_linked_settlement() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from rc3_demo.financial_links where payment_request_id=new.id) then
   perform rc3_demo.sync_settlement(new.id);
 end if;
 return new;
end $$;
revoke all on function rc3_demo.enforce_linked_settlement() from public,anon,authenticated;
create trigger rc3_linked_settlement_after_status
 after update of status on public.fs_payment_requests
 for each row when (new.payment_reference like 'RC3-DEMO-%' and new.status in ('part_paid','paid'))
 execute function rc3_demo.enforce_linked_settlement();
