-- Titulky stránek počasí „Počasí - X a kdy jet do X" s nesklonovaným místem (18. 9. 2026).
-- Legacy tvar zůstává (rozhodnutí uživatele), jen se „do <1. pád>" nahradí druhým pádem
-- s předložkou z pole `detail_genitive` nadřazeného místa („do Londýna", „do Thajska").
-- Týká se pouze publikovaných stránek, kde se titulek liší od správného tvaru; zbytek
-- (už skloněné „kdy jet do Egypta", „ideální doba návštěvy", „předpověď na 10 dní") se nemění.
-- Idempotentní; původní hodnoty ukládá do zaloha.pages_meta_title_2026_09_18.
-- Mění i poslední PUBLIKOVANOU verzi v _pages_v (řádek `pages` s _status = 'published'
-- = žádný novější draft, takže se nepřepisuje rozpracovaná práce editora).
-- Spuštění (dev):  docker compose exec -T postgres psql -U postgres -d aracze < scripts/seo-pocasi-titulky-pad.sql
-- Prod: stejně proti produkční DB (služba `postgres`), potom `docker compose up -d --force-recreate cms` (cache).
BEGIN;
CREATE SCHEMA IF NOT EXISTS zaloha;

CREATE TEMP TABLE fix AS
SELECT p.id,
  p.meta_title AS old_title,
  replace(p.meta_title,
    'a kdy jet do ' || par.title || ' •',
    'a kdy jet ' || trim(par.detail_genitive) || ' •') AS new_title
FROM pages p
JOIN pages par ON par.id = p.parent_id
WHERE p._status = 'published' AND p.category = 'Počasí'
  AND position('a kdy jet do ' || par.title || ' •' IN p.meta_title) > 0
  AND trim(coalesce(par.detail_genitive, '')) <> ''
  AND trim(par.detail_genitive) <> 'do ' || par.title
  -- Zkratky (USA) se neskloňují, „do USA" je správně; rozepsaný 2. pád („do Spojených
  -- států amerických") by titulek protáhl přes ~60 znaků, které Google ukáže.
  AND par.title <> upper(par.title)
FOR UPDATE OF p;

CREATE TABLE IF NOT EXISTS zaloha.pages_meta_title_2026_09_18 (
  page_id integer PRIMARY KEY, meta_title text, zalohovano timestamptz DEFAULT now()
);
INSERT INTO zaloha.pages_meta_title_2026_09_18 (page_id, meta_title)
SELECT id, old_title FROM fix ON CONFLICT (page_id) DO NOTHING;

UPDATE pages p SET meta_title = f.new_title FROM fix f WHERE p.id = f.id;

UPDATE _pages_v v SET version_meta_title = f.new_title
FROM fix f
WHERE v.id = (
  SELECT w.id FROM _pages_v w
  WHERE w.parent_id = f.id AND w.version__status = 'published'
  ORDER BY w.updated_at DESC, w.id DESC LIMIT 1
);

SELECT id, old_title, new_title FROM fix ORDER BY id;
COMMIT;
