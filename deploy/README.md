# Nasazení aracze — návod

Architektura: **GitHub Actions** sestaví Docker obrazy → nahraje do **ghcr.io** →
přihlásí se přes SSH na **server** a spustí novou verzi. Server nic nebuilduje,
jen stahuje hotové obrazy.

```text
 push do main ─▶ GitHub Actions ─▶ build obrazu ─▶ ghcr.io ─▶ SSH deploy ─▶ server
```

Na serveru běží 2 kontejnery: `postgres` a `cms` (sloučená Next.js appka —
veřejný web i administrace v jednom obraze).

- Web: `http://217.154.225.117/`
- Admin CMS: `http://217.154.225.117/admin`

---

## 1) Co nastavit v GitHubu

Repozitář `ara-cms-payload` → Settings → Secrets and variables → Actions.

**Secrets** (tajné):

| Název            | Hodnota                                        |
| ---------------- | ---------------------------------------------- |
| `DEPLOY_HOST`    | `217.154.225.117`                              |
| `DEPLOY_USER`    | `deploy` (uživatel pro nasazování, viz krok 2) |
| `DEPLOY_SSH_KEY` | privátní SSH klíč pro nasazování (celý obsah)  |

**Variables** (veřejné `NEXT_PUBLIC_*` — Next.js je zapéká do klientského bundlu
už PŘI BUILDU, proto musí být tady, ne jen v serverovém `.env`):

| Název                                                                    | Hodnota                                                            |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `NEXT_PUBLIC_SITE_URL`                                                   | `http://217.154.225.117` (po pořízení domény `https://www.ara.cz`) |
| `NEXT_PUBLIC_PAYLOAD_BASE_URL`                                           | `http://217.154.225.117` (stejné jako web)                         |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`                                        | klíč pro mapy (v Google Cloud omez přes "HTTP referrer")           |
| `NEXT_PUBLIC_ADSENSE_CLIENT` / `..._ARTICLE_SLOT` / `..._ARTICLE_SLOT_2` | AdSense (nepovinné)                                                |

> Obrazy do ghcr.io se pushují automaticky pomocí vestavěného `GITHUB_TOKEN`,
> žádný další token pro push není potřeba.

---

## 2) Příprava serveru (jednorázově)

```bash
# a) Swap (POTŘEBA) — build sice běží v GitHub Actions, ALE Next.js appka (cms)
#    + PostgreSQL na 1,8 GB RAM mají paměťové špičky a bez swapu dochází k OOM
#    (systém zabije proces). 3 GB swap to spolehlivě řeší.
fallocate -l 3G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
sysctl -w vm.swappiness=10 && echo 'vm.swappiness=10' >> /etc/sysctl.conf

# b) Docker
curl -fsSL https://get.docker.com | sh

# c) Firewall — sloučená appka (web i /admin) běží na portu 80; 3000 se ven neotevírá.
ufw allow OpenSSH && ufw allow 80/tcp && ufw --force enable

# d) Uživatel pro nasazování + přístup k Dockeru
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh && chmod 700 /home/deploy/.ssh
# sem vlož VEŘEJNÝ deploy klíč:
# echo "ssh-ed25519 AAAA... deploy" > /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys

# e) Přihlášení serveru do ghcr.io (kvůli stahování privátních obrazů)
#    Vytvoř si na GitHubu token (classic) s právem `read:packages`.
echo "<GITHUB_TOKEN>" | docker login ghcr.io -u <github-uzivatel> --password-stdin

# f) Deploy adresář
mkdir -p /opt/aracze
```

Nahraj `docker-compose.yml` a `.env` do `/opt/aracze/`:

```bash
# z počítače:
scp deploy/docker-compose.yml deploy/.env root@217.154.225.117:/opt/aracze/
```

`.env` vytvoř z `.env.example` a doplň hodnoty (silná hesla vygeneruj příkazy
uvedenými v komentářích souboru).

---

## 3) První nasazení

```bash
cd /opt/aracze
docker compose pull
docker compose up -d
```

**Inicializace schématu.** V produkci `prodMigrations` standardně NEBĚŽÍ — Payload
by na schématu importovaném z dumpu (viz 3b) detekoval drift a start by zamrzl.
Schéma nastav jednou ze dvou cest:

- **Přenos dat z lokálu (doporučeno, viz 3b):** naimportuj dump z lokální DB —
  přinese schéma i data najednou.
- **Čistý deploy bez dumpu (migrace):** v `/opt/aracze/.env` nastav
  `PAYLOAD_RUN_MIGRATIONS=true` a restartuj `cms`. Payload při startu spustí
  migrace ze `src/migrations`. Ověření v logu:

  ```bash
  docker compose logs cms | grep -i migrat   # "Migrated: ..._initial"
  ```

Pak otevři `http://217.154.225.117/admin` — Payload nabídne **vytvoření
prvního administrátora**. Tím je CMS připravené.

> Pozn.: Při změně datového modelu vygeneruj migraci
> `pnpm payload migrate:create <nazev>` a commitni ji; při čistém deploy
> (`PAYLOAD_RUN_MIGRATIONS=true`) ji nasazená verze při startu doběhne. Guarded
> endpoint `POST /api/init-db` (dělá `DROP SCHEMA`, registruje se jen při
> `ALLOW_INIT_DB=true`) slouží k bootstrapu úplně prázdné DB.

---

## 3b) Přenos dat z lokálního prostředí (nejlepší data jsou na locale)

Data se NEmigrují na serveru — vygeneruje se dump z lokální databáze a nahraje
do produkce. CMS má na to vestavěné endpointy (`pg_dump --format=c`, resp.
`pg_restore --clean`):

1. **Lokálně** vytvoř dump (endpoint `dbDump`) — stáhne soubor `.dump`.
2. Nahraj ho do produkce (endpoint `dbImport`) — ten provede `DROP SCHEMA` a
   obnoví lokální schéma i data.
3. Protože import přepíše schéma lokálním (bez záznamu o migraci), po importu
   označíme počáteční migraci jako provedenou, aby ji CMS při restartu
   nespouštěl znovu:

   ```bash
   docker compose exec -T postgres psql -U postgres -d aracze -c \
     "CREATE TABLE IF NOT EXISTS payload_migrations (id serial PRIMARY KEY, name varchar, batch numeric, updated_at timestamptz DEFAULT now() NOT NULL, created_at timestamptz DEFAULT now() NOT NULL); \
      INSERT INTO payload_migrations (name, batch) SELECT '20260709_134221_initial', 1 \
      WHERE NOT EXISTS (SELECT 1 FROM payload_migrations WHERE name = '20260709_134221_initial');"
   ```

> Tento krok proběhne jednou, až bude aplikace nasazená. Provedu ho s tebou.

## 4) Běžné nasazení další verze

Nic ručního — stačí pushnout do `main`. GitHub Actions obraz sestaví a sám ho
na serveru nasadí. Ruční varianta (kdyby bylo potřeba):

```bash
cd /opt/aracze && docker compose pull && docker compose up -d
```

---

## Poznámky / co vylepšit později

- **HTTPS**: zatím běží web po HTTP na IP. Po pořízení domény doplníme reverzní
  proxy (Caddy) s automatickým certifikátem a admin schováme za HTTPS.
- **Vyhledávání**: index se staví za běhu z Payload Local API a obnovuje se
  automaticky při změně obsahu (revalidace cache tagů v hoocích) — žádný
  samostatný build/workflow už není potřeba.
- **Zálohy DB**: CMS má endpointy pro dump/import databáze; doporučuji nastavit
  pravidelnou zálohu volume `pgdata`.
