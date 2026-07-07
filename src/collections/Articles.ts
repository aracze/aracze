import type { CollectionConfig } from 'payload'
import { imageFields } from '../fields/image'
import { slugField } from '../fields/slug'

import {
  MetaDescriptionField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'

export const Articles: CollectionConfig = {
  slug: 'articles',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', 'updatedAt'],
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'category',
      type: 'select',
      options: [
        { label: 'Článek', value: 'Článek' },
        { label: 'Průvodce', value: 'Průvodce' },
        { label: 'Rady na cestu', value: 'RadyNaCestu' },
      ],
      defaultValue: 'Článek',
      required: true,
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            {
              name: 'featuredImage',
              type: 'group',
              fields: imageFields,
              admin: {
                className: 'content-featured-image',
              },
            },
            {
              name: 'text',
              type: 'richText',
            },
            {
              name: 'attribution',
              label: 'Zdroj / attribution',
              type: 'richText',
              admin: {
                description:
                  'Zdroj na konci článku (např. "Zdroj: www.example.com"). Zobrazí se zarovnaný vpravo kurzívou.',
              },
            },
          ],
        },
        {
          name: 'meta',
          label: 'SEO',
          fields: [
            OverviewField({
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
              imagePath: 'featuredImage.image',
            }),
            MetaTitleField({
              hasGenerateFn: true,
            }),
            MetaDescriptionField({}),
            PreviewField({
              hasGenerateFn: true,
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
            }),
          ],
        },
      ],
    },
    slugField(),
    {
      name: 'publishedAt',
      label: 'Datum publikace',
      type: 'date',
      admin: {
        position: 'sidebar',
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    {
      name: 'legacyArticleId',
      label: 'Legacy Article ID',
      type: 'number',
      unique: true,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
      access: {
        update: ({ req: { user } }) => Boolean(user?.roles?.includes('admin')),
      },
    },
    {
      name: 'createdBy',
      label: 'Autor',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        position: 'sidebar',
      },
      hooks: {
        beforeChange: [
          ({ req, operation, value }) => {
            if (operation === 'create' && req.user) {
              return req.user.id
            }
            return value
          },
        ],
      },
    },
    {
      name: 'mainPage',
      label: 'Main Page (Canonical)',
      type: 'relationship',
      relationTo: 'pages',
      hasMany: false,
      admin: {
        position: 'sidebar',
        description: 'Určuje výslednou domovskou URL adresu článku a kanonický odkaz pro Google.',
      },
    },
    {
      name: 'pages',
      label: 'Other Pages',
      type: 'relationship',
      relationTo: 'pages',
      hasMany: true,
      admin: {
        position: 'sidebar',
        description:
          'Vyberte další destinace, ve kterých se má tento článek zobrazit v doporučeném výpisu.',
      },
    },
    {
      // Bezpečná podmnožina autorových údajů pro veřejný frontend (bez e-mailu/rolí).
      name: 'createdByPublic',
      type: 'json',
      virtual: true,
      hooks: {
        afterRead: [
          async ({ data, req }) => {
            const createdBy = data?.createdBy
            if (!createdBy) return null

            const authorId =
              typeof createdBy === 'number'
                ? createdBy
                : typeof createdBy === 'object' && createdBy && 'id' in createdBy
                  ? Number(createdBy.id)
                  : null

            if (!authorId) return null

            try {
              const user = (await req.payload.findByID({
                collection: 'users',
                id: authorId,
                depth: 1,
                overrideAccess: true,
              })) as any

              return {
                id: user.id,
                username: user.username ?? null,
                firstName: user.firstName ?? null,
                lastName: user.lastName ?? null,
                description: user.description ?? null,
                avatar:
                  user.avatar && typeof user.avatar === 'object'
                    ? { url: user.avatar.url ?? null }
                    : null,
              }
            } catch {
              return null
            }
          },
        ],
      },
      admin: {
        hidden: true,
      },
    },
  ],
}
