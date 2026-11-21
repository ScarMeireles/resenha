import type { User } from './api'

/**
 * Troca os dados de uma pessoa (evento "userUpdated": nome, foto, banner ou @) em qualquer lista
 * que guarde `{ user }`. Se ela não estiver na lista, devolve a mesma lista (o React não redesenha à toa).
 */
export function replaceUser<T extends { user: User }>(items: T[], user: User): T[] {
  if (!items.some((item) => item.user.id === user.id)) return items
  return items.map((item) => (item.user.id === user.id ? { ...item, user } : item))
}
