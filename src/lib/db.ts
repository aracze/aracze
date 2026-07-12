import { getPayload, type Payload } from 'payload'
import config from '@payload-config'

/**
 * Sdílený singleton Payload LOCAL API instance.
 *
 * getPayload má vlastní cache, ale v dev s Turbopackem se moduly izolují a init
 * se opakoval při každém požadavku (schema pull + connect = desítky sekund).
 * Držíme jednu instanci na globalThis, kterou sdílí datová vrstva (lib/payload.ts)
 * i vyhledávání (lib/search.ts) — jinak by /api/search spouštěl vlastní init.
 */
const __g = globalThis as unknown as { __araPayload?: Promise<Payload> }

export const getDb = (): Promise<Payload> => {
  if (!__g.__araPayload) {
    // Když init selže (DB ještě neběží / špatná konfigurace při cold startu),
    // odmítnutý Promise se NESMÍ zacyklit v cache — zahodíme ho a chybu propustíme
    // dál, takže příští požadavek zkusí init znovu (jinak by web zůstal rozbitý
    // až do restartu procesu).
    __g.__araPayload = getPayload({ config }).catch((err) => {
      delete __g.__araPayload
      throw err
    })
  }
  return __g.__araPayload
}
