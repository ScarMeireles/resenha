/**
 * Áudio que vai junto com a tela:
 * - `none`: só a imagem;
 * - `all`: todo o som do PC (captura "loopback" do próprio Electron; inclui o som do Resenha);
 * - `except`: todo o som menos o do Resenha (se `resenha` for true) e o dos executáveis listados,
 *   capturado pelo ajudante resenha-audio.exe.
 */
export type ScreenAudioChoice =
  | { mode: 'none' }
  | { mode: 'all' }
  | { mode: 'except'; resenha: boolean; exes: string[] }

/** Escolha de tela/janela feita no seletor, guardada por pouco tempo até o Chromium pedir a captura. */
export interface ScreenChoice {
  sourceId: string
  audio: ScreenAudioChoice
}

/** Tempo máximo entre escolher no seletor e o pedido de captura chegar; passou disso, a escolha vale nada. */
export const CHOICE_TTL_MS = 15_000

/** Máximo de apps na lista "menos estes". Cada um pode virar uma captura no ajudante. */
export const MAX_EXCLUDED_APPS = 20

/** Nome de executável como o Windows mostra ("discord.exe"); sem barra, para não virar caminho nem argumento. */
const EXE_NAME = /^[\w .()&+-]{1,100}\.exe$/i

export function isValidExe(value: unknown): value is string {
  return typeof value === 'string' && EXE_NAME.test(value) && !value.startsWith('-')
}

export function isValidAudioChoice(value: unknown): value is ScreenAudioChoice {
  if (typeof value !== 'object' || value === null) return false
  const { mode, resenha, exes } = value as Record<string, unknown>
  if (mode === 'none' || mode === 'all') return true
  if (mode !== 'except' || typeof resenha !== 'boolean' || !Array.isArray(exes)) return false
  if (exes.length > MAX_EXCLUDED_APPS || !exes.every(isValidExe)) return false
  // Sem o Resenha e sem apps, "menos" não tira nada: isso é o modo `all`.
  return resenha || exes.length > 0
}

export function isValidChoice(value: unknown): value is ScreenChoice {
  if (typeof value !== 'object' || value === null) return false
  const { sourceId, audio } = value as Record<string, unknown>
  return typeof sourceId === 'string' && sourceId.length > 0 && sourceId.length <= 200 && isValidAudioChoice(audio)
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
