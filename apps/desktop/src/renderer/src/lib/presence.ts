import { request } from './api'

/** O que os outros veem de uma pessoa. Espelha PresenceTracker em server/api. */
export type Presence = 'online' | 'away' | 'in-call' | 'offline'

/** O que a pessoa escolhe para si. "offline" é invisível: aparece offline, mas o app segue recebendo ligações. */
export type ChosenStatus = 'online' | 'away' | 'offline'

export const presenceLabel: Record<Presence, string> = {
  online: 'Online',
  away: 'Ausente',
  'in-call': 'Em chamada',
  offline: 'Offline',
}

export const CHOSEN_STATUSES: { value: ChosenStatus; hint: string }[] = [
  { value: 'online', hint: 'Seus amigos veem que você está aqui.' },
  { value: 'away', hint: 'Aparece como ausente.' },
  { value: 'offline', hint: 'Aparece offline, mas as ligações continuam tocando.' },
]

export const isChosenStatus = (value: unknown): value is ChosenStatus =>
  value === 'online' || value === 'away' || value === 'offline'

export const statusApi = {
  get: (token: string) => request<{ status: ChosenStatus }>('GET', '/me/status', { token }),
  set: (token: string, status: ChosenStatus) => request<{ status: ChosenStatus }>('PUT', '/me/status', { token, json: { status } }),
}
