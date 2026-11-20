/** O que o preload expõe em `window.resenha` para a tela. */
export interface ResenhaBridge {
  session: {
    /** Token salvo do último login, ou null. */
    load(): Promise<string | null>
    save(token: string): Promise<void>
    clear(): Promise<void>
  }
}

declare global {
  interface Window {
    resenha: ResenhaBridge
  }
}
