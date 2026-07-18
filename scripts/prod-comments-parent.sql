-- Jednorázová cílená migrace komentářových vláken na PRODUKCI (PR #33).
-- Přidá sloupec `parent_comment_id` (odpověď na) + FK + index + 12 dopočítaných
-- vazeb. Dotýká se JEN tabulky `comments` — `media`/R2 zůstávají netknuté
-- (žádné přepsání R2 statusů → žádný reconcile churn).
--
-- Idempotentní: dá se pustit i opakovaně (IF NOT EXISTS, UPDATE podle id).
-- Bezpečné pustit i PŘED nasazením nového kódu — starý kód sloupec nečte.
--
-- Spuštění na serveru (v /opt/aracze), viz komentář v chatu / README:
--   docker exec -i <postgres_container> psql -U postgres -d aracze < prod-comments-parent.sql

BEGIN;

-- 1) Sloupec (nullable integer) — přesně jako v dev schématu (Payload/Drizzle).
ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_comment_id integer;

-- 2) FK na sebe (ON DELETE SET NULL), jméno jako generuje Payload.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comments_parent_comment_id_comments_id_fk'
  ) THEN
    ALTER TABLE comments
      ADD CONSTRAINT comments_parent_comment_id_comments_id_fk
      FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3) Index.
CREATE INDEX IF NOT EXISTS comments_parent_comment_idx
  ON public.comments USING btree (parent_comment_id);

-- 4) 12 vazeb (child -> parent). Když by na prod některý komentář chyběl,
--    UPDATE prostě neovlivní žádný řádek (bezpečné).
UPDATE comments SET parent_comment_id = 31  WHERE id = 32;
UPDATE comments SET parent_comment_id = 38  WHERE id = 54;
UPDATE comments SET parent_comment_id = 62  WHERE id = 64;
UPDATE comments SET parent_comment_id = 62  WHERE id = 65;
UPDATE comments SET parent_comment_id = 294 WHERE id = 296;
UPDATE comments SET parent_comment_id = 297 WHERE id = 298;
UPDATE comments SET parent_comment_id = 306 WHERE id = 307;
UPDATE comments SET parent_comment_id = 311 WHERE id = 312;
UPDATE comments SET parent_comment_id = 329 WHERE id = 340;
UPDATE comments SET parent_comment_id = 298 WHERE id = 342;
UPDATE comments SET parent_comment_id = 305 WHERE id = 366;
UPDATE comments SET parent_comment_id = 368 WHERE id = 369;

-- Kontrola: má vyjít 12.
SELECT count(*) AS vazeb_nastaveno FROM comments WHERE parent_comment_id IS NOT NULL;

COMMIT;
