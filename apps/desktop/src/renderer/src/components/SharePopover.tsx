import { useRef, type RefObject } from 'react'
import type { Track } from 'livekit-client'
import type { ScreenAudioChoice } from '../../../preload/bridge'
import { useDismiss } from '../hooks/useDismiss'
import { QUALITY_PRESETS, screenQualitySummary, type QualityPreset } from '../lib/mediaSettings'
import { formatWatchers, screenAudioLabel } from '../lib/screenShare'
import { StopIcon, SwapIcon } from './Icons'
import { VideoTrackView } from './VideoTrackView'

const QUALITIES: QualityPreset[] = ['economia', 'normal', 'alta']

interface Props {
  /** Botão que abre/fecha a caixinha: clicar nele não conta como "clique fora". */
  anchor: RefObject<HTMLElement | null>
  /** Sua tela, para a miniatura ao vivo. */
  track: Track | null
  /** Nome da tela ou janela, como aparece no seletor. */
  sourceName: string | null
  /** Nomes de quem mais está na chamada. */
  watchers: string[]
  quality: QualityPreset
  onQuality(q: QualityPreset): void
  /** Modo de som escolhido no seletor; null se ainda não se sabe. */
  audio: ScreenAudioChoice | null
  /** Existe faixa de som da tela (a captura do som pode ter falhado). */
  audioPublished: boolean
  audioOn: boolean
  onAudio(on: boolean): void
  onSwap(): void
  onStop(): void
  onClose(): void
}

/** Caixinha do botão de tela durante o compartilhamento (mockup, seção 2). Esc ou clique fora fecham. */
export function SharePopover(p: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, p.onClose, [p.anchor])
  const audioDesc = p.audio == null ? '' : p.audio.mode !== 'none' && !p.audioPublished ? 'O som não pôde ser capturado' : screenAudioLabel(p.audio)

  return (
    <div ref={ref} className="share-pop" role="dialog" aria-label="Opções do compartilhamento">
      <div className="sp-head">
        <div className="sp-thumb">{p.track && <VideoTrackView track={p.track} />}</div>
        <div className="sp-info">
          <div className="sp-kicker">● Compartilhando</div>
          <div className="sp-name">{p.sourceName ?? 'Sua tela'}</div>
          <div className="sp-live">{formatWatchers(p.watchers)}</div>
        </div>
      </div>

      <div className="sp-row">
        <div className="sp-row-label">Qualidade<small>{screenQualitySummary(p.quality)}</small></div>
        <div className="seg" role="group" aria-label="Qualidade da tela">
          {QUALITIES.map((q) => (
            <button key={q} type="button" aria-pressed={p.quality === q} onClick={() => p.quality !== q && p.onQuality(q)}
              title={QUALITY_PRESETS[q].description}>
              {QUALITY_PRESETS[q].label}
            </button>
          ))}
        </div>
      </div>

      <div className="sp-row">
        <div className="sp-row-label" id="sp-audio-label">Som da tela<small>{audioDesc}</small></div>
        <button type="button" className="switch" role="switch" aria-labelledby="sp-audio-label"
          aria-checked={p.audioPublished && p.audioOn} disabled={!p.audioPublished} onClick={() => p.onAudio(!p.audioOn)} />
      </div>

      <button type="button" className="sp-btn sp-btn--swap" onClick={p.onSwap}><SwapIcon size={16} /> Trocar tela ou janela</button>
      <button type="button" className="sp-btn sp-btn--stop" onClick={p.onStop}><StopIcon size={16} /> Parar compartilhamento</button>
    </div>
  )
}
