/** Tela ou janela que dá para compartilhar; `thumbnail` é uma data URL. */
export interface ScreenSource {
  id: string
  name: string
  kind: 'screen' | 'window'
  thumbnail: string
}

/** O que o preload expõe em `window.resenha` para a tela. */
export interface ResenhaBridge {
  session: {
    /** Token salvo do último login, ou null. */
    load(): Promise<string | null>
    save(token: string): Promise<void>
    clear(): Promise<void>
  }
  screen: {
    /** Telas e janelas disponíveis (sem a do próprio Resenha). */
    listSources(): Promise<ScreenSource[]>
    /** Guarda a escolha; vale só para o próximo pedido de captura. */
    choose(choice: { sourceId: string; audio: boolean }): Promise<void>
  }
}

declare global {
  interface Window {
    resenha: ResenhaBridge
  }
}
