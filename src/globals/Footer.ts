import type { GlobalConfig } from 'payload'
import { revalidateGlobalsAfterChange } from '../hooks/revalidation'
import { lexicalEditor, LinkFeature } from '@payloadcms/richtext-lexical'
import { imageLinkFields } from '../fields/imageLink'

export const Footer: GlobalConfig = {
  slug: 'footer',
  access: {
    read: () => true,
  },
  hooks: {
    afterChange: [revalidateGlobalsAfterChange],
  },
  fields: [
    {
      name: 'logo',
      type: 'group',
      fields: imageLinkFields,
    },
    {
      name: 'navItems',
      label: 'Navigační položky',
      type: 'array',
      fields: [
        {
          name: 'label',
          label: 'Popisek',
          type: 'text',
          required: true,
        },
        {
          name: 'href',
          label: 'URL',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      name: 'copyrightText',
      label: 'Copyright text (celý odstavec včetně odkazů)',
      type: 'richText',
      editor: lexicalEditor({
        features: ({ defaultFeatures }) => [
          ...defaultFeatures.filter((f: any) => f?.key !== 'link'),
          LinkFeature({ enabledCollections: ['pages'] }),
        ],
      }),
    },
  ],
}
