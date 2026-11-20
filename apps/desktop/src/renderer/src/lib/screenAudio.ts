import workletUrl from './pcmPlayer.worklet.ts?worker&url'

/** Faixa de áudio da tela montada a partir do PCM do ajudante. `stop` para o ajudante e libera o áudio. */
export interface HelperAudio {
  track: MediaStreamTrack
  stop(): void
}

/**
 * Liga o ajudante ("todo o áudio, menos...") e transforma o PCM dele numa MediaStreamTrack:
 * IPC → AudioWorklet (fila contra variação de tempo) → MediaStreamAudioDestinationNode → faixa.
 * O AudioContext roda a 48 kHz, a mesma taxa do ajudante e do Opus, então não há reamostragem no caminho.
 * `onEnded` é chamado se o ajudante parar sozinho.
 */
export async function startHelperAudio(request: { resenha: boolean; exes: string[] }, onEnded: () => void): Promise<HelperAudio> {
  const context = new AudioContext({ sampleRate: 48_000, latencyHint: 'interactive' })
  const unsubscribe: Array<() => void> = []
  let stopped = false

  const stop = () => {
    if (stopped) return
    stopped = true
    for (const off of unsubscribe) off()
    void window.resenha.screenAudio.stop()
    void context.close()
  }

  try {
    await context.audioWorklet.addModule(workletUrl)
    const player = new AudioWorkletNode(context, 'resenha-pcm-player', { numberOfInputs: 0, outputChannelCount: [2] })
    const destination = context.createMediaStreamDestination()
    destination.channelCount = 2
    player.connect(destination)

    unsubscribe.push(window.resenha.screenAudio.onData((pcm) => {
      // Copia para um ArrayBuffer próprio, alinhado em 4 bytes, e transfere sem cópia para o worklet.
      const buffer = pcm.slice().buffer
      player.port.postMessage(buffer, [buffer])
    }))
    unsubscribe.push(window.resenha.screenAudio.onEnded(() => {
      stop()
      onEnded()
    }))

    await window.resenha.screenAudio.start(request)
    const track = destination.stream.getAudioTracks()[0]
    return { track, stop }
  } catch (error) {
    stop()
    throw error
  }
}
