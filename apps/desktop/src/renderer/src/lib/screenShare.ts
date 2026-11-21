import type { ScreenAudioChoice } from '../../../preload/bridge'
import { appLabel } from './screenAudioPrefs'

/** Textos e regras pequenas da caixinha do compartilhamento (CallView). */

/**
 * Quem pode ver a sua tela. Todo mundo na chamada recebe a transmissão (a inscrição no LiveKit é automática);
 * o LiveKit não conta para quem publica quem está com ela aberta, então o texto fala de quem "pode ver".
 */
export function formatWatchers(names: readonly string[]): string {
  if (names.length === 0) return 'Ninguém mais na chamada ainda'
  if (names.length === 1) return `${names[0]} pode ver`
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]} podem ver`
  return `${names.slice(0, 2).join(', ')} e mais ${names.length - 2} podem ver`
}

/** Modo de som escolhido no seletor, em palavras ("Todo o áudio, menos o Resenha"). */
export function screenAudioLabel(choice: ScreenAudioChoice): string {
  if (choice.mode === 'none') return 'Sem áudio. Escolha em "Trocar tela ou janela".'
  if (choice.mode === 'all') return 'Todo o áudio do PC'
  const names = [...(choice.resenha ? ['o Resenha'] : []), ...choice.exes.map(appLabel)]
  const shown = names.length > 3 ? [...names.slice(0, 2), `mais ${names.length - 2}`] : names
  const list = shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(', ')} e ${shown[shown.length - 1]}`
  return `Todo o áudio, menos ${list}`
}

/** Mesmo modo de som (e, no "menos", a mesma lista): trocar a tela não precisa mexer no áudio. */
export function sameAudioChoice(a: ScreenAudioChoice, b: ScreenAudioChoice): boolean {
  if (a.mode !== b.mode) return false
  if (a.mode !== 'except' || b.mode !== 'except') return true
  const norm = (exes: string[]) => exes.map((e) => e.toLowerCase()).sort().join('|')
  return a.resenha === b.resenha && norm(a.exes) === norm(b.exes)
}
