import type { Block } from 'payload'

export const DailyCostsBlock: Block = {
  slug: 'dailyCostsBlock',
  interfaceName: 'DailyCostsBlock',
  labels: {
    singular: 'Denní náklady',
    plural: 'Denní náklady',
  },
  fields: [
    {
      name: 'heading',
      type: 'text',
      label: 'Nadpis sekce',
      defaultValue: 'Denní náklady',
    },
    {
      name: 'columns',
      type: 'array',
      label: 'Sloupce nákladů',
      minRows: 1,
      maxRows: 3,
      fields: [
        {
          name: 'tier',
          type: 'select',
          label: 'Typ sloupce',
          required: true,
          options: [
            { label: 'Levné cestování', value: 'budget' },
            { label: 'Středně drahé cestování', value: 'midrange' },
            { label: 'Luxusní cestování', value: 'top' },
          ],
        },
        {
          name: 'rangeLabel',
          type: 'text',
          label: 'Titulek rozsahu',
          required: true,
        },
        {
          name: 'price',
          type: 'text',
          label: 'Rozpočet',
          required: true,
        },
        {
          name: 'items',
          type: 'array',
          label: 'Položky',
          fields: [
            {
              name: 'text',
              type: 'text',
              label: 'Text položky',
              required: true,
            },
          ],
        },
      ],
    },
  ],
}
