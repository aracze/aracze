import type { Field } from 'payload'

export const imageFields: Field[] = [
  {
    name: 'image',
    type: 'upload',
    relationTo: 'media',
  },
  {
    type: 'row',
    fields: [
      {
        name: 'featureImageStyleCss',
        type: 'text',
        label: 'Zarovnání hero fotky',
        admin: {
          width: '50%',
        },
      },
      {
        name: 'cloudinarySetting',
        type: 'text',
        admin: {
          width: '50%',
        },
      },
    ],
  },
]
