ALTER TABLE public.public_reports
DROP CONSTRAINT IF EXISTS public_reports_report_type_check;

ALTER TABLE public.public_reports
ADD CONSTRAINT public_reports_report_type_check
CHECK (report_type IN (
  'record_detail', 'authenticity', 'renewal', 'incident',
  'liturgy_assistance', 'vestment_loan', 'other'
));
