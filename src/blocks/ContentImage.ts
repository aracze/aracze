import type { Block } from 'payload'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function resolveImageId(image: unknown): number | string | null {
  if (typeof image === 'string' || typeof image === 'number') {
    return image
  }

  if (image && typeof image === 'object' && 'id' in image) {
    const id = (image as { id?: unknown }).id
    if (typeof id === 'string' || typeof id === 'number') {
      return id
    }
  }

  return null
}

export const ContentImage: Block = {
  slug: 'contentImage',
  labels: {
    singular: 'Obrázek v obsahu',
    plural: 'Obrázky v obsahu',
  },
  fields: [
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      required: true,
    },
    {
      name: 'caption',
      type: 'text',
      label: 'Popisek pod obrázkem (nepovinný)',
      hooks: {
        beforeValidate: [
          async ({ value, siblingData, req }) => {
            if (typeof value === 'string' && value.trim().length > 0) {
              return value
            }

            if (value !== undefined && value !== null) {
              return value
            }

            const imageId = resolveImageId(siblingData?.image)
            if (!imageId) {
              return value
            }

            try {
              const media = await req.payload.findByID({
                collection: 'media',
                id: imageId,
                depth: 0,
                req,
              })

              const mediaAlt = typeof media?.alt === 'string' ? media.alt.trim() : ''
              return mediaAlt || value
            } catch {
              return value
            }
          },
        ],
      },
    },
  ],
  jsx: {
    export: ({ fields }) => {
      const image = fields.image
      if (!image || typeof image !== 'object') {
        console.warn('[ContentImage] jsx.export: image not populated (got ID instead of object)')
        return ''
      }
      const imgObj = image as Record<string, unknown>
      const caption = String(fields.caption ?? '')
      const src = String(imgObj.url ?? '')
      const alt = escapeHtml(String(imgObj.alt ?? ''))
      if (!src) return ''
      let html = `<img src="${escapeHtml(src)}" alt="${alt}" />`
      if (caption) {
        html = `<figure>${html}<figcaption>${escapeHtml(caption)}</figcaption></figure>`
      }
      return html
    },
    import: () => false,
  },
}
