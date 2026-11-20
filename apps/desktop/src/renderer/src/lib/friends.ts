import { request, type User } from './api'

/** Tipos e chamadas de amigos. Espelham server/api (FriendDto, FriendRequestDto). */

export type FriendPresence = 'online' | 'offline' | 'in-call'

export interface FriendDto {
  user: User
  presence: FriendPresence
  since: string
}

/** `user` é sempre a OUTRA pessoa (quem enviou, se recebido; para quem enviei, se enviado). */
export interface FriendRequestDto {
  id: string
  user: User
  createdAt: string
}

export interface FriendsState {
  friends: FriendDto[]
  incoming: FriendRequestDto[]
  outgoing: FriendRequestDto[]
}

export interface UsernameCheck {
  available: boolean
  error: string | null
}

export const emptyFriends: FriendsState = { friends: [], incoming: [], outgoing: [] }

export const friendsApi = {
  getFriends: (token: string) => request<FriendsState>('GET', '/friends', { token }),

  sendFriendRequest: (token: string, username: string) =>
    request<FriendRequestDto>('POST', '/friends/requests', { token, json: { username } }),

  acceptFriendRequest: (token: string, id: string) =>
    request<FriendDto>('POST', `/friends/requests/${encodeURIComponent(id)}/accept`, { token }),

  /** Recusa (se recebido) ou cancela (se enviado). */
  removeFriendRequest: (token: string, id: string) =>
    request<void>('DELETE', `/friends/requests/${encodeURIComponent(id)}`, { token }),

  removeFriend: (token: string, userId: string) =>
    request<void>('DELETE', `/friends/${encodeURIComponent(userId)}`, { token }),
}

/** Verifica se o @ está livre (rota pública, sem token). */
export const checkUsername = (username: string, signal?: AbortSignal) =>
  request<UsernameCheck>('GET', `/auth/username-available?u=${encodeURIComponent(username)}`, { signal })

export type FriendsAction =
  | { type: 'loaded'; data: FriendsState }
  | { type: 'requestReceived'; request: FriendRequestDto }
  | { type: 'requestSent'; request: FriendRequestDto }
  | { type: 'requestRemoved'; id: string }
  | { type: 'friendAdded'; friend: FriendDto }
  | { type: 'friendRemoved'; userId: string }
  | { type: 'presenceChanged'; userId: string; presence: FriendPresence }

/** Insere ou troca pelo id, sem duplicar (o evento pode chegar junto com a resposta HTTP). */
const upsertRequest = (list: FriendRequestDto[], item: FriendRequestDto) =>
  list.some((r) => r.id === item.id) ? list.map((r) => (r.id === item.id ? item : r)) : [...list, item]

/** Estado dos amigos como função pura: cada ação devolve um novo estado. */
export function friendsReducer(state: FriendsState, action: FriendsAction): FriendsState {
  switch (action.type) {
    case 'loaded':
      return action.data
    case 'requestReceived':
      return { ...state, incoming: upsertRequest(state.incoming, action.request) }
    case 'requestSent':
      return { ...state, outgoing: upsertRequest(state.outgoing, action.request) }
    case 'requestRemoved':
      return {
        ...state,
        incoming: state.incoming.filter((r) => r.id !== action.id),
        outgoing: state.outgoing.filter((r) => r.id !== action.id),
      }
    case 'friendAdded': {
      const id = action.friend.user.id
      const exists = state.friends.some((f) => f.user.id === id)
      return {
        friends: exists ? state.friends.map((f) => (f.user.id === id ? action.friend : f)) : [...state.friends, action.friend],
        incoming: state.incoming.filter((r) => r.user.id !== id),
        outgoing: state.outgoing.filter((r) => r.user.id !== id),
      }
    }
    case 'friendRemoved':
      return { ...state, friends: state.friends.filter((f) => f.user.id !== action.userId) }
    case 'presenceChanged':
      return {
        ...state,
        friends: state.friends.map((f) => (f.user.id === action.userId ? { ...f, presence: action.presence } : f)),
      }
  }
}

/** Conectado (online ou em chamada), ou seja, não offline. */
export const isOnline = (presence: FriendPresence): boolean => presence !== 'offline'

/** Conectados primeiro; dentro de cada grupo, por nome (pt-BR). */
export function sortFriends(friends: FriendDto[]): FriendDto[] {
  return [...friends].sort((a, b) => {
    if (isOnline(a.presence) !== isOnline(b.presence)) return isOnline(a.presence) ? -1 : 1
    return a.user.displayName.localeCompare(b.user.displayName, 'pt-BR')
  })
}

/** Tira o "@" do começo, espaços e maiúsculas do que a pessoa digitou. */
export const normalizeUsername = (raw: string): string => raw.trim().replace(/^@+/, '').trim().toLowerCase()
