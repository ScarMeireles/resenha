import { useEffect, useRef, useState } from 'react'
import type { Track } from 'livekit-client'
import { useFullscreen } from '../hooks/useFullscreen'
import { fromPercent, toPercent, type PersonVolume } from '../lib/volumePrefs'
import {
  FullscreenExitIcon, FullscreenIcon, PinIcon, PopinIcon, PopoutIcon, SpeakerIcon, VolumeMuteIcon,
} from './Icons'
import { PopoutVideo } from './PopoutWindow'
import { VideoTrackView } from './VideoTrackView'
import './Watch.css'

/** Sem mexer o mouse por este tempo, a barra e o cursor somem (importante na tela cheia, onde o mouse está sempre "em cima"). */
const IDLE_MS = 2500

interface Props {
  track: Track
  /** Etiqueta no canto ("Tela de Ana · 1080p"); a janela separada não mostra (o título dela já diz). */
  label?: string
  /** Na janela separada o vídeo vai pelo PopoutVideo (ver o comentário dele). */
  inPopout: boolean
  /** Volume do som da transmissão dessa pessoa, só para você. */
  volume: PersonVolume
  /** A pessoa está mandando som junto com a tela. */
  hasAudio: boolean
  onVolume(patch: Partial<PersonVolume>): void
  /** Abre a janela separada (no palco) ou volta para o app (na janela separada). */
  onPopToggle(): void
  /** Alfinete "sempre por cima", só na janela separada. */
  pinned?: boolean
  onPin?(): void
}

/** Tela de um amigo com a barra de controles que aparece ao passar o mouse: volume, AO VIVO, janela separada e tela cheia. */
export function Watch({ track, label, inPopout, volume, hasAudio, onVolume, onPopToggle, pinned = false, onPin }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [fullscreen, toggleFullscreen] = useFullscreen(ref)
  const [idle, setIdle] = useState(false)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const wake = () => {
    setIdle(false)
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS)
  }
  useEffect(() => () => clearTimeout(idleTimer.current), [])

  const silent = volume.muted || volume.volume === 0
  const shown = silent ? 0 : toPercent(volume.volume)
  const audioHint = hasAudio ? undefined : 'Esta transmissão está sem som'

  return (
    <div ref={ref} className={`watch${idle ? ' watch--idle' : ''}`} onMouseMove={wake} onMouseLeave={() => setIdle(false)}>
      {inPopout ? <PopoutVideo track={track} /> : <VideoTrackView track={track} />}
      {label && <span className="call-stage-label">{label}</span>}
      <div className="watch-bar">
        <div className="vol" title={audioHint}>
          <button type="button" className="wb-btn" disabled={!hasAudio}
            onClick={() => onVolume(silent ? { muted: false, ...(volume.volume === 0 ? { volume: 1 } : {}) } : { muted: true })}
            aria-label={silent ? 'Ligar o som da transmissão' : 'Silenciar a transmissão'}>
            {silent ? <VolumeMuteIcon size={18} /> : <SpeakerIcon size={18} />}
          </button>
          <input type="range" min={0} max={200} step={5} value={shown} disabled={!hasAudio}
            onChange={(e) => onVolume({ volume: fromPercent(Number(e.target.value)), muted: false })}
            aria-label="Volume da transmissão" aria-valuetext={`${shown}%`} />
          <span className="vol-val">{shown}%</span>
        </div>
        <span className="wb-live">AO VIVO</span>
        <span className="wb-spacer" />
        {onPin && (
          <button type="button" className={`wb-btn${pinned ? ' wb-btn--on' : ''}`} onClick={onPin} aria-pressed={pinned}
            aria-label="Sempre por cima" title={pinned ? 'Sempre por cima (ligado)' : 'Sempre por cima'}>
            <PinIcon size={18} />
          </button>
        )}
        <button type="button" className="wb-btn" onClick={onPopToggle}
          aria-label={inPopout ? 'Voltar para o app' : 'Abrir em janela separada'} title={inPopout ? 'Voltar para o app' : 'Abrir em janela separada'}>
          {inPopout ? <PopinIcon size={18} /> : <PopoutIcon size={18} />}
        </button>
        <button type="button" className="wb-btn" onClick={toggleFullscreen}
          aria-label={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'} title={fullscreen ? 'Sair da tela cheia (Esc)' : 'Tela cheia'}>
          {fullscreen ? <FullscreenExitIcon size={18} /> : <FullscreenIcon size={18} />}
        </button>
      </div>
    </div>
  )
}
