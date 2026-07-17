import type { CollectionConfig, Payload } from 'payload'
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
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

// Kolik nedodělaných záloh dohnat za jedno nahrání (dorovnání), ať se to při
// větším nevyřízeném zbytku nerozjede najednou.
const R2_RECONCILE_BATCH = 20

// Čisté přípony pro běžné MIME typy (klíč v R2).
const R2_MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/octet-stream': 'bin',
}

type R2BackupMedia = {
  id: string | number
  cloudinaryPublicId: string
  url: string
  mimeType?: string | null
  cloudinaryFormat?: string | null
  alt?: string | null
}

function resolveR2Key(
  cloudinaryPublicId: string,
  mimeType?: string | null,
  cloudinaryFormat?: string | null,
): string {
  const extension =
    cloudinaryFormat ||
    (mimeType ? R2_MIME_EXTENSIONS[mimeType] || mimeType.split('/')[1]?.split('+')[0] : 'bin') ||
    'bin'
  const safeExtension = extension === 'jpeg' ? 'jpg' : extension
  return `${cloudinaryPublicId}.${safeExtension}`
}

// Záloha JEDNOHO média do R2. Volá se `void`em (DETACHED, bez `req`): stažení
// z Cloudinary + upload je pomalé síťové I/O a nesmí držet DB spojení requestu.
// Generation-guard (latestBackupGen) brání staršímu doběhnutí přepsat status
// novější zálohy téhož média. Nahrání do R2 jde pod stejný klíč → idempotentní.
async function backupMediaToR2(
  payload: Payload,
  media: R2BackupMedia,
  opts?: { skipIfInR2?: boolean },
): Promise<void> {
  const { id, cloudinaryPublicId, url, mimeType, cloudinaryFormat, alt } = media
  const r2Key = resolveR2Key(cloudinaryPublicId, mimeType, cloudinaryFormat)

  const backupGen = ++backupGenCounter
  latestBackupGen.set(id, backupGen)
  const isStale = () => latestBackupGen.get(id) !== backupGen

  try {
    if (!s3Endpoint || !s3Bucket || !s3AccessKeyId || !s3Secret) {
      throw new Error('Chybí konfigurace R2 (environment variables)')
    }

    // Dorovnání (`skipIfInR2`): když objekt v R2 UŽ je, přeskočíme stažení+upload
    // a jen narovnáme status — šetří přenos i Cloudinary requesty (klíčové při
    // hromadném narovnání backlogu). Při čerstvém nahrání (bez `skipIfInR2`)
    // nahráváme vždy, ať se aktuální soubor do R2 opravdu dostane.
    let alreadyInR2 = false
    if (opts?.skipIfInR2) {
      try {
        await s3Client.send(new HeadObjectCommand({ Bucket: s3Bucket, Key: r2Key }))
        alreadyInR2 = true
      } catch (headError) {
        const name = (headError as { name?: string })?.name
        const httpStatus = (headError as { $metadata?: { httpStatusCode?: number } })?.$metadata
          ?.httpStatusCode
        // NotFound/404 = objekt chybí → nahrajeme. Jiná chyba = skutečný problém.
        if (name !== 'NotFound' && httpStatus !== 404) throw headError
      }
    }

    if (alreadyInR2) {
      payload.logger.info(`R2: ${r2Key} už existuje — jen dorovnávám status na success.`)
    } else {
      payload.logger.info(`Zahajuji zálohování do R2 (stahuji z Cloudinary): ${r2Key}`)

      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Načtení z Cloudinary selhalo: ${response.statusText}`)
      }

      const buffer = Buffer.from(await response.arrayBuffer())

      await s3Client.send(
        new PutObjectCommand({
          Bucket: s3Bucket,
          Key: r2Key,
          Body: buffer,
          ContentType: mimeType || 'application/octet-stream',
          Metadata: { alt: encodeURIComponent(alt || '') },
        }),
      )

      payload.logger.info(`Záloha souboru ${r2Key} do R2 proběhla úspěšně.`)
    }

    // Status zapíšeme jen když je tahle záloha pořád nejnovější (jinak přepisujeme
    // výsledek novější). Zápis BEZ `req` = vlastní krátká transakce; `skipR2Backup`
    // brání rekurzi afterChange.
    if (isStale()) {
      payload.logger.info(`R2 status pro ${r2Key} přeskočen — běží novější záloha.`)
      return
    }
    await payload.update({
      collection: 'media',
      id,
      data: { r2BackupStatus: 'success' },
      context: { skipR2Backup: true },
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    payload.logger.error(`Chyba při zálohování do R2 (${r2Key}): ${errorMsg}`)

    if (isStale()) return
    await payload
      .update({
        collection: 'media',
        id,
        data: { r2BackupStatus: 'error' },
        context: { skipR2Backup: true },
      })
      .catch(() => {})
  } finally {
    // Úklid: pokud je tahle záloha pořád nejnovější, odregistrujeme ji (mapa tak
    // drží jen běžící zálohy).
    if (latestBackupGen.get(id) === backupGen) latestBackupGen.delete(id)
  }
}

// Dorovnání: dožene média, jejichž záloha nedoběhla (`r2BackupStatus` `pending`
// nebo `error` — výpadek při nahrávání, restart serveru…). Spouští se při každém
// nahrání (viz afterChange), takže není potřeba cron — cena je, že se nedodělané
// zálohy dorovnají až s dalším uploadem (časová záruka není potřeba). Bere jen
// malou dávku.
async function reconcilePendingBackups(payload: Payload): Promise<void> {
  try {
    const res = await payload.find({
      collection: 'media',
      where: { r2BackupStatus: { in: ['pending', 'error'] } },
      limit: R2_RECONCILE_BATCH,
      depth: 0,
      overrideAccess: true,
    })

    for (const media of res.docs as unknown as Array<Record<string, unknown>>) {
      const id = media.id as string | number
      const cloudinaryPublicId = media.cloudinaryPublicId as string | undefined
      const url = media.url as string | undefined
      if (!cloudinaryPublicId || !url) continue // nemá co zálohovat
      if (latestBackupGen.has(id)) continue // už se právě zálohuje
      void backupMediaToR2(
        payload,
        {
          id,
          cloudinaryPublicId,
          url,
          mimeType: media.mimeType as string | undefined,
          cloudinaryFormat: media.cloudinaryFormat as string | undefined,
          alt: media.alt as string | undefined,
        },
        { skipIfInR2: true },
      )
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    payload.logger.error(`R2 dorovnání (reconcile) selhalo: ${errorMsg}`)
  }
}

// Jednorázové narovnání CELÉHO backlogu (bez dávkového limitu) — volá ho admin
// endpoint /api/r2-reconcile-all. Posbírá všechna média se stavem pending/error
// a sekvenčně je projede s HEAD-checkem (co v R2 už je, jen dostane status
// `success` bez přenosu). Běží na pozadí (endpoint ho pustí `void`em). Vrací
// počet zpracovaných.
export async function reconcileAllPendingBackups(payload: Payload): Promise<number> {
  const pending: R2BackupMedia[] = []
  let page = 1

  // Sběr: pagination je stabilní, protože během sběru status neměníme.
  for (;;) {
    const res = await payload.find({
      collection: 'media',
      where: { r2BackupStatus: { in: ['pending', 'error'] } },
      limit: 200,
      page,
      depth: 0,
      overrideAccess: true,
    })
    for (const media of res.docs as unknown as Array<Record<string, unknown>>) {
      const id = media.id as string | number
      const cloudinaryPublicId = media.cloudinaryPublicId as string | undefined
      const url = media.url as string | undefined
      if (!cloudinaryPublicId || !url) continue
      pending.push({
        id,
        cloudinaryPublicId,
        url,
        mimeType: media.mimeType as string | undefined,
        cloudinaryFormat: media.cloudinaryFormat as string | undefined,
        alt: media.alt as string | undefined,
      })
    }
    if (!res.hasNextPage) break
    page++
  }

  let processed = 0
  for (const media of pending) {
    if (latestBackupGen.has(media.id)) continue // právě běží (hook/upload)
    await backupMediaToR2(payload, media, { skipIfInR2: true })
    processed++
  }

  payload.logger.info(`R2 reconcile-all: zpracováno ${processed} z ${pending.length} nalezených.`)
  return processed
}

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

        const { payload } = req

        const cloudinaryPublicId = doc.cloudinaryPublicId as string | undefined
        const cloudinaryUrl = doc.url as string | undefined

        // 1) Záloha právě nahraného souboru (detached — nedrží DB spojení requestu).
        if (cloudinaryPublicId && cloudinaryUrl) {
          void backupMediaToR2(payload, {
            id: doc.id,
            cloudinaryPublicId,
            url: cloudinaryUrl,
            mimeType: doc.mimeType as string | undefined,
            cloudinaryFormat: doc.cloudinaryFormat as string | undefined,
            alt: doc.alt as string | undefined,
          })
        } else {
          payload.logger.warn({
            msg: 'R2 afterChange: Druhý cyklus detekován, ale chybí Cloudinary data pro zálohu.',
            docId: doc.id,
            cloudinaryPublicId,
            hasUrl: !!cloudinaryUrl,
          })
        }

        // 2) Dorovnání: každé nahrání zároveň dožene případné dřívější nedodělané
        //    zálohy (pending/error) — díky tomu není potřeba cron.
        void reconcilePendingBackups(payload)
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
