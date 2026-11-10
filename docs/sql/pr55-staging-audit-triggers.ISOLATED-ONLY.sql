-- PR55 isolated TEST project only: add the audit triggers expected by the
-- secure member/ministry mutations. Does not backfill or modify existing rows.
-- Requires the schema-only staging history migration already installed.
DO $guard$
BEGIN
 IF to_regclass('public.audit_logs') IS NULL THEN
   RAISE EXCEPTION 'Missing audit_logs';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname IN (
   'trg_pr55_stage_log_members','trg_pr55_stage_log_ministries',
   'trg_pr55_stage_touch_ministry_updated_at') AND NOT tgisinternal) THEN
   RAISE EXCEPTION 'PR55 staging audit triggers already exist';
 END IF;
END $guard$;

CREATE OR REPLACE FUNCTION registry_private.pr55_stage_log_member_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $audit$
BEGIN
 IF TG_OP = 'INSERT' THEN
   INSERT INTO public.audit_logs(member_id,admin_action,previous_state,new_state)
   VALUES(NEW.id,'INSERT',NULL,to_jsonb(NEW));
   RETURN NEW;
 ELSIF TG_OP = 'UPDATE' THEN
   INSERT INTO public.audit_logs(member_id,admin_action,previous_state,new_state)
   VALUES(NEW.id,'UPDATE',to_jsonb(OLD),to_jsonb(NEW));
   RETURN NEW;
 END IF;
 INSERT INTO public.audit_logs(member_id,admin_action,previous_state,new_state)
 VALUES(OLD.id,'DELETE',to_jsonb(OLD),NULL);
 RETURN OLD;
END $audit$;
REVOKE ALL ON FUNCTION registry_private.pr55_stage_log_member_v1() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION registry_private.pr55_stage_log_ministry_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $audit$
DECLARE v_action text;
DECLARE v_old jsonb;
DECLARE v_new jsonb;
DECLARE v_member_id uuid;
BEGIN
 IF TG_OP = 'INSERT' THEN
   v_action := 'Ministry Added';
   v_old := NULL;
   v_new := to_jsonb(NEW)||jsonb_build_object('entity_type','member_ministry','membership_id',NEW.id);
   v_member_id := NEW.member_id;
 ELSIF TG_OP = 'UPDATE' THEN
   IF (to_jsonb(OLD) - 'updated_at')=(to_jsonb(NEW) - 'updated_at') THEN
     RETURN NEW;
   END IF;
   v_action := 'Ministry Update';
   v_old := to_jsonb(OLD)||jsonb_build_object('entity_type','member_ministry','membership_id',OLD.id);
   v_new := to_jsonb(NEW)||jsonb_build_object('entity_type','member_ministry','membership_id',NEW.id);
   v_member_id := NEW.member_id;
 ELSE
   v_action := 'Ministry Removed';
   v_old := to_jsonb(OLD)||jsonb_build_object('entity_type','member_ministry','membership_id',OLD.id);
   v_new := NULL;
   v_member_id := OLD.member_id;
 END IF;
 INSERT INTO public.audit_logs(member_id,admin_action,previous_state,new_state)
 VALUES(v_member_id,v_action,v_old,v_new);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $audit$;
REVOKE ALL ON FUNCTION registry_private.pr55_stage_log_ministry_v1() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION registry_private.pr55_stage_touch_ministry_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $touch$
BEGIN
 NEW.updated_at := transaction_timestamp();
 RETURN NEW;
END $touch$;
REVOKE ALL ON FUNCTION registry_private.pr55_stage_touch_ministry_v1() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_pr55_stage_log_members
  AFTER INSERT OR UPDATE OR DELETE ON public.members
  FOR EACH ROW EXECUTE FUNCTION registry_private.pr55_stage_log_member_v1();
CREATE TRIGGER trg_pr55_stage_log_ministries
  AFTER INSERT OR UPDATE OR DELETE ON public.member_ministries
  FOR EACH ROW EXECUTE FUNCTION registry_private.pr55_stage_log_ministry_v1();
CREATE TRIGGER trg_pr55_stage_touch_ministry_updated_at
  BEFORE UPDATE ON public.member_ministries
  FOR EACH ROW EXECUTE FUNCTION registry_private.pr55_stage_touch_ministry_v1();

DO $verify$
BEGIN
 IF (SELECT count(*) FROM pg_trigger WHERE tgname IN
 ('trg_pr55_stage_log_members','trg_pr55_stage_log_ministries',
  'trg_pr55_stage_touch_ministry_updated_at') AND NOT tgisinternal)<>3 THEN
    RAISE EXCEPTION 'Expected staging audit and updated_at triggers missing';
 END IF;
END $verify$;
