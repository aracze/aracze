-- Karta „Elektřina" (blok Praktické informace / Nice-to-know) — opravy údajů o zásuvkách
-- podle přehledu IEC World Plugs (kontrola všech 66 zemí 11. 9. 2026, rozhodnutí uživatele
-- „opravit, co je na webu špatně"):
--   1. Bulharsko, Rakousko, Madeira uváděly jen typ F, Chorvatsko jen C — všude jsou C & F.
--   2. Sardinie a Sicílie „F & L" → „C, F & L" (stejně jako Itálie, jejíž jsou součástí).
--   3. Turecko a Ukrajina 220 V → 230 V (oficiální napětí, stejně jako zbytek Evropy).
--   4. Dánsko „C, F, E, K" a Monako „C, E, F" → jednotný tvar „C, E, F & K" / „C, E & F".
--   5. Všude „hz" → „Hz" (značka jednotky se píše s velkým H): 230V/50hz → 230V/50Hz.
-- Mění se jen položky typu electricity v bloku niceToKnowBlock (title a value), nic jiného.
-- Idempotentní; původní texty do zaloha.texts_zasuvky_2026_09_11. Z verzí poslední PUBLIKOVANÁ
-- a k tomu nejnovější řádek (latest — rozpracovaný draft editora, který by při dalším Publish
-- opravu vrátil zpět); starší historie zůstává.
-- Spuštění (dev):  docker compose exec -T postgres psql -U postgres -d aracze < scripts/zasuvky-karty-opravy.sql
-- Prod: stejně proti produkční DB (služba `postgres`), potom `docker compose up -d --force-recreate cms` (cache).
BEGIN;
CREATE SCHEMA IF NOT EXISTS zaloha;

-- Opravy titulků vázané na stránku (full_slug). Starý titulek se kontroluje přesně,
-- aby se po ruční opravě v adminu nic nepřepsalo dvakrát.
CREATE TEMP TABLE tituly (slug text, old_title text, new_title text) ON COMMIT DROP;
INSERT INTO tituly VALUES
  ('/bulharsko/prakticke-informace',  'Zásuvka typu F',          'Zásuvka typu C & F'),
  ('/rakousko/prakticke-informace',   'Zásuvka typu F',          'Zásuvka typu C & F'),
  ('/portugalsko/madeira/prakticke-informace',    'Zásuvka typu F',          'Zásuvka typu C & F'),
  ('/chorvatsko/prakticke-informace', 'Zásuvka typu C',          'Zásuvka typu C & F'),
  ('/italie/sardinie/prakticke-informace',   'Zásuvka typu F & L',      'Zásuvka typu C, F & L'),
  ('/italie/sicilie/prakticke-informace',    'Zásuvka typu F & L',      'Zásuvka typu C, F & L'),
  ('/dansko/prakticke-informace',     'Zásuvka typu C, F, E, K', 'Zásuvka typu C, E, F & K'),
  ('/monako/prakticke-informace',     'Zásuvka typu C, E, F',    'Zásuvka typu C, E & F');

CREATE TEMP TABLE napeti (slug text, old_value text, new_value text) ON COMMIT DROP;
INSERT INTO napeti VALUES
  ('/turecko/prakticke-informace',  '220V/50hz', '230V/50Hz'),
  ('/ukrajina/prakticke-informace', '220V/50hz', '230V/50Hz');

-- Jedna položka karty: titulek a napětí podle tabulek, „hz" → „Hz" všude.
CREATE FUNCTION pg_temp.fix_item(doc_slug text, item jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE t text := item->>'title'; v text := item->>'value';
BEGIN
  -- Položka bez typu nebo s prázdným titulkem/hodnotou se nechá být (jsonb_set
  -- s NULL by celou kartu nahradil JSON null a web by na ní spadl).
  IF COALESCE(item->>'type', '') <> 'electricity' OR t IS NULL OR v IS NULL THEN RETURN item; END IF;
  -- Skalární poddotazy: dvě řádky pro tutéž stránku by skript shodily, ne tiše přepsaly.
  t := COALESCE((SELECT new_title FROM tituly WHERE slug = doc_slug AND old_title = t), t);
  v := COALESCE((SELECT new_value FROM napeti WHERE slug = doc_slug AND old_value = v), v);
  v := regexp_replace(v, '(\d)hz\M', '\1Hz', 'g');
  item := jsonb_set(item, '{title}', to_jsonb(t));
  item := jsonb_set(item, '{value}', to_jsonb(v));
  RETURN item;
END $$;

-- Celý text: bloky niceToKnowBlock na nejvyšší úrovni (jinde nejsou — hlídá pojistka níž).
CREATE FUNCTION pg_temp.fix_text(doc_slug text, t jsonb) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN t IS NULL OR jsonb_typeof(t->'root'->'children') <> 'array' THEN t ELSE
    jsonb_set(t, '{root,children}', COALESCE((
      SELECT jsonb_agg(
        CASE WHEN c->'fields'->>'blockType' = 'niceToKnowBlock' AND jsonb_typeof(c->'fields'->'items') = 'array'
             THEN jsonb_set(c, '{fields,items}', COALESCE((
                    SELECT jsonb_agg(pg_temp.fix_item(doc_slug, it) ORDER BY o)
                    FROM jsonb_array_elements(c->'fields'->'items') WITH ORDINALITY AS x(it, o)), '[]'::jsonb))
             ELSE c END
        ORDER BY ord)
      FROM jsonb_array_elements(t->'root'->'children') WITH ORDINALITY AS e(c, ord)
    ), '[]'::jsonb))
  END
$$;

CREATE TEMP TABLE src_pages ON COMMIT DROP AS
SELECT p.id, p.full_slug, p.text AS old_text, pg_temp.fix_text(p.full_slug, p.text) AS new_text
FROM pages p
WHERE p.text::text LIKE '%niceToKnowBlock%'
FOR UPDATE OF p;
DELETE FROM src_pages WHERE old_text = new_text;

-- Verze k přepisu: poslední PUBLIKOVANÁ každé stránky + nejnovější řádek (latest, může být
-- draft) — jeden zdroj pro přepis i pro pojistku níž.
CREATE TEMP TABLE verze ON COMMIT DROP AS
SELECT DISTINCT ON (v.parent_id) v.id AS version_id, v.parent_id AS page_id, v.version_text
FROM _pages_v v
WHERE v.version__status = 'published' AND v.version_text IS NOT NULL
ORDER BY v.parent_id, v.updated_at DESC, v.id DESC;
INSERT INTO verze
SELECT v.id, v.parent_id, v.version_text FROM _pages_v v
WHERE v.latest AND v.version_text IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM verze z WHERE z.version_id = v.id);

CREATE TEMP TABLE src_versions ON COMMIT DROP AS
SELECT v.version_id, v.page_id, v.version_text AS old_text,
       pg_temp.fix_text(p.full_slug, v.version_text) AS new_text
FROM verze v JOIN pages p ON p.id = v.page_id
WHERE v.version_text::text LIKE '%niceToKnowBlock%';
DELETE FROM src_versions WHERE old_text = new_text;

CREATE TABLE IF NOT EXISTS zaloha.texts_zasuvky_2026_09_11 (
  scope text, doc_id int, version_id int, old_text jsonb, zalohovano timestamptz DEFAULT now()
);
INSERT INTO zaloha.texts_zasuvky_2026_09_11 (scope, doc_id, version_id, old_text)
SELECT 'page', id, NULL, old_text FROM src_pages
UNION ALL SELECT 'page', page_id, version_id, old_text FROM src_versions;

UPDATE pages p SET text = s.new_text FROM src_pages s WHERE p.id = s.id;
UPDATE _pages_v v SET version_text = s.new_text FROM src_versions s WHERE v.id = s.version_id;

-- Karty Elektřina PO přepisu — v pages i v poslední publikované verzi, v libovolné hloubce
-- textu; jeden zdroj pro výpis i pro pojistku.
CREATE TEMP TABLE karty_po ON COMMIT DROP AS
WITH texty AS (
  SELECT p.full_slug, p.text FROM pages p WHERE p.text::text LIKE '%niceToKnowBlock%'
  UNION ALL
  -- Živý text z _pages_v, ne snímek ve `verze` (ten je z doby před přepisem).
  SELECT p.full_slug, v.version_text
  FROM verze z JOIN _pages_v v ON v.id = z.version_id JOIN pages p ON p.id = z.page_id
)
SELECT t.full_slug, i->>'title' AS title, i->>'value' AS value
FROM texty t, jsonb_path_query(t.text, 'strict $.**.fields ? (@.blockType == "niceToKnowBlock").items[*] ? (@.type == "electricity")') i;

-- Kontrola
SELECT 'pages' AS tabulka, count(*) AS zmeneno FROM src_pages
UNION ALL SELECT '_pages_v (publikované)', count(*) FROM src_versions s JOIN _pages_v v ON v.id = s.version_id WHERE v.version__status = 'published'
UNION ALL SELECT '_pages_v (drafty latest)', count(*) FROM src_versions s JOIN _pages_v v ON v.id = s.version_id WHERE v.version__status <> 'published';
SELECT DISTINCT k.full_slug, k.title, k.value
FROM karty_po k
WHERE k.full_slug IN (SELECT slug FROM tituly UNION SELECT slug FROM napeti)
ORDER BY k.full_slug;

-- POJISTKA: když by kdekoliv zbyla karta s „hz" nebo některý ze starých titulků/napětí,
-- transakce se ruší — na produkci je lepší nezměnit nic než půlku.
DO $$
DECLARE zbytku int;
BEGIN
  SELECT count(*) INTO zbytku
  FROM karty_po k
  WHERE k.value ~ '\dhz\M'
     OR EXISTS (SELECT 1 FROM tituly x WHERE x.slug = k.full_slug AND x.old_title = k.title)
     OR EXISTS (SELECT 1 FROM napeti x WHERE x.slug = k.full_slug AND x.old_value = k.value);
  IF zbytku > 0 THEN
    RAISE EXCEPTION 'Zbylo % neopravených karet Elektřina — transakce se ruší.', zbytku;
  END IF;
END $$;
COMMIT;
