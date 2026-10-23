-- Schéma pro sekci „Zájezdy“ na PRODUKCI (dev schéma se tam nepushuje).
-- Spustit PŘED mergem/nasazením větve feat/zajezdy, idempotentní:
--   ssh root@<server> 'docker compose -f /opt/aracze/docker-compose.yml exec -T postgres \
--     psql -U postgres -d aracze' < scripts/zajezdy-prod-schema.sql
-- Pak: čtveřice CEDOK_SFTP_* do /opt/aracze/.env I do compose na serveru,
-- force-recreate cms, ručně spustit workflow „Sync tour offers“, v adminu
-- založit podstránku Zájezdy pod zemí (kategorie Zájezdy, kód země EGY).
-- Odpovídá kolekci src/collections/TourOffers.ts a poli tours.countryCode
-- v src/collections/Pages.ts (výpis z dev DB přes pg_dump 16. 10. 2026).

-- 1) Nová kategorie stránky (enum pro stránky i jejich verze).
ALTER TYPE enum_pages_category ADD VALUE IF NOT EXISTS 'Zájezdy' BEFORE 'Články';
ALTER TYPE enum__pages_v_version_category ADD VALUE IF NOT EXISTS 'Zájezdy' BEFORE 'Články';

-- 2) Kód země na podstránce Zájezdy (záložka Zájezdy v adminu).
ALTER TABLE pages ADD COLUMN IF NOT EXISTS tours_country_code varchar;
ALTER TABLE _pages_v ADD COLUMN IF NOT EXISTS version_tours_country_code varchar;

-- 3) Kolekce nabídek zájezdů (plní /api/sync-tour-offers).
CREATE TABLE IF NOT EXISTS tour_offers (
    id serial PRIMARY KEY,
    source varchar NOT NULL,
    external_id varchar NOT NULL,
    kind varchar NOT NULL,
    title varchar NOT NULL,
    country_code varchar NOT NULL,
    area varchar,
    place varchar,
    stars numeric,
    board varchar NOT NULL,
    departures jsonb,
    terms jsonb,
    term_from timestamp(3) with time zone NOT NULL,
    term_to timestamp(3) with time zone,
    nights numeric NOT NULL,
    term_count numeric,
    price numeric NOT NULL,
    original_price numeric,
    photo_url varchar,
    detail_url varchar NOT NULL,
    lat numeric,
    lng numeric,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS tour_offers_country_code_idx ON tour_offers USING btree (country_code);
CREATE INDEX IF NOT EXISTS tour_offers_created_at_idx ON tour_offers USING btree (created_at);
CREATE INDEX IF NOT EXISTS tour_offers_source_idx ON tour_offers USING btree (source);
CREATE INDEX IF NOT EXISTS tour_offers_updated_at_idx ON tour_offers USING btree (updated_at);
-- Doplnění pro starší instalace tabulky (termíny přibyly 17. 10. 2026).
ALTER TABLE tour_offers ADD COLUMN IF NOT EXISTS terms jsonb;

-- 4) Invia (23. 10. 2026): odkaz na stránku hotelu u Invie (recenze) a feedy
--    Invie po zemích na podstránce Zájezdy (textarea, jedna adresa na řádek).
ALTER TABLE tour_offers ADD COLUMN IF NOT EXISTS invia_url varchar;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS tours_invia_feed_urls varchar;
ALTER TABLE _pages_v ADD COLUMN IF NOT EXISTS version_tours_invia_feed_urls varchar;
