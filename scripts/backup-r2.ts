import { getPayload } from 'payload'
import config from '../src/payload.config'
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import 'dotenv/config'

const BATCH_SIZE = 20 // Stahujeme 20 najednou
const DELAY_BETWEEN_BATCHES = 1000 // 1 vteřina pauza
const FETCH_TIMEOUT_MS = 15_000 // Pojistka proti zaseknutému stažení z Cloudinary

// Zálohujeme JEN obrázky z produkčního Cloudinary účtu. Lokálně nahrané obrázky
// jdou na dev účet (CLOUDINARY_CLOUD_NAME v .env), a proto do R2 zálohy nepatří.
// Produkční účet lze v případě potřeby přepsat přes PROD_CLOUDINARY_CLOUD_NAME.
const PROD_CLOUD = process.env.PROD_CLOUDINARY_CLOUD_NAME || 'ara'

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function run() {
  const payload = await getPayload({ config })

  // Inicializace R2 / S3 klienta
  const rawEndpoint = process.env.S3_ENDPOINT as string
  const cleanedEndpoint = rawEndpoint.endsWith(`/${process.env.S3_BUCKET}`)
    ? rawEndpoint.replace(`/${process.env.S3_BUCKET}`, '')
    : rawEndpoint

  const s3 = new S3Client({
    region: 'auto',
    endpoint: cleanedEndpoint,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID as string,
      secretAccessKey: process.env.S3_SECRET as string,
    },
  })

  const bucket = process.env.S3_BUCKET as string

  let page = 1
  let totalProcessed = 0
  let totalUploaded = 0
  let totalSkipped = 0
  let totalSkippedDev = 0
  let totalErrors = 0
  let hasNextPage = true

  console.log(
    `Zahajuji zálohování objektů Media do R2 (${bucket}) – jen z produkčního účtu "${PROD_CLOUD}"`,
  )

  while (hasNextPage) {
    const { docs, hasNextPage: hasMore } = await payload.find({
      collection: 'media',
      limit: BATCH_SIZE,
      page,
      depth: 0,
    })

    hasNextPage = hasMore

    console.log(`\nZpracovávám stránku ${page} (${docs.length} záznamů)...`)

    // Zpracujeme dávku paralelně
    const batchPromises = docs.map(async (doc) => {
      totalProcessed++
      const publicId = doc.cloudinaryPublicId as string | undefined
      const format = doc.cloudinaryFormat as string | undefined
      const url = doc.url as string | undefined

      if (!publicId || !url) {
        console.log(`[Skipped] ID ${doc.id}: Chybí Cloudinary public_id nebo URL.`)
        totalSkipped++
        return
      }

      // Přeskočíme vše, co není na produkčním Cloudinary účtu (typicky lokálně
      // nahrané testovací obrázky na dev účtu). Rozlišujeme podle cloud_name v URL:
      // https://res.cloudinary.com/<cloud_name>/image/upload/...
      const urlCloud = url.split('res.cloudinary.com/')[1]?.split('/')[0]
      if (urlCloud !== PROD_CLOUD) {
        console.log(
          `[Dev-skip] ID ${doc.id}: účet "${urlCloud ?? '?'}" ≠ produkce "${PROD_CLOUD}", přeskakuji.`,
        )
        totalSkippedDev++
        return
      }

      const mimeType = doc.mimeType as string | undefined
      const fallbackExtension = mimeType ? mimeType.split('/')[1] : 'jpg'
      const r2Key = `${publicId}.${format || fallbackExtension}`

      // 1. Zkontrolujeme, zda objekt už v R2 není (šetříme traffic a Cloudinary requesty)
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: r2Key }))
        console.log(`[Exists] ID ${doc.id}: ${r2Key} již v R2 existuje.`)
        totalSkipped++
        return // Vynecháme, už tam je
      } catch (error: any) {
        // Pokud chyba není NotFound (404), je to skutečná chyba, ale NotFound znamená, že soubor chybí a můžeme ho nahrát
        if (error.name !== 'NotFound' && error.$metadata?.httpStatusCode !== 404) {
          console.error(`[Chyba] Při kontrole R2 klíče ${r2Key}:`, error.message)
          totalErrors++
          return
        }
      }

      // 2. Stáhneme obrázek z Cloudinary
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
        if (!response.ok) {
          throw new Error(`Načtení selhalo se statusem: ${response.status}`)
        }

        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // 3. Nahrajeme do R2
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: r2Key,
            Body: buffer,
            ContentType: mimeType || 'application/octet-stream',
            Metadata: {
              alt: encodeURIComponent((doc.alt as string) || ''),
            },
          }),
        )

        console.log(`[Upload OK] ID ${doc.id}: ${r2Key} nahráno do R2.`)
        totalUploaded++
      } catch (error) {
        console.error(
          `[Chyba] Při stahování/nahrávání klíče ${r2Key}:`,
          error instanceof Error ? error.message : String(error),
        )
        totalErrors++
      }
    })

    await Promise.all(batchPromises)

    if (hasNextPage) {
      console.log(`Pauza ${DELAY_BETWEEN_BATCHES}ms před další dávkou...`)
      await sleep(DELAY_BETWEEN_BATCHES)
    }

    page++
  }

  console.log('\n=======================================')
  console.log('ZÁLOHOVÁNÍ DOKONČENO')
  console.log(`Celkem zpracováno záznamů: ${totalProcessed}`)
  console.log(`Nově nahráno do R2: ${totalUploaded}`)
  console.log(`Přeskočeno (již existovalo / chybné): ${totalSkipped}`)
  console.log(`Přeskočeno (mimo produkční účet "${PROD_CLOUD}"): ${totalSkippedDev}`)
  console.log(`Chyby: ${totalErrors}`)
  console.log('=======================================')

  process.exit(0)
}

run().catch((error) => {
  console.error('Kritická chyba skriptu:', error)
  process.exit(1)
})
