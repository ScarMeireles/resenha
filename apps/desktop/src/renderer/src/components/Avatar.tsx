import type { CSSProperties } from 'react'
import { initialsOf, colorFor } from '../lib/avatar'
import './Avatar.css'

export type Presence = 'online' | 'call' | 'offline'

interface Props {
  name: string
  /** Usado para escolher sempre a mesma cor para a mesma pessoa. */
  seed: string
  src?: string | null
  size?: number
  presence?: Presence
  /** Cor do fundo atrás do avatar, para a "borda" do indicador de status. */
  ringColor?: string
}

export function Avatar({ name, seed, src, size = 36, presence, ringColor = 'var(--bg-sidebar)' }: Props) {
  const { bg, fg } = colorFor(seed)
  const style = { '--size': `${size}px`, '--ring': ringColor, background: src ? 'var(--bg-input)' : bg, color: fg } as CSSProperties

  return (
    <span className="avatar" style={style}>
      {src ? <img src={src} alt="" draggable={false} /> : <span aria-hidden="true">{initialsOf(name)}</span>}
      {presence && <span className={`avatar-presence avatar-presence--${presence}`} />}
    </span>
  )
}
