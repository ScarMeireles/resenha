import { HubConnectionBuilder, LogLevel, type IHttpConnectionOptions } from '@microsoft/signalr'
import { apiUrl } from './api'
import type { FriendDto, FriendPresence, FriendRequestDto } from './friends'

/** Eventos que o servidor manda (hub /hubs/app). */
export interface RealtimeHandlers {
  friendRequestReceived(request: FriendRequestDto): void
  friendAdded(friend: FriendDto): void
  friendRequestRemoved(payload: { requestId: string }): void
  friendRemoved(payload: { userId: string }): void
  presenceChanged(payload: { userId: string; presence: FriendPresence }): void
  /** Chamado ao iniciar e ao reconectar: a presença pode ter mudado enquanto estava fora. */
  resync(): void
}

export interface Realtime {
  start(): Promise<void>
  stop(): Promise<void>
}

/**
 * Opções da conexão com o hub.
 * `withCredentials: false` é obrigatório: por padrão o cliente SignalR manda cookies, mas a API libera
 * qualquer origem (CORS "*") justamente porque não usa cookie. O navegador recusa "*" + cookies e a
 * conexão nunca abre. O login vai no token (accessTokenFactory), não em cookie.
 */
export function hubConnectionOptions(token: string): IHttpConnectionOptions {
  return { accessTokenFactory: () => token, withCredentials: false }
}

export function createRealtime(token: string, handlers: RealtimeHandlers): Realtime {
  const connection = new HubConnectionBuilder()
    .withUrl(`${apiUrl}/hubs/app`, hubConnectionOptions(token))
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Warning)
    .build()

  connection.on('friendRequestReceived', handlers.friendRequestReceived)
  connection.on('friendAdded', handlers.friendAdded)
  connection.on('friendRequestRemoved', handlers.friendRequestRemoved)
  connection.on('friendRemoved', handlers.friendRemoved)
  connection.on('presenceChanged', handlers.presenceChanged)
  connection.onreconnected(() => handlers.resync())

  return {
    async start() {
      await connection.start()
      handlers.resync()
    },
    stop: () => connection.stop(),
  }
}
