import { useCallback, useEffect, useState, type RefObject } from 'react'

/**
 * Tela cheia de um elemento pela Fullscreen API (Esc sai, pelo próprio navegador). Funciona também na janela
 * separada, porque usa o documento do próprio elemento.
 */
export function useFullscreen(ref: RefObject<HTMLElement | null>): [boolean, () => void] {
  const [active, setActive] = useState(false)

  useEffect(() => {
    const doc = ref.current?.ownerDocument
    if (!doc) return
    const sync = () => setActive(doc.fullscreenElement != null && doc.fullscreenElement === ref.current)
    doc.addEventListener('fullscreenchange', sync)
    return () => doc.removeEventListener('fullscreenchange', sync)
  }, [ref])

  const toggle = useCallback(() => {
    const el = ref.current
    if (!el) return
    if (el.ownerDocument.fullscreenElement) void el.ownerDocument.exitFullscreen().catch(() => undefined)
    else void el.requestFullscreen().catch(() => undefined)
  }, [ref])

  return [active, toggle]
}
