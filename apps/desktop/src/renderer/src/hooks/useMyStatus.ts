import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { statusApi, type ChosenStatus } from '../lib/presence'

/** Status escolhido por mim (Online, Ausente ou Offline/invisível), salvo na API. */
export function useMyStatus(token: string) {
  const [status, setLocal] = useState<ChosenStatus>('online')
  const statusRef = useRef(status)
  statusRef.current = status

  useEffect(() => {
    let stopped = false
    statusApi.get(token).then((r) => !stopped && setLocal(r.status), () => undefined)
    return () => {
      stopped = true
    }
  }, [token])

  /** Troca na hora e volta ao anterior se a API recusar. */
  const setStatus = useCallback(
    async (next: ChosenStatus) => {
      const previous = statusRef.current
      setLocal(next)
      try {
        await statusApi.set(token, next)
      } catch {
        setLocal(previous)
      }
    },
    [token],
  )

  return { status, setStatus }
}

export type MyStatus = ReturnType<typeof useMyStatus>

export const MyStatusContext = createContext<MyStatus | null>(null)

export function useMyStatusContext(): MyStatus {
  const value = useContext(MyStatusContext)
  if (!value) throw new Error('useMyStatusContext fora do MyStatusContext.Provider')
  return value
}
