import type { ScreenAudioChoice } from '../../../preload/bridge'

/** O que o seletor de tela lembra da última vez: o modo de áudio e o que estava marcado em "menos". */
export interface ScreenAudioPrefs {
  mode: 'none' | 'all' | 'except'
  /** Tirar o som do próprio Resenha (vem marcado: sem isso, quem está na chamada ouve a própria voz de volta). */
  resenha: boolean
  exes: string[]
}

export const SCREEN_AUDIO_KEY = 'resenha.screenAudio'
export const DEFAULT_SCREEN_AUDIO: ScreenAudioPrefs = { mode: 'none', resenha: true, exes: [] }

const EXE = /^[\w .()&+-]{1,100}\.exe$/i

export function loadScreenAudioPrefs(storage: Pick<Storage, 'getItem'>): ScreenAudioPrefs {
  try {
    const raw: unknown = JSON.parse(storage.getItem(SCREEN_AUDIO_KEY) ?? 'null')
    if (typeof raw !== 'object' || raw === null) return DEFAULT_SCREEN_AUDIO
    const o = raw as Record<string, unknown>
    const mode = o.mode === 'all' || o.mode === 'except' ? o.mode : 'none'
    const exes = Array.isArray(o.exes) ? o.exes.filter((e): e is string => typeof e === 'string' && EXE.test(e)).slice(0, 20) : []
    return { mode, resenha: typeof o.resenha === 'boolean' ? o.resenha : true, exes }
  } catch {
    return DEFAULT_SCREEN_AUDIO
  }
}

export function saveScreenAudioPrefs(storage: Pick<Storage, 'setItem'>, prefs: ScreenAudioPrefs): void {
  try {
    storage.setItem(SCREEN_AUDIO_KEY, JSON.stringify(prefs))
  } catch {
    // Sem storage (modo privado, cota): só não lembra na próxima vez.
  }
}

/** "Menos" sem nada marcado não tira som nenhum, então vira "todo o áudio". */
export function toAudioChoice(prefs: ScreenAudioPrefs): ScreenAudioChoice {
  if (prefs.mode === 'except' && (prefs.resenha || prefs.exes.length > 0)) return { mode: 'except', resenha: prefs.resenha, exes: prefs.exes }
  if (prefs.mode === 'none') return { mode: 'none' }
  return { mode: 'all' }
}

/** Apps para a lista: os que estão com som aberto agora e os que você marcou antes, sem repetir. */
export function audioAppList(playing: readonly string[], checked: readonly string[]): string[] {
  const seen = new Map<string, string>()
  for (const exe of [...checked, ...playing]) if (!seen.has(exe.toLowerCase())) seen.set(exe.toLowerCase(), exe)
  return [...seen.values()].sort((a, b) => appLabel(a).localeCompare(appLabel(b), 'pt-BR'))
}

/** "nvidia broadcast.exe" → "Nvidia broadcast". */
export function appLabel(exe: string): string {
  const name = exe.replace(/\.exe$/i, '')
  return name.charAt(0).toUpperCase() + name.slice(1)
}
