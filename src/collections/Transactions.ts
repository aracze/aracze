import type { Access, CollectionConfig } from 'payload'

// Feather („pírka") transakce z legacy webu. Interní účetní záznam → jen pro adminy.
// Legacy dvojité účetnictví (credit/debit páry) je zploštěné: 1 operace = 1 transakce
// (bereme jen uživatelskou stranu, systémový offset se zahazuje).
const isAdmin: Access = ({ req: { user } }) => Boolean(user?.roles?.includes('admin'))

// Krátké názvy kategorií pro titulek.
const CATEGORY_LABELS: Record<string, string> = {
  tourist_point_reward: 'Turistický cíl',
  place_to_visit_reward: 'Místo k navštívení',
  practical_information_reward: 'Praktické informace',
  article_reward: 'Článek',
  review_reward: 'Recenze',
  comment_reward: 'Komentář',
  bonus: 'Bonus',
  withdrawal: 'Výběr',
}

export const Transactions: CollectionConfig = {
  slug: 'transactions',
  admin: {
    useAsTitle: 'label',
    defaultColumns: ['user', 'category', 'amount', 'relatedTo', 'transactedAt'],
  },
  access: {
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      // Titulek (useAsTitle) = název toho, k čemu se transakce váže. Počítá se při ukládání
      // dohledáním titulku cíle (u stránky/článku `title`, u komentáře jeho `label`).
      // Bez cíle (bonus/výběr) → kategorie. Počet pírek je vlastní pole/sloupec `amount`.
      name: 'label',
      type: 'text',
      index: true,
      admin: { readOnly: true, hidden: true },
      hooks: {
        beforeChange: [
          async ({ data, req }) => {
            const rel = data?.relatedTo as
              | {
                  relationTo: 'articles' | 'pages' | 'comments'
                  value: number | { id: number }
                }
              | undefined
            if (rel?.value != null) {
              const id = typeof rel.value === 'object' ? rel.value.id : rel.value
              const titleField = rel.relationTo === 'comments' ? 'label' : 'title'
              try {
                const doc = await req.payload.findByID({
                  collection: rel.relationTo,
                  id,
                  depth: 0,
                  overrideAccess: true,
                  req,
                  select: { [titleField]: true },
                })
                const name = (doc as unknown as Record<string, unknown>)?.[titleField]
                if (name) return String(name)
              } catch {
                /* cíl nedohledán → fallback na kategorii */
              }
            }
            return CATEGORY_LABELS[data?.category as string] ?? data?.category ?? '?'
          },
        ],
      },
    },
    {
      name: 'user',
      label: 'Uživatel',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      name: 'category',
      label: 'Kategorie',
      type: 'select',
      required: true,
      options: [
        { label: 'Turistický cíl (odměna)', value: 'tourist_point_reward' },
        { label: 'Místo k navštívení (odměna)', value: 'place_to_visit_reward' },
        { label: 'Praktické informace (odměna)', value: 'practical_information_reward' },
        { label: 'Článek (odměna)', value: 'article_reward' },
        { label: 'Recenze (odměna)', value: 'review_reward' },
        { label: 'Komentář (odměna)', value: 'comment_reward' },
        { label: 'Bonus', value: 'bonus' },
        { label: 'Výběr (withdrawal)', value: 'withdrawal' },
      ],
    },
    {
      name: 'amount',
      label: 'Pírka',
      type: 'number',
      required: true,
      admin: {
        description: 'Kladné = zisk, záporné = výběr.',
      },
    },
    {
      // Obsah, ke kterému se odměna váže. Prázdné jen u bonusu/výběru.
      name: 'relatedTo',
      label: 'Vztaženo k',
      type: 'relationship',
      relationTo: ['pages', 'articles', 'comments'],
      index: true,
    },
    {
      name: 'note',
      label: 'Poznámka',
      type: 'textarea',
    },
    {
      name: 'transactedAt',
      label: 'Datum transakce',
      type: 'date',
      index: true,
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime' },
        description: 'Původní datum z legacy webu.',
      },
    },
    {
      name: 'legacyTransactionId',
      label: 'Legacy Transaction ID',
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
