-- PR #55 — ISOLATED STAGING READ-ONLY SQL/JS IDENTITY PARITY FIXTURES
-- Requires extensions.fuzzystrmatch. Do NOT use to activate registration.
-- SQL expected values are derived from lib/registration-matching.ts behavior.
-- Supplemental-plane Unicode (UTF-8 4-byte) is intentionally omitted here:
-- candidate intake fails closed on such names until parity is redesigned.
WITH fixtures(case_name,first_a,last_a,first_b,last_b,js_matches) AS (
 VALUES
  ('exact whitespace','  Ana','Cruz','ana','cruz',true),
  ('leading tab',E'\tAna','Cruz','Ana','Cruz',true),
  ('trailing newline',E'Ana\n','Cruz','Ana','Cruz',true),
  ('internal tab',E'Anne\tMarie','Cruz','Anne Marie','Cruz',true),
  ('nonbreaking space','Ana Marie','Cruz','Ana Marie','Cruz',true),
  ('accent case','CafÉ','Cruz','café','Cruz',true),
  ('dotted I','İnez','Garcia','inez','Garcia',true),
  ('equal short first / fuzzy surname','Ana','Fitzgerald','Ana','Fitzgeralt',true),
  ('different short first / fuzzy surname','Ana','Fitzgerald','Ann','Fitzgeralt',false),
  ('different numeric suffix','Subject 3','Cruz','Subject 4','Cruz',false),
  ('equal short surname / fuzzy first','Fitzgerald','Ana','Fitzgeralt','Ana',true),
  ('repeated spaces','Maria  Luz','Cruz','maria luz','Cruz',true)
),
n AS (
 SELECT case_name,js_matches,
  lower(btrim(regexp_replace(first_a,'[[:space:]]+',' ','g'))) AS af,
  lower(btrim(regexp_replace(last_a,'[[:space:]]+',' ','g'))) AS al,
  lower(btrim(regexp_replace(first_b,'[[:space:]]+',' ','g'))) AS bf,
  lower(btrim(regexp_replace(last_b,'[[:space:]]+',' ','g'))) AS bl
 FROM fixtures
),
evaluated AS (
 SELECT case_name,js_matches,
 (af=bf OR
  (length(af)>3 AND length(bf)>3 AND
   btrim(regexp_replace(af,'[^0-9]+','|','g'),'|')=btrim(regexp_replace(bf,'[^0-9]+','|','g'),'|')
   AND (1-extensions.levenshtein(af,bf)::numeric/greatest(length(af),length(bf)))>=0.8))
 AND
 (al=bl OR
  (length(al)>3 AND length(bl)>3 AND
   btrim(regexp_replace(al,'[^0-9]+','|','g'),'|')=btrim(regexp_replace(bl,'[^0-9]+','|','g'),'|')
   AND (1-extensions.levenshtein(al,bl)::numeric/greatest(length(al),length(bl)))>=0.8))
 AS sql_matches
 FROM n
)
SELECT case_name,js_matches,sql_matches,(js_matches=sql_matches) AS parity_ok
FROM evaluated ORDER BY case_name;