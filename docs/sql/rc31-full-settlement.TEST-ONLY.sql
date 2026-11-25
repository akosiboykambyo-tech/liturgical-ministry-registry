-- TEST only; linked RC3 requests must settle in full.
create or replace function rc3_demo.enforce_linked_settlement() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from rc3_demo.financial_links where payment_request_id=new.id) then
   if new.status<>'paid' or (select coalesce(sum(c.amount_centavos),0) from public.fs_collections c where c.payment_request_id=new.id and c.status='posted')<>new.total_due_centavos then
     raise exception 'RC3 renewal requires full payment; partial payments are not allowed' using errcode='23514';
   end if;
   perform rc3_demo.sync_settlement(new.id);
 end if;
 return new;
end $$;
revoke all on function rc3_demo.enforce_linked_settlement() from public,anon,authenticated;
