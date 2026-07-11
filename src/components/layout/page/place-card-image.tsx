"use client";

import Image from "next/image";
import { cloudinaryVariant, isCloudinary } from "@/lib/cloudinary-loader";

/**
 * Obrázek karty místa s ořezem podle zařízení (art direction).
 *
 * Karta má pevnou výšku 280 px, ale proměnlivou šířku, takže její tvar se mění:
 * pod 1024 px (mobil/tablet) je na šířku, na desktopu je vedle mapy na výšku,
 * bez mapy skoro čtvercová. Pro každý případ proto Cloudinary ořízne jiný poměr
 * (`c_fill,g_auto`), aby se nestahovaly pixely, které `object-cover` stejně ořízne.
 *
 * Art direction řešíme dvěma `next/image` variantami přepínanými `hidden lg:block`
 * / `lg:hidden` (místo `<picture>`), aby obrázky procházely optimalizací Next.js.
 * Každá varianta má vlastní `loader` s jiným ořezem; šířky dopočítá `next/image`
 * z `sizes`, takže displeje s neceločíselným zvětšením (125 %, 150 %) stáhnou
 * přesně potřebnou velikost místo skoku na dvojnásobek.
 *
 * Ne-Cloudinary zdroje (dev/localhost, Payload) se nedají ořezávat → `unoptimized`,
 * aby `next/image` nenabízel duplicitní srcset kandidáty se stejnou URL.
 */

const BASE = "f_auto,q_auto";

/** `next/image` loader s pevným Cloudinary ořezem (poměr stran dle varianty). */
function cropLoader(crop: string) {
  return ({ src, width }: { src: string; width: number }) =>
    cloudinaryVariant(src, `${BASE},${crop},w_${width}`);
}

interface PlaceCardImageProps {
  src: string;
  alt: string;
  className?: string;
  /** true = karta vedle mapy (3 sloupce, na výšku); false = 4 sloupce, skoro čtverec */
  hasMap?: boolean;
}

export function PlaceCardImage({
  src,
  alt,
  className,
  hasMap = false,
}: PlaceCardImageProps) {
  // Desktop: vedle mapy portrét (~207×280 → 5:7), jinak skoro čtverec (~278×280 → 1:1)
  const desktopAr = hasMap ? "5:7" : "1:1";
  const desktopSizes = hasMap ? "210px" : "280px";
  const unoptimized = !isCloudinary(src);

  return (
    <>
      {/* Desktop (≥1024 px) */}
      <Image
        src={src}
        alt={alt}
        fill
        loader={cropLoader(`c_fill,g_auto,ar_${desktopAr}`)}
        sizes={desktopSizes}
        unoptimized={unoptimized}
        className={`hidden lg:block ${className ?? ""}`}
      />
      {/* Mobil + tablet (<1024 px): karta je na šířku */}
      <Image
        src={src}
        alt={alt}
        fill
        loader={cropLoader("c_fill,g_auto,ar_3:2")}
        sizes="(min-width: 640px) 50vw, 100vw"
        unoptimized={unoptimized}
        className={`lg:hidden ${className ?? ""}`}
      />
    </>
  );
}
