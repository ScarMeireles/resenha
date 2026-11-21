import { normalizeUsername, validateUsername } from './accountRules'
import type { Availability } from './usernameAvailability'

/** O que o cartão de perfil mostra embaixo do campo do @ enquanto a pessoa digita. */
export type HandleStatus =
  | { kind: 'current' } // é o @ que ela já tem
  | { kind: 'invalid'; message: string }
  | { kind: 'checking' }
  | { kind: 'available' }
  | { kind: 'taken' }

/**
 * Junta a regra local do @ com a consulta da API. A rota /auth/username-available diz "em uso" para o
 * próprio @ atual (ele está mesmo em uso, por mim), então esse caso é resolvido aqui antes de consultar.
 */
export function handleStatus(input: string, currentUsername: string, availability: Availability): HandleStatus {
  if (normalizeUsername(input) === currentUsername) return { kind: 'current' }
  const error = validateUsername(input)
  if (error) return { kind: 'invalid', message: error }
  switch (availability.kind) {
    case 'idle':
      return { kind: 'checking' }
    case 'invalid':
      return { kind: 'invalid', message: availability.message }
    default:
      return availability
  }
}

/** Só a consulta à API precisa rodar quando o @ digitado é válido e diferente do atual. */
export const needsAvailabilityCheck = (input: string, currentUsername: string): boolean =>
  normalizeUsername(input) !== currentUsername && validateUsername(input) === null

export const canSaveHandle = (status: HandleStatus): boolean => status.kind === 'available'
