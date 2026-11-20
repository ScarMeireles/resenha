import type { ScreenSource } from '../../../preload/bridge'

export type ScreenTab = 'screen' | 'window'

/** Fontes da aba escolhida (telas inteiras ou janelas). */
export function filterSources(sources: ScreenSource[], tab: ScreenTab): ScreenSource[] {
  return sources.filter((s) => s.kind === tab)
}
