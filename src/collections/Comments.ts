import type { Access, CollectionConfig } from 'payload'

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
    // Veřejně čitelné, kromě označeného spamu (ten vidí jen přihlášení v adminu).
    read: ({ req: { user } }) => (user ? true : { status: { not_equals: 'spam' } }),
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
