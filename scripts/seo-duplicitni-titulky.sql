-- Duplicitní SEO titulky (nález z Google Search Console, 19. 9. 2026).
-- Google hlásil „Crawled - currently not indexed" u stránek, které se navenek tváří
-- stejně: 36 stránek v 15 skupinách sdílí `meta_title`. Jde o legacy titulky ze starého
-- webu — u turistických cílů chybí jméno cíle („Cestovní průvodce Zadarem" má pět
-- různých památek v Zadaru), u /turecko/kultura je titulek i popisek omylem zkopírovaný
-- z /turecko/jidlo (ověřeno ve staré MySQL — chyba je zděděná, ne z migrace).
--
-- Řeší se stejně jako rozbité titulky cílů 4. 9. 2026 (scripts/seo-legacy-titles-targets.sql):
-- hodnota se VYNULUJE a web použije šablonu ze `src/lib/seo-templates.ts`
-- („Katedrála sv. Anastázie v Zadaru", „Jazyk a kultura v Turecku – zvyky, svátky
-- a památky"). Ve skupině se maže jen tam, kde titulek NEOBSAHUJE první slovo názvu
-- stránky — stránka, které titulek patří, si ho nechá (Jídlo, Národní park Tongariro).
--
-- Idempotentní; původní hodnoty ukládá do zaloha.pages_meta_dupl_2026_09_19.
-- Běží proti živému CMS: dotčené řádky drží FOR UPDATE po celou transakci a maže se jen
-- hodnota, kterou skript klasifikoval (souběžná editace v adminu se nepřepíše); z verzí
-- jen poslední PUBLIKOVANÁ (rozpracovaný draft editora i historie zůstávají).
-- Spuštění (dev):  docker compose exec -T postgres psql -U postgres -d aracze < scripts/seo-duplicitni-titulky.sql
-- Prod: stejně proti produkční DB (služba `postgres`), potom `docker compose up -d --force-recreate cms` (cache).
BEGIN;
CREATE SCHEMA IF NOT EXISTS zaloha;

-- Skupiny stejných titulků napříč VŠEMI stránkami (i nepublikovanými — Google vidí
-- jen publikované, ale duplicita s draftem by se objevila hned po publikaci).
CREATE TEMP TABLE d AS
SELECT meta_title FROM pages
WHERE meta_title IS NOT NULL AND meta_title <> ''
GROUP BY meta_title HAVING count(*) > 1;

-- `ma_nazev` = titulek obsahuje první slovo názvu stránky → titulek patří JÍ a zůstává.
-- První slovo (ne celý název) kvůli skloňování: „Cestovní průvodce Národním parkem
-- Tongariro" patří stránce „Národní park Tongariro", ne cíli „Ruapehu" pod ní.
CREATE TEMP TABLE l AS
SELECT s.* FROM (
  SELECT p.id, p.title, p.meta_title, p.meta_description,
    position(lower(split_part(p.title, ' ', 1)) IN lower(p.meta_title)) > 0 AS ma_nazev
  FROM pages p JOIN d ON d.meta_title = p.meta_title
  FOR UPDATE OF p
) s;

CREATE TABLE IF NOT EXISTS zaloha.pages_meta_dupl_2026_09_19 AS
  SELECT id, title, meta_title, meta_description, now() AS zalohovano FROM l WHERE false;
INSERT INTO zaloha.pages_meta_dupl_2026_09_19 (id, title, meta_title, meta_description, zalohovano)
  SELECT id, title, meta_title, meta_description, now() FROM l WHERE NOT ma_nazev;

-- Titulek: maže se jen hodnota, kterou skript klasifikoval (pojistka k zámku výše).
UPDATE pages p SET meta_title = NULL
  FROM l WHERE p.id = l.id AND NOT l.ma_nazev AND p.meta_title = l.meta_title;
UPDATE _pages_v v SET version_meta_title = NULL
  FROM l WHERE v.parent_id = l.id AND NOT l.ma_nazev
    AND v.latest AND v.version__status = 'published'
    AND v.version_meta_title = l.meta_title;

-- Popisek jen tam, kde je taky doslova převzatý od jiné stránky (dnes /turecko/kultura).
-- Ostatní popisky jsou vlastní, i když titulek byl společný — ty se nechávají být.
CREATE TEMP TABLE dd AS
SELECT l.id, l.meta_description FROM l
WHERE NOT l.ma_nazev AND l.meta_description IS NOT NULL AND l.meta_description <> ''
  AND EXISTS (
    SELECT 1 FROM pages o
    WHERE o.id <> l.id AND o.meta_description = l.meta_description
  );
UPDATE pages p SET meta_description = NULL
  FROM dd WHERE p.id = dd.id AND p.meta_description = dd.meta_description;
UPDATE _pages_v v SET version_meta_description = NULL
  FROM dd WHERE v.parent_id = dd.id
    AND v.latest AND v.version__status = 'published'
    AND v.version_meta_description = dd.meta_description;

SELECT count(*) FILTER (WHERE NOT ma_nazev) AS vynulovanych_titulku,
       (SELECT count(*) FROM dd) AS vynulovanych_popisku,
       count(*) FILTER (WHERE ma_nazev) AS ponechanych
FROM l;
COMMIT;
