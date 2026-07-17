import type { Endpoint } from 'payload'
import { APIError } from 'payload'
import { reconcileAllPendingBackups } from '../collections/Media'

// Jednorázové (admin-only) narovnání R2 záloh. Projede média se stavem
// `pending`/`error` a co v R2 UŽ je, jen dostane status `success` (přes HEAD-check,
// bez zbytečného přenosu); co chybí, dozálohuje. Určeno hlavně na dorovnání
// backlogu po hromadné migraci, kdy soubory v R2 jsou, ale DB o tom „neví".
//
// Volání (přihlášený admin):  POST /api/r2-reconcile-all
// Běží na POZADÍ — endpoint se vrátí hned; průběh je vidět v logu a ve sloupci
// „R2 Backup Status" v adminu (kolekce Media).
export const r2ReconcileAllEndpoint: Endpoint = {
  path: '/r2-reconcile-all',
  method: 'post',
  handler: async (req) => {
    const roles = Array.isArray(req.user?.roles) ? req.user?.roles : []
    if (!req.user || !roles.includes('admin')) {
      throw new APIError('Forbidden', 403)
    }

    // Pojistka: bez konfigurace R2 by dorovnání jen přepsalo statusy na `error`
    // (typicky v dev, kde R2 není). Radši nic nespouštíme.
    if (
      !process.env.S3_ENDPOINT ||
      !process.env.S3_BUCKET ||
      !process.env.S3_ACCESS_KEY_ID ||
      !process.env.S3_SECRET
    ) {
      throw new APIError(
        'R2 není nakonfigurované (chybí S3_* proměnné) — dorovnání nespouštím.',
        400,
      )
    }

    const { payload } = req

    // Fire-and-forget: dorovnání může trvat i minuty (stovky/tisíce médií),
    // nechceme držet HTTP request. Server je dlouhoběžící kontejner → doběhne.
    void reconcileAllPendingBackups(payload)
      .then((processed) => payload.logger.info(`R2 reconcile-all dokončeno: ${processed} médií.`))
      .catch((error) =>
        payload.logger.error(
          `R2 reconcile-all selhalo: ${error instanceof Error ? error.message : String(error)}`,
        ),
      )

    return Response.json({
      started: true,
      message:
        'Dorovnání R2 spuštěno na pozadí. Průběh sleduj v logu nebo ve sloupci „R2 Backup Status".',
    })
  },
}
