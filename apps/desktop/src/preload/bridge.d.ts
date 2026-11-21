import type { ScreenAudioChoice, ScreenChoice } from '../main/screenChoice'
import type { UpdateOutcome, UpdateProgress, UpdateReason } from '../main/updateRules'

export type { ScreenAudioChoice, ScreenChoice, UpdateOutcome, UpdateProgress, UpdateReason }

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
    choose(choice: ScreenChoice): Promise<void>
  }
  /** Áudio da tela no modo "todo o áudio, menos...", capturado pelo ajudante resenha-audio.exe. */
  screenAudio: {
    /** Executáveis com som aberto agora (sem o Resenha), ex.: ["discord.exe", "spotify.exe"]. */
    listApps(): Promise<string[]>
    /** Começa a captura; resolve quando o primeiro som chega e rejeita se o ajudante falhar. */
    start(request: { resenha: boolean; exes: string[] }): Promise<void>
    stop(): Promise<void>
    /** PCM float 32 bits, estéreo intercalado, 48 kHz. Devolve a função que cancela a assinatura. */
    onData(listener: (pcm: Uint8Array) => void): () => void
    /** O ajudante parou sozinho (erro ou aparelho de som sumiu). */
    onEnded(listener: () => void): () => void
  }
  /** Atualização obrigatória (R13): baixa e instala sozinho a versão nova publicada no servidor. */
  updates: {
    /** Confere e, se houver versão nova, baixa e reinicia o app instalado. Em desenvolvimento não atualiza. */
    run(reason: UpdateReason): Promise<UpdateOutcome>
    /** Progresso do download. Devolve a função que cancela a assinatura. */
    onProgress(listener: (progress: UpdateProgress) => void): () => void
  }
}

declare global {
  interface Window {
    resenha: ResenhaBridge
  }
}
