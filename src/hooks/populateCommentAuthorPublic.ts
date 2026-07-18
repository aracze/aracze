import type { FieldHook } from 'payload'

// Bezpečná (veřejná) podmnožina registrovaného autora komentáře pro frontend.
// Web čte komentáře anonymně, ale Users.read = isAdminOrSelf → autora nelze
// populovat přes depth. Proto ho tu dohledáme s overrideAccess a vybereme jen
// veřejná pole (username pro odkaz na profil, avatar). U anonymních komentářů
// (bez `author`) vracíme null a frontend vykreslí iniciály z `authorName`.
export type CommentAuthorPublic = {
  username: string | null
  avatar: { url: string | null } | null
}

export const populateCommentAuthorPublic: FieldHook = async ({
  data,
  req,
}): Promise<CommentAuthorPublic | null> => {
  const author = data?.author
  if (!author) return null

  const authorId =
    typeof author === 'number'
      ? author
      : typeof author === 'object' && author && 'id' in author
        ? Number((author as { id: number }).id)
        : null

  if (!authorId) return null

  // Cache autorů per-request → výpis komentářů nefetchuje stejného autora opakovaně.
  const ctx = req.context as { commentAuthorCache?: Map<number, CommentAuthorPublic | null> }
  const cache = (ctx.commentAuthorCache ??= new Map())
  if (cache.has(authorId)) return cache.get(authorId) ?? null

  let result: CommentAuthorPublic | null = null
  try {
    // depth: 1 kvůli populaci `avatar` (upload) na objekt s `url` (cloudinary
    // dopočítává url v afterRead). `select` neaplikujeme na MEDIA, jen na usera.
    const user = await req.payload.findByID({
      collection: 'users',
      id: authorId,
      depth: 1,
      overrideAccess: true,
      req,
      select: {
        username: true,
        avatar: true,
      },
    })

    result = {
      username: user.username ?? null,
      avatar:
        user.avatar && typeof user.avatar === 'object' ? { url: user.avatar.url ?? null } : null,
    }
  } catch {
    result = null
  }

  cache.set(authorId, result)
  return result
}
