import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { emptyFriends, friendsApi, friendsReducer } from '../lib/friends'
import {
  groupsApi, groupsReducer, messagesReducer, reloadVoice, voiceReducer,
  type GroupDto, type MessageDto, type MessagesState, type VoiceState,
} from '../lib/groups'
import { conversationsReducer, dmsApi, loadUnread, saveUnread, unreadReducer, type DirectConversationDto, type DirectMessageDto } from '../lib/dms'
import { createRealtime, type RealtimeHandlers } from '../lib/realtime'
import { missedCallsApi, type MissedCallDto } from '../lib/missedCalls'
import type { User } from '../lib/api'

/** Eventos de chamada, tratados por useCall. */
export type CallEvents = Pick<RealtimeHandlers, 'callIncoming' | 'callAccepted' | 'callDeclined' | 'callCancelled' | 'callEnded'>

const RETRY_MS = 5000

const groupMessagesReducer = messagesReducer<MessageDto>
const dmMessagesReducer = messagesReducer<DirectMessageDto>

/**
 * Dados do app todo (amigos, grupos, mensagens e conversas diretas) numa conexão SignalR só.
 * Carrega pela API e se mantém atualizado pelos eventos. Liga quando há token e desliga ao sair (desmonta).
 */
export function useRealtime(token: string, meId: string, callEvents: CallEvents, onUserUpdated?: (user: User) => void) {
  const [voice, dispatchVoice] = useReducer(voiceReducer, {} as VoiceState)
  // Sempre o handler mais recente, sem religar a conexão a cada render.
  const callEventsRef = useRef(callEvents)
  callEventsRef.current = callEvents
  const onUserUpdatedRef = useRef(onUserUpdated)
  onUserUpdatedRef.current = onUserUpdated
  const [friends, dispatchFriends] = useReducer(friendsReducer, emptyFriends)
  const [groups, dispatchGroups] = useReducer(groupsReducer, [] as GroupDto[])
  const [messages, dispatchMessages] = useReducer(groupMessagesReducer, {} as MessagesState)
  const [groupsLoaded, markGroupsLoaded] = useReducer(() => true, false)
  // Ligações que não tocaram porque o app estava fechado (vêm da API ao conectar e a cada reconexão).
  const [missedCalls, setMissedCalls] = useState<MissedCallDto[]>([])

  // Conversas diretas e as mensagens das que já foram abertas.
  const [conversations, dispatchConversations] = useReducer(conversationsReducer, [] as DirectConversationDto[])
  const [dmMessages, dispatchDmMessages] = useReducer(dmMessagesReducer, {} as MessagesState<DirectMessageDto>)
  // Não lidas: controle só do cliente, salvo neste computador (separado por conta).
  const [unread, dispatchUnread] = useReducer(unreadReducer, meId, loadUnread)
  useEffect(() => saveUnread(meId, unread), [meId, unread])

  // O resync precisa saber quais conversas já foram abertas, sem religar a conexão a cada mensagem.
  const openChats = useRef<string[]>([])
  openChats.current = Object.keys(messages)
  const openDmChats = useRef<string[]>([])
  openDmChats.current = Object.keys(dmMessages)
  // DM na tela agora (o que chega nela já conta como lido) e as conversas que já conheço.
  const openDm = useRef<string | null>(null)
  const knownDms = useRef(new Set<string>())
  knownDms.current = new Set(conversations.map((c) => c.id))
  // Grupos cuja sala de voz já foi carregada (a chave some do estado quando a sala esvazia, então guardamos à parte).
  const voiceGroups = useRef(new Set<string>())

  useEffect(() => {
    let stopped = false
    let retry: ReturnType<typeof setTimeout> | undefined
    const quiet = () => undefined // sem rede: o próximo resync (reconexão) tenta de novo

    const resync = () => {
      void friendsApi.getFriends(token).then((data) => !stopped && dispatchFriends({ type: 'loaded', data }), quiet)
      void groupsApi.getGroups(token).then((list) => {
        if (stopped) return
        dispatchGroups({ type: 'loaded', groups: list })
        markGroupsLoaded()
      }, quiet)
      for (const groupId of openChats.current) {
        void groupsApi.getMessages(token, groupId).then(
          (page) => !stopped && dispatchMessages({ type: 'loaded', chatId: groupId, messages: page }),
          quiet,
        )
      }
      void dmsApi.list(token).then((list) => {
        if (stopped) return
        dispatchConversations({ type: 'loaded', conversations: list })
        dispatchUnread({ type: 'synced', conversations: list, meId, openId: openDm.current })
      }, quiet)
      for (const id of openDmChats.current) {
        void dmsApi.getMessages(token, id).then(
          (page) => !stopped && dispatchDmMessages({ type: 'loaded', chatId: id, messages: page }),
          quiet,
        )
      }
      void reloadVoice(token, voiceGroups.current, (groupId, userIds) => !stopped && dispatchVoice({ groupId, userIds }))
      void missedCallsApi.list(token).then((list) => !stopped && setMissedCalls(list), quiet)
    }

    const realtime = createRealtime(token, {
      friendRequestReceived: (request) => dispatchFriends({ type: 'requestReceived', request }),
      friendAdded: (friend) => {
        dispatchFriends({ type: 'friendAdded', friend })
        dispatchConversations({ type: 'friendship', userId: friend.user.id, canSend: true })
      },
      friendRequestRemoved: ({ requestId }) => dispatchFriends({ type: 'requestRemoved', id: requestId }),
      friendRemoved: ({ userId }) => {
        dispatchFriends({ type: 'friendRemoved', userId })
        dispatchConversations({ type: 'friendship', userId, canSend: false })
      },
      presenceChanged: ({ userId, presence }) => {
        dispatchFriends({ type: 'presenceChanged', userId, presence })
        dispatchGroups({ type: 'presenceChanged', userId, presence })
      },
      groupAdded: (group) => dispatchGroups({ type: 'added', group }),
      groupUpdated: (group) => dispatchGroups({ type: 'updated', group }),
      groupRemoved: ({ groupId }) => {
        dispatchGroups({ type: 'removed', groupId })
        dispatchMessages({ type: 'cleared', chatId: groupId })
      },
      messageCreated: (message) => dispatchMessages({ type: 'created', chatId: message.groupId, message }),
      messageDeleted: ({ groupId, messageId }) => dispatchMessages({ type: 'deleted', chatId: groupId, messageId }),
      directMessageCreated: (message) => {
        const id = message.conversationId
        dispatchDmMessages({ type: 'created', chatId: id, message })
        dispatchConversations({ type: 'messageCreated', message })
        dispatchUnread({ type: 'received', message, meId, openId: openDm.current })
        // Primeira mensagem de uma conversa que eu não tinha: busca os dados dela para entrar na lista.
        if (!knownDms.current.has(id)) {
          knownDms.current.add(id) // evita buscar de novo se chegarem várias seguidas
          void dmsApi.get(token, id).then((conversation) => !stopped && dispatchConversations({ type: 'upserted', conversation }), quiet)
        }
      },
      directMessageDeleted: ({ conversationId, messageId }) => {
        dispatchDmMessages({ type: 'deleted', chatId: conversationId, messageId })
        dispatchConversations({ type: 'messageDeleted', conversationId, messageId })
      },
      voiceParticipants: ({ groupId, userIds }) => dispatchVoice({ groupId, userIds }),
      // Alguém mudou nome, foto, banner ou @: troca em amigos, pedidos, membros e mensagens já carregadas.
      userUpdated: (user) => {
        dispatchFriends({ type: 'userUpdated', user })
        dispatchGroups({ type: 'userUpdated', user })
        dispatchMessages({ type: 'userUpdated', user })
        dispatchDmMessages({ type: 'userUpdated', user })
        dispatchConversations({ type: 'userUpdated', user })
        onUserUpdatedRef.current?.(user)
      },
      callIncoming: (payload) => callEventsRef.current.callIncoming(payload),
      callAccepted: (payload) => callEventsRef.current.callAccepted(payload),
      callDeclined: (payload) => callEventsRef.current.callDeclined(payload),
      callCancelled: (payload) => callEventsRef.current.callCancelled(payload),
      callEnded: (payload) => callEventsRef.current.callEnded(payload),
      resync,
    })

    // A conexão inicial não tenta de novo sozinha; repetimos até conseguir ou sair.
    const connect = () =>
      realtime.start().catch(() => {
        if (!stopped) retry = setTimeout(connect, RETRY_MS)
      })

    resync()
    void connect()

    return () => {
      stopped = true
      clearTimeout(retry)
      void realtime.stop()
    }
  }, [token, meId])

  // --- Amigos ---

  const sendRequest = useCallback(
    async (username: string) => {
      const request = await friendsApi.sendFriendRequest(token, username)
      dispatchFriends({ type: 'requestSent', request })
      return request
    },
    [token],
  )

  const accept = useCallback(
    async (id: string) => {
      const friend = await friendsApi.acceptFriendRequest(token, id)
      dispatchFriends({ type: 'friendAdded', friend })
      dispatchConversations({ type: 'friendship', userId: friend.user.id, canSend: true })
    },
    [token],
  )

  /** Recusa um pedido recebido ou cancela um enviado. */
  const removeRequest = useCallback(
    async (id: string) => {
      await friendsApi.removeFriendRequest(token, id)
      dispatchFriends({ type: 'requestRemoved', id })
    },
    [token],
  )

  // --- Grupos ---

  const createGroup = useCallback(
    async (name: string, memberIds: string[]) => {
      const group = await groupsApi.createGroup(token, name, memberIds)
      dispatchGroups({ type: 'added', group })
      return group
    },
    [token],
  )

  const renameGroup = useCallback(
    async (id: string, name: string) => dispatchGroups({ type: 'updated', group: await groupsApi.renameGroup(token, id, name) }),
    [token],
  )

  const addMembers = useCallback(
    async (id: string, userIds: string[]) => dispatchGroups({ type: 'updated', group: await groupsApi.addMembers(token, id, userIds) }),
    [token],
  )

  /** Sai do grupo (o próprio id) ou, sendo o dono, remove outra pessoa. */
  const removeMember = useCallback(
    async (groupId: string, userId: string, self: boolean) => {
      await groupsApi.removeMember(token, groupId, userId)
      if (self) {
        dispatchGroups({ type: 'removed', groupId })
        dispatchMessages({ type: 'cleared', chatId: groupId })
      } else {
        dispatchGroups({ type: 'updated', group: await groupsApi.getGroup(token, groupId) })
      }
    },
    [token],
  )

  // --- Mensagens ---

  const loadMessages = useCallback(
    async (groupId: string) => {
      const page = await groupsApi.getMessages(token, groupId)
      dispatchMessages({ type: 'loaded', chatId: groupId, messages: page })
    },
    [token],
  )

  const loadOlder = useCallback(
    async (groupId: string, before: string) => {
      const page = await groupsApi.getMessages(token, groupId, before)
      dispatchMessages({ type: 'olderLoaded', chatId: groupId, messages: page })
    },
    [token],
  )

  const sendMessage = useCallback(
    async (groupId: string, text: string, images: File[]) => {
      const message = await groupsApi.sendMessage(token, groupId, text, images)
      dispatchMessages({ type: 'created', chatId: groupId, message })
    },
    [token],
  )

  const deleteMessage = useCallback(
    async (groupId: string, messageId: string) => {
      await groupsApi.deleteMessage(token, groupId, messageId)
      dispatchMessages({ type: 'deleted', chatId: groupId, messageId })
    },
    [token],
  )

  // --- Mensagens diretas ---

  /** Abre (ou cria) a conversa com um amigo e devolve o id dela. */
  const openConversation = useCallback(
    async (userId: string) => {
      const conversation = await dmsApi.open(token, userId)
      dispatchConversations({ type: 'upserted', conversation })
      return conversation.id
    },
    [token],
  )

  /**
   * Avisa qual DM está na tela (null = nenhuma). Zera as não lidas dela; o que chegar enquanto estiver aberta já conta como lido.
   * `lastAt` = data da última mensagem que está na tela.
   */
  const viewDm = useCallback((id: string | null, lastAt: string | null) => {
    openDm.current = id
    if (id) dispatchUnread({ type: 'opened', conversationId: id, at: lastAt })
  }, [])

  const loadDmMessages = useCallback(
    async (id: string) => dispatchDmMessages({ type: 'loaded', chatId: id, messages: await dmsApi.getMessages(token, id) }),
    [token],
  )

  const loadOlderDm = useCallback(
    async (id: string, before: string) =>
      dispatchDmMessages({ type: 'olderLoaded', chatId: id, messages: await dmsApi.getMessages(token, id, before) }),
    [token],
  )

  const sendDm = useCallback(
    async (id: string, text: string, images: File[]) => {
      const message = await dmsApi.sendMessage(token, id, text, images)
      dispatchDmMessages({ type: 'created', chatId: id, message })
      dispatchConversations({ type: 'messageCreated', message })
      dispatchUnread({ type: 'received', message, meId, openId: openDm.current })
    },
    [token, meId],
  )

  const deleteDm = useCallback(
    async (id: string, messageId: string) => {
      await dmsApi.deleteMessage(token, id, messageId)
      dispatchDmMessages({ type: 'deleted', chatId: id, messageId })
      dispatchConversations({ type: 'messageDeleted', conversationId: id, messageId })
    },
    [token],
  )

  /** Carrega quem está na sala de voz do grupo (ao abrir o grupo); depois os eventos mantêm atualizado. */
  const loadVoice = useCallback(
    async (groupId: string) => {
      voiceGroups.current.add(groupId)
      const { userIds } = await groupsApi.getVoice(token, groupId)
      dispatchVoice({ groupId, userIds })
    },
    [token],
  )

  /** Fechou o aviso: some da tela na hora e a API apaga. */
  const dismissMissedCalls = useCallback(() => {
    setMissedCalls([])
    void missedCallsApi.clear(token).catch(() => undefined)
  }, [token])

  return {
    friends, groups, groupsLoaded, messages, voice, loadVoice,
    sendRequest, accept, removeRequest,
    createGroup, renameGroup, addMembers, removeMember,
    loadMessages, loadOlder, sendMessage, deleteMessage,
    missedCalls, dismissMissedCalls,
    conversations, dmMessages, unread, openConversation, viewDm, loadDmMessages, loadOlderDm, sendDm, deleteDm,
  }
}

export type RealtimeData = ReturnType<typeof useRealtime>
