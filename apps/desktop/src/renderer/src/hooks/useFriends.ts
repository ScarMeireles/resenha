import { useCallback, useEffect, useReducer } from 'react'
import { emptyFriends, friendsApi, friendsReducer } from '../lib/friends'
import { createRealtime } from '../lib/realtime'

const RETRY_MS = 5000

/**
 * Estado dos amigos: carrega pela API e se mantém atualizado pelo SignalR.
 * Liga quando há token (logado) e desliga ao sair (o componente desmonta).
 */
export function useFriends(token: string) {
  const [state, dispatch] = useReducer(friendsReducer, emptyFriends)

  useEffect(() => {
    let stopped = false
    let retry: ReturnType<typeof setTimeout> | undefined

    const reload = () =>
      friendsApi.getFriends(token).then(
        (data) => !stopped && dispatch({ type: 'loaded', data }),
        () => undefined, // sem rede: o próximo resync (reconexão) tenta de novo
      )

    const realtime = createRealtime(token, {
      friendRequestReceived: (request) => dispatch({ type: 'requestReceived', request }),
      friendAdded: (friend) => dispatch({ type: 'friendAdded', friend }),
      friendRequestRemoved: ({ requestId }) => dispatch({ type: 'requestRemoved', id: requestId }),
      friendRemoved: ({ userId }) => dispatch({ type: 'friendRemoved', userId }),
      presenceChanged: ({ userId, presence }) => dispatch({ type: 'presenceChanged', userId, presence }),
      resync: () => void reload(),
    })

    // A conexão inicial não tenta de novo sozinha; repetimos até conseguir ou sair.
    const connect = () =>
      realtime.start().catch(() => {
        if (!stopped) retry = setTimeout(connect, RETRY_MS)
      })

    void reload()
    void connect()

    return () => {
      stopped = true
      clearTimeout(retry)
      void realtime.stop()
    }
  }, [token])

  const sendRequest = useCallback(
    async (username: string) => {
      const request = await friendsApi.sendFriendRequest(token, username)
      dispatch({ type: 'requestSent', request })
      return request
    },
    [token],
  )

  const accept = useCallback(
    async (id: string) => {
      const friend = await friendsApi.acceptFriendRequest(token, id)
      dispatch({ type: 'friendAdded', friend })
    },
    [token],
  )

  /** Recusa um pedido recebido ou cancela um enviado. */
  const removeRequest = useCallback(
    async (id: string) => {
      await friendsApi.removeFriendRequest(token, id)
      dispatch({ type: 'requestRemoved', id })
    },
    [token],
  )

  return { state, sendRequest, accept, removeRequest }
}
