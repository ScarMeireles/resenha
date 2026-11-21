import { useEffect, useRef, type RefObject } from 'react'

/**
 * Fecha uma caixinha (popover, menu) com Esc ou com clique fora dela. `ignore` são elementos que não contam como
 * "fora" (ex.: o botão que abre e fecha a caixinha, que cuida do próprio clique).
 */
export function useDismiss(box: RefObject<HTMLElement | null>, onClose: () => void, ignore: Array<RefObject<HTMLElement | null>> = []) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const ignoreRef = useRef(ignore)
  ignoreRef.current = ignore

  useEffect(() => {
    const doc = box.current?.ownerDocument ?? document
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onCloseRef.current()
    }
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (box.current?.contains(target)) return
      if (ignoreRef.current.some((r) => r.current?.contains(target))) return
      onCloseRef.current()
    }
    doc.addEventListener('keydown', onKey)
    doc.addEventListener('mousedown', onDown)
    return () => {
      doc.removeEventListener('keydown', onKey)
      doc.removeEventListener('mousedown', onDown)
    }
  }, [box])
}
