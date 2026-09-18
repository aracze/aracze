-- Datové opravy k PR #113 (kurzy v textu), 18. 9. 2026. Spouští se ručně proti
-- DB (v dev už provedeno). Idempotentní: druhé spuštění nic nezmění.
--
-- Produkce:
--   ssh root@<server> 'cd /opt/aracze && docker compose exec -T postgres psql -U postgres -d aracze -At' \
--     < scripts/data-bulharsko-eur-revolut.sql
--   ssh root@<server> 'cd /opt/aracze && docker compose up -d --force-recreate cms'   # cache
--
-- 1. Bulharsko přešlo 1. 1. 2026 na euro — BGN už ČNB ani ECB nekótuje, karta
--    kurzu byla prázdná. Verze stránky (_pages_v) se opraví taky, jinak by
--    další publikace z adminu mohla starou hodnotu vrátit.
-- 2. Věta o Revolutu na stránkách „Měna a ceny“ (59×): limit 200 EUR pro české
--    účty už neplatí (Standard: 4 500 Kč nebo 5 výběrů měsíčně, pak 2 %).

\set old 'Zdarma je i výběr z bankomatů všude po světě do 200 EUR měsíčně.'
\set new 'Zdarma je i výběr z bankomatů všude po světě, v základním plánu do 4 500 Kč nebo 5 výběrů měsíčně; nad tento limit se platí 2 % z vybrané částky.'

SELECT 'PŘED: stránek s BGN: ' || count(*) FROM pages WHERE detail_currency_code = 'BGN';
SELECT 'PŘED: stránek s větou o 200 EUR: ' || count(*) FROM pages WHERE text::text LIKE '%' || :'old' || '%';

BEGIN;
UPDATE pages SET detail_currency_code = 'EUR' WHERE detail_currency_code = 'BGN';
UPDATE _pages_v SET version_detail_currency_code = 'EUR' WHERE version_detail_currency_code = 'BGN';
UPDATE pages SET text = replace(text::text, :'old', :'new')::jsonb
  WHERE text::text LIKE '%' || :'old' || '%';
UPDATE _pages_v SET version_text = replace(version_text::text, :'old', :'new')::jsonb
  WHERE version_text::text LIKE '%' || :'old' || '%';
COMMIT;

SELECT 'PO: Bulharsko: ' || full_slug || ' → ' || detail_currency_code FROM pages WHERE full_slug = '/bulharsko';
SELECT 'PO: zbývá s 200 EUR: ' || count(*) FROM pages WHERE text::text LIKE '%200 EUR měsíčně%';
SELECT 'PO: stránek s novým zněním: ' || count(*) FROM pages WHERE text::text LIKE '%4 500 Kč nebo 5 výběrů%';
