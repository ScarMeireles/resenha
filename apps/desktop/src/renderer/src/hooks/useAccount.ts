import { createContext, useContext } from 'react'
import type { User } from '../lib/api'

/** Minha conta para quem edita o perfil: o token das chamadas e como avisar o app que meus dados mudaram. */
export interface Account {
  token: string
  /** Troca meus dados na tela. Com `newToken` (troca de @), também guarda o token novo na sessão salva. */
  update(user: User, newToken?: string): Promise<void>
}

export const AccountContext = createContext<Account | null>(null)

export function useAccount(): Account {
  const value = useContext(AccountContext)
  if (!value) throw new Error('useAccount fora do AccountContext.Provider')
  return value
}
