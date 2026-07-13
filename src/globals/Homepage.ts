import type { GlobalConfig } from 'payload'
import { revalidateGlobalsAfterChange } from '../hooks/revalidation'

export const Homepage: GlobalConfig = {
  slug: 'homepage',
  access: {
    read: () => true,
  },
  hooks: {
    afterChange: [revalidateGlobalsAfterChange],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
  ],
}
