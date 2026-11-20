import { useEffect, useRef } from 'react'
import type { Track } from 'livekit-client'

/** Mostra um vídeo do LiveKit; `mirror` espelha (usado na sua própria câmera). */
export function VideoTrackView({ track, mirror = false }: { track: Track; mirror?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    track.attach(el)
    return () => {
      track.detach(el)
    }
  }, [track])
  return <video ref={ref} autoPlay playsInline muted className={`video-track${mirror ? ' video-track--mirror' : ''}`} />
}
