import type { Access } from 'payload'

/**
 * Přístup jen pro přihlášené administrátory (uživatel s rolí `admin`).
 * Sdílená autorizační politika napříč kolekcemi (Comments, Transactions).
 */
export const isAdmin: Access = ({ req: { user } }) => Boolean(user?.roles?.includes('admin'))
