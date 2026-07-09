import type { FieldHook } from 'payload'

// Krátké názvy kategorií pro titulek (fallback, když transakce nemá navázaný cíl).
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

type TransactionRel =
  | { relationTo: 'articles' | 'pages' | 'comments'; value: number | { id: number } }
  | undefined

/**
 * Vypočítá `label` transakce = titulek navázaného cíle (u stránky/článku `title`,
 * u komentáře jeho `label`), s fallbackem na název kategorie.
 *
 * Partial update: pokud incoming `data` neobsahuje ani `relatedTo`, ani `category`,
 * necháme původní label být (jinak by ho částečný update přepsal fallbackem/`?`).
 */
export const populateTransactionLabel: FieldHook = async ({
  data,
  req,
  operation,
  originalDoc,
  value,
}) => {
  const relProvided = data?.relatedTo !== undefined
  const categoryProvided = data?.category !== undefined

  if (operation === 'update' && !relProvided && !categoryProvided) {
    return value ?? originalDoc?.label
  }

  const rel = (data?.relatedTo ?? originalDoc?.relatedTo) as TransactionRel
  const category = (data?.category ?? originalDoc?.category) as string | undefined

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
  return CATEGORY_LABELS[category as string] ?? category ?? '?'
}
