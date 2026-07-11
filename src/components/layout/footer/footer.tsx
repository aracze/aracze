import Link from "next/link";
import Image from "next/image";
import { fetchFooter } from "@/lib/payload";
import { ImageLink } from "@/types/payload";
import { richTextToHtml } from "@/lib/utils";
import { isCloudinary } from "@/lib/cloudinary-loader";

import DOMPurify from "isomorphic-dompurify";

function FooterLogo({ logo }: { logo: ImageLink }) {
  if (logo.svgCode) {
    const sanitizedSvg = DOMPurify.sanitize(logo.svgCode, {
      USE_PROFILES: { svg: true },
    });

    return (
      <Link
        href={logo.link?.href ?? "/"}
        className="flex items-center shrink-0"
        aria-label="Ara.cz – Cestovní průvodce po světě"
      >
        <div
          className="h-[23px] w-auto flex items-center [&_svg]:h-[23px] [&_svg]:w-auto"
          dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
        />
      </Link>
    );
  }

  if (logo.image?.url) {
    const logoUrl = String(logo.image.url);
    return (
      <Link
        href={logo.link?.href ?? "/"}
        className="flex items-center shrink-0"
      >
        <Image
          src={logoUrl}
          alt={
            logo.image.alternativeText ?? "Ara.cz – Cestovní průvodce po světě"
          }
          height={23}
          width={80}
          className="h-[23px] w-auto object-contain"
          unoptimized={!isCloudinary(logoUrl)}
        />
      </Link>
    );
  }

  return null;
}

export async function Footer() {
  const footer = await fetchFooter();

  const navItems = footer?.navItems ?? [];
  const copyrightHtml = footer?.copyrightText
    ? richTextToHtml(footer.copyrightText)
    : "";
  const logo = footer?.logo ?? null;

  return (
    <footer className="bg-[#dddddd] w-full z-10">
      <div className="max-w-7xl mx-auto px-4 md:px-12">
        <div className="flex flex-wrap pt-5 mb-5 border-b border-[#eef1f3] text-sm text-[#1f1f1f]">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 list-none p-0 m-0 font-bold">
            {logo ? (
              <li>
                <FooterLogo logo={logo} />
              </li>
            ) : (
              <li>
                <Link
                  href="/"
                  aria-label="Ara.cz – Cestovní průvodce po světě"
                  className="text-[#1f1f1f] no-underline"
                >
                  <Image
                    src="/assets/logo-ara.png"
                    alt="Ara.cz – Cestovní průvodce po světě"
                    height={23}
                    width={80}
                    className="h-[23px] w-auto object-contain"
                    unoptimized
                  />
                </Link>
              </li>
            )}
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-[#1f1f1f] hover:text-white no-underline transition-colors"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div
          className="py-3 text-xs leading-[18px] text-[rgb(61,61,61)] [&_a]:text-[#1f1f1f] [&_p]:m-0"
          dangerouslySetInnerHTML={{ __html: copyrightHtml }}
        />
      </div>
    </footer>
  );
}
