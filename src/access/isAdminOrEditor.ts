import type { PayloadRequest } from 'payload'

/**
 * Přístup pro přihlášené s rolí `admin` nebo `editor`.
 * Používá se pro zápis obsahu (Pages, Articles, Media) — role `user`
 * (výchozí, migrovaní koncoví uživatelé) obsah upravovat NESMÍ.
 *
 * Vrací striktně `boolean` (ne `Access`, které dovoluje i `Where`), takže je
 * použitelné i pro `access.admin` / `access.create`, kde je boolean povinný.
 */
export const isAdminOrEditor = ({ req: { user } }: { req: PayloadRequest }): boolean =>
  Boolean(user?.roles?.some((role) => role === 'admin' || role === 'editor'))
