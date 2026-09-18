import { PageCategory } from '../types/payload'

/**
 * Kategorie, které jsou v hierarchii „místem" (legacy: bod zájmu — stát, město,
 * oblast). Jen pro ně platí vypnuté „Include Place in Child URLs" na předkovi.
 * Turistický cíl tu ZÁMĚRNĚ není: legacy `createUniqueUrl` přeskakovalo mezistupně jen u
 * PLACE_TO_VISIT, takže cíl pod skrytým státem si stát v adrese drží
 * (/usa/wyoming/devils-tower, ne /usa/devils-tower).
 */
const placeCategoriesInUrls: string[] = [PageCategory.Misto_k_navstiveni]

/** Předek v řetězci — jen pole, která adresa potřebuje (tvar z pluginu nested-docs). */
type UrlAncestor = {
  slug?: unknown
  category?: unknown
  includeInChildUrlPaths?: unknown
}

/**
 * Složí adresu stránky z řetězce předků (od nejvyšší úrovně po stránku samotnou).
 * Používá ji plugin nested-docs při každém uložení (`generateURL`); po PUBLIKOVÁNÍ
 * předka přeukládá i potomky, takže se jejich adresy přepočítají zároveň.
 *
 * Pravidlo pro „Include Place in Child URLs" (`includeInChildUrlPaths`): vypnuté
 * na stránce znamená, že se vynechá z adres MÍST pod ní — a tím i ze všeho, co je pod těmi
 * místy. NEplatí pro její vlastní informační podstránky. Wyoming (vypnuto) tedy
 * z /usa/narodni-park-yellowstone (místo) ani z /usa/narodni-park-yellowstone/pocasi
 * není vidět, ale ve /usa/wyoming/pocasi zůstává — počasí není místo, patří
 * přímo Wyomingu. Stejně tak turistický cíl: /usa/wyoming/devils-tower.
 */
export function buildPageUrl(ancestors: UrlAncestor[]): string {
  return ancestors.reduce((url, doc, index) => {
    const isLast = index === ancestors.length - 1
    const hiddenInChildPaths = doc.includeInChildUrlPaths === false
    const placeBelow = ancestors
      .slice(index + 1)
      .some((below) => placeCategoriesInUrls.includes(String(below.category)))

    if (isLast || !hiddenInChildPaths || !placeBelow) {
      return `${url}/${String(doc.slug)}`
    }
    return url
  }, '')
}
