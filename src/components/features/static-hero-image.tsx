import Image from "next/image";

interface StaticHeroImageProps {
  imageUrl: string | null;
  styleCss?: string;
}

/**
 * Vrátí hodnotu pro `object-position` z pole `featureImageStyleCss`.
 * Přijme `background-position: 50% 42%;`, `object-position: 50% 42%;`
 * i holé `50% 42%`. Prázdné / nerozpoznané → střed.
 */
function parseObjectPosition(styleCss?: string): string {
  if (!styleCss) return "50% 50%";
  const pos = styleCss
    .replace(/(?:background|object)-position\s*:\s*/i, "")
    .replace(/;/g, "")
    .trim();
  // Zbyla-li dvojtečka, šlo o jinou/nevalidní vlastnost → radši střed.
  if (!pos || pos.includes(":")) return "50% 50%";
  return pos;
}

export const StaticHeroImage = ({
  imageUrl,
  styleCss,
}: StaticHeroImageProps) => {
  // Bez obrázku necháme prosvítat tmavé pozadí sekce (bg-[#3b444f]).
  if (!imageUrl) return null;

  return (
    <Image
      src={imageUrl}
      alt=""
      fill
      priority
      // Hero je přes celou šířku → prohlížeč si podle šířky okna a DPR vybere
      // přiměřenou variantu (mobil malou, retina desktop až originál).
      sizes="100vw"
      className="object-cover transition-transform duration-[10000ms] hover:scale-105"
      style={{ objectPosition: parseObjectPosition(styleCss) }}
    />
  );
};
