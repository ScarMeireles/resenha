import { useLayoutEffect, useRef, useState } from 'react'
import { useDismiss } from '../hooks/useDismiss'
import { fromPercent, toPercent, type PersonVolume } from '../lib/volumePrefs'

interface Props {
  name: string
  /** Onde o botão direito foi clicado (coordenadas da janela). */
  x: number
  y: number
  volume: PersonVolume
  onVolume(patch: Partial<PersonVolume>): void
  onClose(): void
}

/** Menu do botão direito no card de alguém da chamada: volume da voz (0 a 200%) e "Silenciar para mim". */
export function VoiceMenu({ name, x, y, volume, onVolume, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, onClose)
  // Não deixa o menu sair da janela quando o clique foi perto da borda.
  const [pos, setPos] = useState({ left: x, top: y })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { innerWidth, innerHeight } = el.ownerDocument.defaultView ?? window
    setPos({ left: Math.max(8, Math.min(x, innerWidth - el.offsetWidth - 8)), top: Math.max(8, Math.min(y, innerHeight - el.offsetHeight - 8)) })
  }, [x, y])

  const shown = toPercent(volume.volume)
  return (
    <div ref={ref} className="voice-menu" role="menu" aria-label={`Áudio de ${name}`} style={pos}>
      <div className="voice-menu-title">{name}</div>
      <label className="voice-menu-row">
        <span className="voice-menu-label">Volume da voz <span className="vol-val">{shown}%</span></span>
        <input type="range" min={0} max={200} step={5} value={shown} disabled={volume.muted}
          onChange={(e) => onVolume({ volume: fromPercent(Number(e.target.value)) })}
          aria-label={`Volume da voz de ${name}`} aria-valuetext={`${shown}%`} />
      </label>
      <label className="voice-menu-check">
        <input type="checkbox" checked={volume.muted} onChange={(e) => onVolume({ muted: e.target.checked })} />
        Silenciar para mim
      </label>
    </div>
  )
}
