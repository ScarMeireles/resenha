/** Escolha de tela/janela feita no seletor, guardada por pouco tempo até o Chromium pedir a captura. */
export interface ScreenChoice {
  sourceId: string
  audio: boolean
}

/** Tempo máximo entre escolher no seletor e o pedido de captura chegar; passou disso, a escolha vale nada. */
export const CHOICE_TTL_MS = 15_000

export function isValidChoice(value: unknown): value is ScreenChoice {
  if (typeof value !== 'object' || value === null) return false
  const { sourceId, audio } = value as Record<string, unknown>
  return typeof sourceId === 'string' && sourceId.length > 0 && sourceId.length <= 200 && typeof audio === 'boolean'
}

/** Guarda uma escolha de uso único: `take` devolve e apaga, e devolve null se não há ou se expirou. */
export function createChoiceStore(now: () => number = () => Date.now()) {
  let current: { choice: ScreenChoice; at: number } | null = null
  return {
    set(choice: ScreenChoice): void {
      current = { choice, at: now() }
    },
    take(): ScreenChoice | null {
      const entry = current
      current = null
      if (!entry || now() - entry.at > CHOICE_TTL_MS) return null
      return entry.choice
    },
  }
}
