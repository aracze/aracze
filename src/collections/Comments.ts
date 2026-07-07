import type { Access, CollectionConfig, Where } from 'payload'

// Zápis (vkládání/úpravy/mazání) zatím jen pro adminy — stejný vzor jako u Users.
// Veřejné odesílání z frontendu (jméno + captcha) se doplní později spolu s frontendem.
const isAdmin: Access = ({ req: { user } }) => Boolean(user?.roles?.includes('admin'))

// Komentáře (na článcích) a recenze (na místech / turistických cílech = Pages).
// Jediný strukturální rozdíl: recenze má hvězdičkové hodnocení (rating), komentář ne.
// Odpovídá legacy modelu (comment + comment_details), kde review = záznam s ratingem.
export const Comments: CollectionConfig = {
  slug: 'comments',
  admin: {
    useAsTitle: 'authorName',
    defaultColumns: ['authorName', 'type', 'rating', 'status', 'commentedAt'],
  },
  access: {
    // Anonym: skrýt spam + recenze na NEpublikované stránky. Články jsou vždy veřejné
    // (nemají drafty). Řeší se přes polymorfní `relatedTo` (relationTo + value), protože
    // nelze filtrovat cizí `_status` inline; `not_in` na polymorfní value navíc není podporováno.
    read: async ({ req }): Promise<boolean | Where> => {
      if (req.user) return true
      const notSpam: Where = { status: { not_equals: 'spam' } }

      // Rychlá cesta: bez draft stránek není co skrývat (běžný stav).
      const drafts = await req.payload.find({
        collection: 'pages',
        where: { _status: { equals: 'draft' } },
        depth: 0,
        limit: 0,
        pagination: false,
        overrideAccess: true,
        req,
        select: {},
      })
      if (drafts.docs.length === 0) return notSpam

      // Jsou drafty → povolit komentáře na články + recenze jen na publikované stránky.
      const published = await req.payload.find({
        collection: 'pages',
        where: {
          or: [{ _status: { equals: 'published' } }, { _status: { exists: false } }],
        },
        depth: 0,
        limit: 0,
        pagination: false,
        overrideAccess: true,
        req,
        select: {},
      })
      const publishedIds = published.docs.map((p) => p.id)

      return {
        and: [
          notSpam,
          {
            or: [
              { 'relatedTo.relationTo': { equals: 'articles' } },
              {
                and: [
                  { 'relatedTo.relationTo': { equals: 'pages' } },
                  { 'relatedTo.value': { in: publishedIds } },
                ],
              },
            ],
          },
        ],
      }
    },
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'comment',
      options: [
        { label: 'Komentář', value: 'comment' },
        { label: 'Recenze', value: 'review' },
      ],
      admin: {
        description: 'Recenze (na místech) má navíc hvězdičkové hodnocení.',
      },
    },
    {
      name: 'rating',
      label: 'Hodnocení (hvězdičky)',
      type: 'number',
      min: 1,
      max: 5,
      admin: {
        // Zobrazit jen u recenze.
        condition: (data) => data?.type === 'review',
      },
      validate: (
        value: number | null | undefined,
        { siblingData }: { siblingData: Partial<{ type: string }> },
      ) => {
        if (siblingData?.type === 'review') {
          if (value == null) return 'Recenze musí mít hodnocení 1–5.'
          if (value < 1 || value > 5) return 'Hodnocení musí být 1–5.'
        }
        if (siblingData?.type === 'comment' && value != null) {
          return 'Komentář nemá mít hodnocení.'
        }
        return true
      },
    },
    {
      name: 'body',
      label: 'Text',
      type: 'textarea',
      required: true,
    },
    {
      // Cíl komentáře/recenze: článek (komentáře) nebo stránka/místo (recenze).
      name: 'relatedTo',
      label: 'Vztaženo k',
      type: 'relationship',
      relationTo: ['articles', 'pages'],
      required: true,
      index: true,
    },
    {
      name: 'authorName',
      label: 'Jméno autora',
      type: 'text',
      required: true,
      admin: {
        description: 'Vyplňuje každý (registrace se nevyžaduje).',
      },
    },
    {
      // Napojení na registrovaného uživatele, pokud existuje. U anonymních prázdné.
      name: 'author',
      label: 'Registrovaný autor',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      // Anonymní read filtruje `status != spam` na každém requestu → index.
      index: true,
      defaultValue: 'published',
      options: [
        { label: 'Publikováno', value: 'published' },
        { label: 'Spam', value: 'spam' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Vše se publikuje; spam se označí (skryje z veřejnosti).',
      },
    },
    {
      name: 'commentedAt',
      label: 'Datum vložení',
      type: 'date',
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime' },
        description: 'Původní datum z legacy webu (u migrovaných dat).',
      },
    },
    {
      name: 'legacyCommentId',
      label: 'Legacy Comment ID',
      type: 'number',
      unique: true,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
  ],
}
