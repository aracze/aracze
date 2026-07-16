import type { Access } from 'payload'

/**
 * Přístup pro přihlášené s rolí `admin` nebo `editor`.
 * Používá se pro zápis obsahu (Pages, Articles, Media) — role `user`
 * (výchozí, migrovaní koncoví uživatelé) obsah upravovat NESMÍ.
 */
export const isAdminOrEditor: Access = ({ req: { user } }) =>
  Boolean(user?.roles?.some((role) => role === 'admin' || role === 'editor'))
