/**
 * True, pokud jde o Cloudinary URL, kterou umíme transformovat (obsahuje
 * `/upload/`). Ostatní zdroje (lokální /assets, Payload uploads) transformovat
 * nejdou — u nich nemá `next/image` optimalizace přes tento loader smysl.
 */
export function isCloudinary(src: string): boolean {
  return src.includes('res.cloudinary.com') && src.includes('/upload/')
}

/**
 * Vloží Cloudinary transformaci hned za `/upload/`. Ne-Cloudinary zdroje
 * (lokální /assets, Payload uploads) vrací beze změny — nedají se transformovat.
 */
export function cloudinaryVariant(src: string, transform: string): string {
  if (!isCloudinary(src)) {
    return src
  }
  return src.replace('/upload/', `/upload/${transform}/`)
}

/**
 * Custom next/image loader: Cloudinary URL dostane transformaci
 * (automatický formát AVIF/WebP, kvalitu a šířku dle vykreslené velikosti),
 * takže prohlížeč stahuje jen tak velký obrázek, jaký opravdu zobrazí.
 * Ostatní zdroje projdou beze změny.
 */
export default function cloudinaryLoader({
  src,
  width,
  quality,
}: {
  src: string
  width: number
  quality?: number
}): string {
  // c_limit = zmenšit na danou šířku, ale nikdy nezvětšovat nad originál
  return cloudinaryVariant(src, `f_auto,q_${quality ?? 'auto'},c_limit,w_${width}`)
}
