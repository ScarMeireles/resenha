import { ApiError } from './api'
import { checkUsername, type UsernameCheck } from './friends'

export const DEBOUNCE_MS = 400

export type Availability =
  | { kind: 'idle' }
  | { kind: 'available' }
  | { kind: 'taken' }
  | { kind: 'invalid'; message: string }

/** Converte a resposta da API no que a tela mostra. */
export function toAvailability(check: UsernameCheck): Availability {
  if (check.available) return { kind: 'available' }
  return check.error ? { kind: 'invalid', message: check.error } : { kind: 'taken' }
}

/**
 * Espera 400 ms sem digitar e então consulta o @. Uma nova digitação cancela a consulta anterior.
 * Campo vazio, 429 e erro de rede não mostram nada. Devolve a função que cancela tudo.
 */
export function scheduleUsernameCheck(
  username: string,
  onResult: (result: Availability) => void,
  check: typeof checkUsername = checkUsername,
): () => void {
  onResult({ kind: 'idle' })
  if (username.trim() === '') return () => undefined

  const controller = new AbortController()
  const timer = setTimeout(async () => {
    try {
      const result = await check(username, controller.signal)
      if (!controller.signal.aborted) onResult(toAvailability(result))
    } catch (error) {
      // 429, rede fora ou consulta cancelada: fica sem indicação.
      if (!(error instanceof ApiError) && !controller.signal.aborted) throw error
    }
  }, DEBOUNCE_MS)

  return () => {
    clearTimeout(timer)
    controller.abort()
  }
}
