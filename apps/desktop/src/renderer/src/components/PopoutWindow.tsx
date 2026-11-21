import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { RemoteVideoTrack, type ElementInfo, type Track } from 'livekit-client'
import { popoutName } from '../../../main/popoutName'

let opened = 0

/**
 * Janela separada da transmissão. A janela principal abre um about:blank (o main deixa só esse, ver main/popout.ts),
 * copia os estilos para lá e desenha o conteúdo com um portal do React. Assim o vídeo é a mesma faixa que já chega
 * aqui (sem conectar de novo no LiveKit), o volume e os botões são o mesmo estado do app e a outra janela não roda
 * código próprio nem tem preload. Fechar a janela (X do Windows) chama `onClose`; desmontar o componente fecha a janela.
 */
export function PopoutWindow({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const winRef = useRef<Window | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const win = window.open('about:blank', popoutName(++opened))
    if (!win) {
      onCloseRef.current()
      return
    }
    winRef.current = win
    const doc = win.document
    doc.documentElement.lang = 'pt-BR'
    // Os mesmos estilos do app: <style> (no npm run dev) e <link> (no app empacotado, com o endereço completo).
    for (const node of document.head.querySelectorAll<HTMLElement>('style, link[rel="stylesheet"]')) {
      const copy = doc.importNode(node, true)
      if (node instanceof HTMLLinkElement) copy.setAttribute('href', node.href)
      doc.head.appendChild(copy)
    }
    doc.body.className = 'popout-body'
    const root = doc.createElement('div')
    root.className = 'popout-root'
    doc.body.appendChild(root)
    setContainer(root)

    const closed = () => onCloseRef.current()
    win.addEventListener('pagehide', closed)
    return () => {
      win.removeEventListener('pagehide', closed)
      winRef.current = null
      setContainer(null)
      win.close()
    }
  }, [])

  useEffect(() => {
    if (container) container.ownerDocument.title = title
  }, [container, title])

  return container ? createPortal(children, container) : null
}

/**
 * Vídeo dentro da janela separada. Não usa track.attach(): o LiveKit mede se o vídeo está visível e de que tamanho
 * com observadores da janela principal, que não enxergam outra janela, e acharia que ninguém está vendo (pausaria
 * a transmissão ou mandaria a camada menor). Aqui o próprio app informa o tamanho e a visibilidade da janela
 * separada pelo ElementInfo, a forma que o livekit-client exporta para elementos fora do documento dele.
 */
export function PopoutVideo({ track }: { track: Track }) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = ref.current
    const win = el?.ownerDocument.defaultView
    if (!el || !win) return
    el.srcObject = new MediaStream([track.mediaStreamTrack])
    const info = track instanceof RemoteVideoTrack ? windowElementInfo(el, win) : null
    if (info && track instanceof RemoteVideoTrack) track.observeElementInfo(info)
    return () => {
      if (info && track instanceof RemoteVideoTrack) track.stopObservingElementInfo(info)
      el.srcObject = null
    }
  }, [track])

  return <video ref={ref} autoPlay playsInline muted className="video-track" />
}

/** Tamanho do vídeo e visibilidade da janela dele (minimizada ou coberta = escondida), para o adaptive stream. */
function windowElementInfo(el: HTMLVideoElement, win: Window): ElementInfo {
  const isVisible = () => win.document.visibilityState === 'visible'
  const info: ElementInfo = {
    element: el,
    width: () => el.clientWidth,
    height: () => el.clientHeight,
    visible: isVisible(),
    pictureInPicture: false,
    visibilityChangedAt: 0,
    observe() {
      win.addEventListener('resize', onResize)
      win.document.addEventListener('visibilitychange', onVisibility)
    },
    stopObserving() {
      win.removeEventListener('resize', onResize)
      win.document.removeEventListener('visibilitychange', onVisibility)
    },
  }
  const onResize = () => info.handleResize?.()
  const onVisibility = () => {
    info.visible = isVisible()
    info.visibilityChangedAt = Date.now()
    info.handleVisibilityChanged?.()
  }
  return info
}
