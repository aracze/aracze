import type { FieldHook } from 'payload'

type CommentRel = { relationTo: 'articles' | 'pages'; value: number | { id: number } } | undefined

/**
 * Vypočítá `label` komentáře/recenze = titulek navázaného obsahu (stránka/článek),
 * s fallbackem na typ (Recenze/Komentář). Ukládá se kvůli vykreslení a fulltextu
 * (polymorfní relaci Payload jako titulek/hledání neumí).
 *
 * Partial update: pokud incoming `data` neobsahuje ani `relatedTo`, ani `type`,
 * necháme původní label být (jinak by ho částečný update přepsal fallbackem).
 */
export const populateCommentLabel: FieldHook = async ({
  data,
  req,
  operation,
  originalDoc,
  value,
}) => {
  const relProvided = data?.relatedTo !== undefined
  const typeProvided = data?.type !== undefined

  if (operation === 'update' && !relProvided && !typeProvided) {
    return value ?? originalDoc?.label
  }

  const rel = (data?.relatedTo ?? originalDoc?.relatedTo) as CommentRel
  const type = (data?.type ?? originalDoc?.type) as string | undefined

  if (rel?.value != null) {
    const id = typeof rel.value === 'object' ? rel.value.id : rel.value
    try {
      const doc = await req.payload.findByID({
        collection: rel.relationTo,
        id,
        depth: 0,
        overrideAccess: true,
        req,
        select: { title: true },
      })
      if (doc?.title) return String(doc.title)
    } catch {
      /* cíl nedohledán → fallback níže */
    }
  }
  return type === 'review' ? 'Recenze' : 'Komentář'
}
