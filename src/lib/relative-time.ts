/**
 * Český relativní čas („před 2 lety", „včera", „před 5 minutami") + absolutní
 * datum pro atribut `title`. Renderuje se na serveru (článek je force-dynamic),
 * takže žádný hydration mismatch.
 */

const rtf = new Intl.RelativeTimeFormat('cs', { numeric: 'auto' })
const absFmt = new Intl.DateTimeFormat('cs-CZ', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  // Pevná zóna — server běží v UTC (Docker/Vercel), bez toho by tooltip ukazoval
  // UTC místo českého času.
  timeZone: 'Europe/Prague',
})

export function formatCommentDate(iso: string | null): { relative: string; absolute: string } {
  if (!iso) return { relative: '', absolute: '' }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return { relative: '', absolute: '' }

  const absolute = absFmt.format(date)
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000)

  // Budoucí data (drobný posun hodin) hlásíme jako „právě teď".
  if (diffSec < 45) return { relative: 'právě teď', absolute }

  const min = Math.round(diffSec / 60)
  if (min < 60) return { relative: rtf.format(-min, 'minute'), absolute }

  const hours = Math.round(min / 60)
  if (hours < 24) return { relative: rtf.format(-hours, 'hour'), absolute }

  const days = Math.round(hours / 24)
  if (days < 30) return { relative: rtf.format(-days, 'day'), absolute }

  const months = Math.round(days / 30)
  if (months < 12) return { relative: rtf.format(-months, 'month'), absolute }

  const years = Math.round(days / 365)
  return { relative: rtf.format(-years, 'year'), absolute }
}
