import type { Block } from 'payload'
import { lexicalEditor } from '@payloadcms/richtext-lexical'

// Legacy `<div class="article-rek">` (reklama / promo box) — v původním webu ohraničený
// blok s tenkou linkou nahoře i dole, obvykle s odkazem na externí blog autora.
// Migrujeme ho jako samostatný blok místo splynutí s běžným textem.
export const PromoBlock: Block = {
  slug: 'promoBlock',
  interfaceName: 'PromoBlock',
  labels: {
    singular: 'Propagační blok',
    plural: 'Propagační bloky',
  },
  fields: [
    {
      name: 'content',
      type: 'richText',
      label: 'Obsah propagačního bloku',
      required: true,
      editor: lexicalEditor(),
    },
  ],
}
