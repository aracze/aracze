import type { CollectionConfig } from 'payload'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { isAdmin } from '../access/isAdmin'
import { isAdminOrEditor } from '../access/isAdminOrEditor'

const s3Endpoint = process.env.S3_ENDPOINT || ''
const s3Bucket = process.env.S3_BUCKET || ''
const s3AccessKeyId = process.env.S3_ACCESS_KEY_ID || ''
const s3Secret = process.env.S3_SECRET || ''

// Validace S3/R2 konfigurace při inicializaci modulu
if (
  process.env.NODE_ENV !== 'development' &&
  (!s3Endpoint || !s3Bucket || !s3AccessKeyId || !s3Secret)
) {
  console.warn(
    'Missing R2 environment variables. Presence of S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET is highly recommended for Media collection.',
  )
}

const cleanedEndpoint = s3Endpoint.endsWith(`/${s3Bucket}`)
  ? s3Endpoint.replace(`/${s3Bucket}`, '')
  : s3Endpoint

// Vytvoření sdíleného S3 klienta pro celou aplikaci
const s3Client = new S3Client({
  region: 'auto',
  endpoint: cleanedEndpoint || 'https://placeholder-endpoint.com', // Placeholder pro případ chybějícího env, aby aplikace nespadla při startu
  credentials: {
    accessKeyId: s3AccessKeyId || 'missing',
    secretAccessKey: s3Secret || 'missing',
  },
})

const sanitizeFilename = (name: string): string => {
  const parts = name.split('.')

  let baseName = ''
  let extension = ''

  if (name.startsWith('.') && parts.length === 2) {
    // Dotfile case: ".htaccess" -> baseName: "htaccess", extension: ""
    baseName = parts[1]
    extension = ''
  } else {
    extension = parts.length > 1 ? parts.pop() || '' : ''
    baseName = parts.join('.')
  }

  let sanitizedBase = baseName
    .toLowerCase()
    .normalize('NFD') // Rozloží české znaky (např. 'š' -> 's' + háček)
    .replace(/[\u0300-\u036f]/g, '') // Odstraní háčky a čárky
    .replace(/[^a-z0-9]/g, '-') // Vše kromě písmen a čísel nahradí pomlčkou
    .replace(/-+/g, '-') // Odstraní vícenásobné pomlčky
    .replace(/^-|-$/g, '') // Odstraní pomlčku na začátku/konci

  if (sanitizedBase === '') {
    sanitizedBase = `file-${Date.now()}`
  }

  return extension ? `${sanitizedBase}.${extension.toLowerCase()}` : sanitizedBase
}

// Nejnovější „generace" R2 zálohy pro daný doc (in-memory, per-proces). Detached
// zálohy téhož média mohou doběhnout mimo pořadí; před zápisem statusu proto
// ověříme, že tahle záloha je pořád ta nejnovější — jinak by starší doběhnutí
// přepsalo status novější. Paměť jednoho procesu stačí (stejně jako u samotné
// detached zálohy), žádná změna DB schématu.
const latestBackupGen = new Map<string | number, number>()
let backupGenCounter = 0

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
    // Nahrávání/úpravy médií jen admin/editor; mazání jen admin. Bez těchto
    // pravidel by Payload povolil zápis KAŽDÉMU přihlášenému (i roli `user`).
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  hooks: {
    beforeOperation: [
      async ({ args, operation }) => {
        if ((operation === 'create' || operation === 'update') && args.req?.file) {
          const original = args.req.file.name
          const sanitized = sanitizeFilename(original)
          if (sanitized !== original) {
            args.req.file.name = sanitized
          }
        }
        return args
      },
    ],
    afterChange: [
      async ({ doc, req }) => {
        // Zabezpečíme inicializaci kontextu pro konzistentní přístup
        req.context = req.context || {}

        // R2 záloha běží JEN v produkci. V dev režimu (`pnpm dev`) se obrázky
        // nahrávají na dev Cloudinary účet a do produkčního R2 bucketu nepatří.
        if (process.env.NODE_ENV !== 'production') return

        // Zabráníme nekonečnému cyklu při aktualizaci statusu
        if (req.context.skipR2Backup) return

        // Cloudinary plugin po dokončení uploadu spustí interní update s tímto příznakem.
        // To je moment, kdy jsou všechna metadata v DB a můžeme spustit zálohu do R2.
        const isSecondCycle = req.context.skipCloudStorage === true
        if (!isSecondCycle) return

        const cloudinaryPublicId = doc.cloudinaryPublicId as string | undefined
        const cloudinaryUrl = doc.url as string | undefined
        const mimeType = doc.mimeType as string | undefined

        // Pokud nemáme ID nebo URL, nejde o nahrání souboru, které bychom chtěli zálohovat
        if (!cloudinaryPublicId || !cloudinaryUrl) {
          req.payload.logger.warn({
            msg: 'R2 afterChange: Druhý cyklus detekován, ale chybí Cloudinary data pro zálohu.',
            docId: doc.id,
            cloudinaryPublicId,
            hasUrl: !!cloudinaryUrl,
          })
          return
        }

        const cloudinaryFormat = doc.cloudinaryFormat as string | undefined

        // Definice čistých přípon pro běžné MIME typy (R2 backup)
        const mimeMap: Record<string, string> = {
          'image/jpeg': 'jpg',
          'image/png': 'png',
          'image/svg+xml': 'svg',
          'image/webp': 'webp',
          'application/pdf': 'pdf',
          'application/octet-stream': 'bin',
        }

        const extension =
          cloudinaryFormat ||
          (mimeType ? mimeMap[mimeType] || mimeType.split('/')[1]?.split('+')[0] : 'bin') ||
          'bin'

        const safeExtension = extension === 'jpeg' ? 'jpg' : extension
        const r2Key = `${cloudinaryPublicId}.${safeExtension}`

        // Hodnoty vytáhneme teď a přeneseme do detached úlohy — `doc`/`req` se
        // po skončení hooku nespoléháme používat.
        const { payload } = req
        const docId = doc.id
        const altText = (doc.alt as string) || ''

        // Tahle záloha se stává nejnovější pro daný doc. `isStale()` pak před
        // zápisem statusu pozná, že mezitím naběhla novější (a status nepřepíše).
        const backupGen = ++backupGenCounter
        latestBackupGen.set(docId, backupGen)
        const isStale = () => latestBackupGen.get(docId) !== backupGen

        // Stažení z Cloudinary + upload do R2 je pomalé síťové I/O. Kdyby běželo
        // uvnitř transakce tohoto requestu (tj. s awaitem v hooku), drželo by DB
        // spojení otevřené po celou dobu přenosu → při souběhu uploadů hrozí
        // vyčerpání connection poolu. Spustíme ho proto DETACHED (bez `req`):
        // hook se vrátí hned, transakce se commitne a záloha doběhne na pozadí
        // ve vlastním krátkém spojení. Cena: při restartu serveru přímo během
        // přenosu se ta jedna záloha nedokončí (status zůstane 'pending').
        const runBackup = async () => {
          try {
            if (!s3Endpoint || !s3Bucket || !s3AccessKeyId || !s3Secret) {
              throw new Error('Chybí konfigurace R2 (environment variables)')
            }

            payload.logger.info(`Zahajuji zálohování do R2 (stahuji z Cloudinary): ${r2Key}`)

            const response = await fetch(cloudinaryUrl)
            if (!response.ok) {
              throw new Error(`Načtení z Cloudinary selhalo: ${response.statusText}`)
            }

            const arrayBuffer = await response.arrayBuffer()
            const buffer = Buffer.from(arrayBuffer)

            await s3Client.send(
              new PutObjectCommand({
                Bucket: s3Bucket,
                Key: r2Key,
                Body: buffer,
                ContentType: mimeType || 'application/octet-stream',
                Metadata: {
                  alt: encodeURIComponent(altText),
                },
              }),
            )

            payload.logger.info(`Záloha souboru ${r2Key} do R2 proběhla úspěšně.`)

            // Status zapíšeme jen když je tahle záloha pořád nejnovější — jinak
            // bychom přepsali výsledek novější zálohy téhož média.
            if (isStale()) {
              payload.logger.info(`R2 status pro ${r2Key} přeskočen — běží novější záloha.`)
              return
            }

            // Status zálohy zapíšeme BEZ `req` — vlastní krátká transakce, která
            // po commitu původního requestu jen krátce zabere spojení. `skipR2Backup`
            // brání rekurzi tohoto afterChange.
            await payload.update({
              collection: 'media',
              id: docId,
              data: { r2BackupStatus: 'success' },
              context: { skipR2Backup: true },
            })
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            payload.logger.error(`Chyba při zálohování do R2: ${errorMsg}`)

            // Stejná ochrana i pro chybový status.
            if (isStale()) return

            // Záznam chyby pro pozdější opravu
            await payload
              .update({
                collection: 'media',
                id: docId,
                data: { r2BackupStatus: 'error' },
                context: { skipR2Backup: true },
              })
              .catch(() => {})
          } finally {
            // Úklid: když je tahle záloha pořád nejnovější, odregistrujeme ji, ať
            // mapa nedrží dokončené položky (drží jen běžící zálohy).
            if (latestBackupGen.get(docId) === backupGen) latestBackupGen.delete(docId)
          }
        }

        void runBackup()
      },
    ],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
    },
    {
      name: 'isCreativeCommons',
      label: 'Obrázek je Creative Commons',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'author',
      type: 'text',
      admin: {
        condition: (data) => data?.isCreativeCommons,
      },
    },
    {
      type: 'row',
      admin: {
        condition: (data) => data?.isCreativeCommons,
      },
      fields: [
        {
          name: 'source',
          type: 'text',
          admin: {
            width: '33%',
          },
        },
        {
          name: 'sourceLink',
          type: 'text',
          admin: {
            width: '33%',
          },
        },
        {
          name: 'creativeCommonsLicense',
          type: 'text',
          admin: {
            width: '33%',
          },
        },
      ],
    },
    {
      name: 'r2BackupStatus',
      type: 'select',
      access: {
        update: () => false,
      },
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Success', value: 'success' },
        { label: 'Error', value: 'error' },
      ],
      defaultValue: 'pending',
    },
  ],
  upload: {
    disableLocalStorage: true,
    adminThumbnail: ({ doc }) => (doc.thumbnailURL as string) || (doc.url as string) || null,
  },
}
