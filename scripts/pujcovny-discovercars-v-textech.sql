-- Půjčovny aut v textech stránek Doprava (a jednom článku): odkazy na ara.carrentalnet.com
-- a economycarrentals.com (reseller 1657) nahrazuje DiscoverCars (rozhodnutí uživatele
-- 11. 9. 2026). Věta má všude stejný tvar „…pomůžou stránky [Economycarrentals] nebo
-- [Rentalcars]. …" — první odkaz i spojka „nebo" se odstraní a zbylý odkaz (už vedoucí na
-- /go/auta[/země] po scripts/affiliate-odkazy-v-textech.sql) dostane text „DiscoverCars",
-- protože text „Rentalcars" u odkazu na DiscoverCars byl zavádějící. Samostatný odkaz na
-- carrentalnet/economycarrentals (bez sourozence) se přepíše na /go/auta[/země] rodiče.
-- Zároveň opravuje chyby, které v těchto větách vznikly kopírováním šablony (nález při
-- kontrole 11. 9. 2026): Francie a Peru měly v celé větě „Bulharsko", Bosna a Hercegovina
-- chybnou zemi u půjčoven, Švédsko a Švýcarsko nevokalizovanou předložku („v Švédsku"),
-- článek tvar „vyberu" místo „vybere". Každá fráze je ve svém dokumentu právě jednou.
-- Idempotentní; původní texty do zaloha.texts_pujcovny_2026_09_11. Z verzí jen poslední
-- PUBLIKOVANÁ (draft editora a historie zůstávají); články verze nemají.
-- Spuštění (dev):  docker compose exec -T postgres psql -U postgres -d aracze < scripts/pujcovny-discovercars-v-textech.sql
-- Prod: stejně proti produkční DB (služba `postgres`), potom `docker compose up -d --force-recreate cms` (cache).
BEGIN;
CREATE SCHEMA IF NOT EXISTS zaloha;

-- Cesta na DiscoverCars z pole „Půjčení auta" rodiče (stejné pravidlo jako carRentalHref
-- ve webu: /cz se odřízne, host je /go/auta), bez pole obecné /go/auta.
CREATE FUNCTION pg_temp.go_auta_for(parent_id int) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT '/go/auta' || COALESCE((
    SELECT regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      par.affiliate_car_rental_url, '^https?://[^/]+', ''), '[?#].*$', ''), '^/cz(?=/|$)', ''), '/+$', '')
    FROM pages par
    WHERE par.id = parent_id AND par.affiliate_car_rental_url ~ '^https?://(www\.)?discovercars\.com/'
  ), '')
$$;

-- Děti jednoho odstavce: vyhodí dvojici [starý odkaz][„ nebo "] před odkazem /go/auta,
-- samostatný starý odkaz přepíše na go_url, a každému odkazu /go/auta s textem
-- „Rentalcars" dá text „DiscoverCars".
CREATE FUNCTION pg_temp.fix_children(children jsonb, go_url text) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  n int := jsonb_array_length(children);
  i int := 0;
  cur jsonb; nxt jsonb; nxt2 jsonb;
  out jsonb := '[]'::jsonb;
BEGIN
  WHILE i < n LOOP
    cur := children->i;
    IF cur->>'type' = 'link' AND (cur->'fields'->>'url') ~* 'carrentalnet\.com|economycarrentals\.com' THEN
      nxt  := CASE WHEN i + 1 < n THEN children->(i + 1) END;
      nxt2 := CASE WHEN i + 2 < n THEN children->(i + 2) END;
      IF nxt->>'type' = 'text' AND (nxt->>'text') ~ '^\s*nebo\s*$'
         AND nxt2->>'type' = 'link' AND (nxt2->'fields'->>'url') LIKE '/go/auta%' THEN
        i := i + 2;  -- starý odkaz i „ nebo " vypadnou, /go/auta odkaz zpracuje další průchod
        CONTINUE;
      END IF;
      cur := jsonb_set(cur, '{fields,url}', to_jsonb(go_url));
    END IF;
    IF cur->>'type' = 'link' AND (cur->'fields'->>'url') LIKE '/go/auta%'
       AND (cur->'children'->0->>'text') ~* '^\s*rentalcars(\.com)?\s*$' THEN
      cur := jsonb_set(cur, '{children,0,text}', '"DiscoverCars"'::jsonb);
    END IF;
    out := out || jsonb_build_array(cur);
    i := i + 1;
  END LOOP;
  RETURN out;
END $$;

-- Celý text: mění jen odstavce na nejvyšší úrovni (všech 57 odkazů tam je — ověřeno).
CREATE FUNCTION pg_temp.fix_text(t jsonb, go_url text) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN t IS NULL OR jsonb_typeof(t->'root'->'children') <> 'array' THEN t ELSE
    jsonb_set(t, '{root,children}', COALESCE((
      SELECT jsonb_agg(
        CASE WHEN c->>'type' = 'paragraph' AND jsonb_typeof(c->'children') = 'array'
                  AND c::text ~* 'carrentalnet\.com|economycarrentals\.com|/go/auta'
             THEN jsonb_set(c, '{children}', pg_temp.fix_children(c->'children', go_url))
             ELSE c END
        ORDER BY ord)
      FROM jsonb_array_elements(t->'root'->'children') WITH ORDINALITY AS e(c, ord)
    ), '[]'::jsonb))
  END
$$;

-- Opravy textu vázané na konkrétní stránku/článek. Fráze jsou dost dlouhé na to, aby
-- nemohly trefit nic jiného (ověřeno: každá se ve svém dokumentu vyskytuje jednou).
CREATE TEMP TABLE typo (slug text, old_txt text, new_txt text) ON COMMIT DROP;
INSERT INTO typo VALUES
  ('/francie/doprava', 'autem pouze po Bulharsku', 'autem pouze po Francii'),
  ('/francie/doprava', 'půjčovnami v Bulharsku', 'půjčovnami ve Francii'),
  ('/peru/doprava', 'autem pouze po Bulharsku', 'autem pouze po Peru'),
  ('/peru/doprava', 'půjčovnami v Bulharsku', 'půjčovnami v Peru'),
  ('/bosna-a-hercegovina/doprava', 'půjčovnami v Bulharsku', 'půjčovnami v Bosně a Hercegovině'),
  ('/svedsko/doprava', 'půjčovnami v Švédsku', 'půjčovnami ve Švédsku'),
  ('/svycarsko/doprava', 'půjčovnami v Švýcarsku', 'půjčovnami ve Švýcarsku'),
  ('jak-cestovat-s-nizkym-rozpoctem', 'která vám vyberu tu', 'která vám vybere tu');

CREATE FUNCTION pg_temp.fix_typos(doc_slug text, t jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE r record; s text := t::text;
BEGIN
  IF t IS NULL THEN RETURN t; END IF;
  FOR r IN SELECT * FROM typo WHERE typo.slug = doc_slug LOOP
    s := replace(s, r.old_txt, r.new_txt);
  END LOOP;
  RETURN s::jsonb;
END $$;

CREATE TEMP TABLE src_pages ON COMMIT DROP AS
SELECT p.id, p.full_slug, p.text AS old_text,
       pg_temp.fix_typos(p.full_slug, pg_temp.fix_text(p.text, pg_temp.go_auta_for(p.parent_id))) AS new_text
FROM pages p
WHERE p.text::text ~* 'carrentalnet\.com|economycarrentals\.com|/go/auta'
FOR UPDATE OF p;
DELETE FROM src_pages WHERE old_text = new_text;

CREATE TEMP TABLE src_versions ON COMMIT DROP AS
SELECT v.id AS version_id, v.parent_id AS page_id, v.version_text AS old_text,
       pg_temp.fix_typos(p.full_slug, pg_temp.fix_text(v.version_text, pg_temp.go_auta_for(p.parent_id))) AS new_text
FROM (
  SELECT DISTINCT ON (v.parent_id) v.*
  FROM _pages_v v
  WHERE v.version__status = 'published' AND v.version_text IS NOT NULL
    AND v.version_text::text ~* 'carrentalnet\.com|economycarrentals\.com|/go/auta'
  ORDER BY v.parent_id, v.updated_at DESC, v.id DESC
) v JOIN pages p ON p.id = v.parent_id;
DELETE FROM src_versions WHERE old_text = new_text;

CREATE TEMP TABLE src_articles ON COMMIT DROP AS
SELECT a.id, a.slug, a.text AS old_text,
       pg_temp.fix_typos(a.slug, pg_temp.fix_text(a.text, '/go/auta')) AS new_text
FROM articles a
WHERE a.text::text ~* 'carrentalnet\.com|economycarrentals\.com|/go/auta'
FOR UPDATE OF a;
DELETE FROM src_articles WHERE old_text = new_text;

CREATE TABLE IF NOT EXISTS zaloha.texts_pujcovny_2026_09_11 (
  scope text, doc_id int, version_id int, old_text jsonb, zalohovano timestamptz DEFAULT now()
);
INSERT INTO zaloha.texts_pujcovny_2026_09_11 (scope, doc_id, version_id, old_text)
SELECT 'page', id, NULL, old_text FROM src_pages
UNION ALL SELECT 'page', page_id, version_id, old_text FROM src_versions
UNION ALL SELECT 'article', id, NULL, old_text FROM src_articles;

UPDATE pages p SET text = s.new_text FROM src_pages s WHERE p.id = s.id;
UPDATE _pages_v v SET version_text = s.new_text FROM src_versions s WHERE v.id = s.version_id;
UPDATE articles a SET text = s.new_text FROM src_articles s WHERE a.id = s.id;

-- Kontrola
SELECT 'pages' AS tabulka, count(*) AS zmeneno FROM src_pages
UNION ALL SELECT '_pages_v', count(*) FROM src_versions
UNION ALL SELECT 'articles', count(*) FROM src_articles;
SELECT 'zbyva carrentalnet/economycarrentals v pages+articles: ' ||
  ((SELECT count(*) FROM pages WHERE text::text ~* 'carrentalnet\.com|economycarrentals\.com')
   + (SELECT count(*) FROM articles WHERE text::text ~* 'carrentalnet\.com|economycarrentals\.com')) AS kontrola;
SELECT l->'children'->0->>'text' AS text_odkazu, count(*)
FROM pages p, jsonb_path_query(p.text, 'strict $.**.children[*] ? (@.type == "link")') l
WHERE l->'fields'->>'url' LIKE '/go/auta%' GROUP BY 1 ORDER BY 2 DESC;
SELECT 'neopravene fraze: ' || count(*) AS kontrola_preklepy
FROM typo t
WHERE EXISTS (SELECT 1 FROM pages p WHERE p.full_slug = t.slug AND p.text::text LIKE '%' || t.old_txt || '%')
   OR EXISTS (SELECT 1 FROM articles a WHERE a.slug = t.slug AND a.text::text LIKE '%' || t.old_txt || '%');

-- POJISTKA: výpisy výš jsou jen k přečtení, tady se kontroluje tvrdě. Když by cokoliv
-- z toho, co má skript odstranit, zůstalo, transakce se zruší — na produkci je lepší
-- nezměnit nic než půlku. Kontroluje se i poslední PUBLIKOVANÁ verze (tu skript také
-- přepisuje); starší verze v historii zůstávají se starým textem záměrně.
DO $$
DECLARE
  zbytku int;
BEGIN
  WITH posledni_publikovana AS (
    SELECT DISTINCT ON (v.parent_id) v.parent_id, v.version_text
    FROM _pages_v v
    WHERE v.version__status = 'published' AND v.version_text IS NOT NULL
    ORDER BY v.parent_id, v.updated_at DESC, v.id DESC
  )
  SELECT (SELECT count(*) FROM pages WHERE text::text ~* 'carrentalnet\.com|economycarrentals\.com')
       + (SELECT count(*) FROM articles WHERE text::text ~* 'carrentalnet\.com|economycarrentals\.com')
       + (SELECT count(*) FROM posledni_publikovana
          WHERE version_text::text ~* 'carrentalnet\.com|economycarrentals\.com')
  INTO zbytku;
  IF zbytku > 0 THEN
    RAISE EXCEPTION 'Zbyly odkazy na carrentalnet/economycarrentals v % dokumentech — transakce se ruší.', zbytku;
  END IF;

  SELECT count(*) INTO zbytku
  FROM typo t
  WHERE EXISTS (SELECT 1 FROM pages p WHERE p.full_slug = t.slug AND p.text::text LIKE '%' || t.old_txt || '%')
     OR EXISTS (SELECT 1 FROM articles a WHERE a.slug = t.slug AND a.text::text LIKE '%' || t.old_txt || '%')
     OR EXISTS (
          SELECT 1
          FROM (
            SELECT DISTINCT ON (v.parent_id) v.parent_id, v.version_text
            FROM _pages_v v
            WHERE v.version__status = 'published' AND v.version_text IS NOT NULL
            ORDER BY v.parent_id, v.updated_at DESC, v.id DESC
          ) lv
          JOIN pages p ON p.id = lv.parent_id
          WHERE p.full_slug = t.slug AND lv.version_text::text LIKE '%' || t.old_txt || '%');
  IF zbytku > 0 THEN
    RAISE EXCEPTION 'Zbylo % neopravených frází (překlepy) — transakce se ruší.', zbytku;
  END IF;

  -- Název odkazu musí sedět s cílem: /go/auta vede na DiscoverCars, ne na Rentalcars.
  SELECT count(*) INTO zbytku
  FROM pages p, jsonb_path_query(p.text, 'strict $.**.children[*] ? (@.type == "link")') l
  WHERE l->'fields'->>'url' LIKE '/go/auta%'
    AND (l->'children'->0->>'text') ~* '^\s*rentalcars(\.com)?\s*$';
  IF zbytku > 0 THEN
    RAISE EXCEPTION 'Zbylo % odkazů /go/auta s textem „Rentalcars" — transakce se ruší.', zbytku;
  END IF;
END $$;
COMMIT;
