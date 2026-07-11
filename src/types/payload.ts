export interface StrapiMedia {
  url: string
  alternativeText: string | null
}

export interface Homepage {
  title: string
}

export interface SharedImageComponent {
  alternativeText: string
  url: string | URL
  image: StrapiMedia | null
  featureImageStyleCss: string | null
}

export interface NavLink {
  id: number
  title: string
  href: string
  isExternal: boolean
  isButtonLink: boolean
}

export interface ImageLink {
  id: number
  svgCode: string | null
  image: SharedImageComponent | null
  link: NavLink | null
}

export interface GlobalHeader {
  id: number
  logo: ImageLink | null
  navItems: NavLink[]
  login: NavLink | null
}

export interface PageChild {
  id: string | number
  title: string
  fullSlug: string
  documentId: string
  category?: string
  featuredImage?: SharedImageComponent | null
  text?: string | RichTextRoot | null
  children?: {
    docs: PageChild[]
  }
  detail?: {
    latitude?: string | null
    longitude?: string | null
    googleMapsZoom?: number | null
    googleMapsAddress?: string | null
  } | null
}

export interface RichTextRoot {
  root?: {
    children?: unknown[]
  }
}

export interface ArticleMainPage {
  id: string | number
  title: string
  fullSlug: string
}

export interface ArticleAuthor {
  username?: string | null
  firstName?: string | null
  lastName?: string | null
  description?: string | null
  avatar?: { url?: string | null } | null
}

/**
 * Article featured image. From a page's articles join `image` comes back as a numeric
 * media id (uploads aren't deep-populated); after `enrichArticleImages` it's a populated
 * media object. Model both instead of casting.
 */
export interface ArticleFeaturedImage extends Omit<SharedImageComponent, 'image'> {
  image: StrapiMedia | number | null
}

export interface Article {
  documentId: string
  title: string
  slug: string
  text: string | RichTextRoot
  attribution?: string | RichTextRoot | null
  category: string
  publishedAt: string
  featuredImage: ArticleFeaturedImage | null
  mainPage?: ArticleMainPage | null
  createdByPublic?: ArticleAuthor | null
}

export interface Page {
  id: string | number
  title: string
  fullSlug: string
  category: PageCategory
  text: string | RichTextRoot
  publishedAt: string
  featuredImage: SharedImageComponent | null
  children: {
    docs: PageChild[]
  }
  articles: Article[]
  detail?: {
    timezone?: string | null
    currencyCode?: string | null
    locative?: string | null
    genitive?: string | null
    latitude?: string | null
    longitude?: string | null
    googleMapsZoom?: number | null
    googleMapsAddress?: string | null
  } | null
  createdBy?:
    | {
        username?: string | null
        firstName?: string | null
        lastName?: string | null
        avatar?: StrapiMedia | null
      }
    | number
    | null
  createdByPublic?: {
    id: number
    username?: string | null
    firstName?: string | null
    lastName?: string | null
    avatar?: StrapiMedia | null
  } | null
}

export interface PagesResponse {
  data: {
    pages: Page[]
    global: {
      header: GlobalHeader
    } | null
    homepage: Homepage | null
  }
}

export interface StrapiEvent {
  event: string
  createdAt: string
  model: string
  uid: string
  entry: PageEntry
}

interface PageEntry {
  id: number
  documentId: string
  title: string
  slug: string
  category: string
  text: string
  createdAt: string
  updatedAt: string
  publishedAt: string
  fullSlug: string
  includeInChildUrlPaths: null
  parent: PageParent
  children: unknown[] // Array of page-like objects (incomplete structure)
  featuredImage: null
}

interface PageParent {
  id: number
  documentId: string
  title: string
  slug: string
  category: string
  text: string
  createdAt: string
  updatedAt: string
  publishedAt: string
  fullSlug: string
  includeInChildUrlPaths: boolean | null
}

export enum PageCategory {
  Misto_k_navstiveni = 'Místo k navštívení',
  Turisticky_cil = 'Turistický cíl',
  Mista = 'Místa',
  Prakticke_informace = 'Praktické informace',
  Vstupni_podminky = 'Vstupní podmínky',
  Cesta = 'Cesta',
  Pocasi = 'Počasí',
  Doprava = 'Doprava',
  Mena_a_ceny = 'Měna a ceny',
  Zdravi_a_bezpeci = 'Zdraví a bezpečí',
  Jazyk_a_kultura = 'Jazyk a kultura',
  Jidlo_a_pit = 'Jídlo a pití',
  Ubytovani = 'Ubytování',
  Clanky = 'Články',
  Rubrika = 'Rubrika',
  Staticka_stranka = 'Statická stránka',
}

export interface FooterNavItem {
  label: string
  href: string
}

export interface GlobalFooter {
  logo?: ImageLink | null
  navItems: FooterNavItem[]
  copyrightText: RichTextRoot | null
}
