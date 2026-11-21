import { HubConnectionBuilder, LogLevel, type IHttpConnectionOptions } from '@microsoft/signalr'
import { apiUrl, type User } from './api'
import type { FriendDto, FriendRequestDto } from './friends'
import type { Presence } from './presence'
import type { GroupDto, MessageDto } from './groups'

/** Quem agiu numa chamada: `userId` é a pessoa que aceitou, recusou, cancelou ou desligou. */
export interface CallActionPayload {
  room: string
  userId: string
}

/** Eventos que o servidor manda (hub /hubs/app). Uma conexão só atende amigos, grupos e voz. */
export interface RealtimeHandlers {
  friendRequestReceived(request: FriendRequestDto): void
  friendAdded(friend: FriendDto): void
  friendRequestRemoved(payload: { requestId: string }): void
  friendRemoved(payload: { userId: string }): void
  presenceChanged(payload: { userId: string; presence: Presence }): void
  groupAdded(group: GroupDto): void
  groupUpdated(group: GroupDto): void
  groupRemoved(payload: { groupId: string }): void
  messageCreated(message: MessageDto): void
  messageDeleted(payload: { groupId: string; messageId: string }): void
  voiceParticipants(payload: { groupId: string; userIds: string[] }): void
  /** Alguém que conheço (ou eu, em outra janela) mudou nome, foto, banner ou @. */
  userUpdated(user: User): void
  callIncoming(payload: { room: string; from: User }): void
  callAccepted(payload: CallActionPayload): void
  callDeclined(payload: CallActionPayload): void
  callCancelled(payload: CallActionPayload): void
  callEnded(payload: CallActionPayload): void
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

/** O pedaço da conexão do SignalR que o app usa (permite testar com um falso). */
export interface HubLike {
  on(event: string, handler: (...args: never[]) => void): void
  onreconnected(handler: () => void): void
}

const EVENTS = [
  'friendRequestReceived', 'friendAdded', 'friendRequestRemoved', 'friendRemoved', 'presenceChanged',
  'groupAdded', 'groupUpdated', 'groupRemoved', 'messageCreated', 'messageDeleted',
  'voiceParticipants', 'userUpdated', 'callIncoming', 'callAccepted', 'callDeclined', 'callCancelled', 'callEnded',
] as const

/** Liga cada evento do servidor ao handler correspondente. */
export function bindHandlers(connection: HubLike, handlers: RealtimeHandlers): void {
  for (const name of EVENTS) connection.on(name, handlers[name] as (...args: never[]) => void)
  connection.onreconnected(() => handlers.resync())
}

/**
 * Start/stop seguros. No React StrictMode (dev) o efeito monta, desmonta e monta de novo: o stop() chegava
 * no meio da negociação e o SignalR registrava "Failed to start the connection". Agora o stop espera a
 * tentativa de conexão terminar (com sucesso ou erro) antes de parar de fato.
 */
export function createLifecycle(connection: { start(): Promise<void>; stop(): Promise<void> }, onStarted: () => void): Realtime {
  let starting: Promise<void> | undefined
  return {
    async start() {
      const attempt = connection.start()
      starting = attempt
      try {
        await attempt
      } finally {
        if (starting === attempt) starting = undefined
      }
      onStarted()
    },
    async stop() {
      await starting?.catch(() => undefined)
      await connection.stop()
    },
  }
}

export function createRealtime(token: string, handlers: RealtimeHandlers): Realtime {
  const connection = new HubConnectionBuilder()
    .withUrl(`${apiUrl}/hubs/app`, hubConnectionOptions(token))
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Warning)
    .build()

  bindHandlers(connection, handlers)
  return createLifecycle(connection, () => handlers.resync())
}
