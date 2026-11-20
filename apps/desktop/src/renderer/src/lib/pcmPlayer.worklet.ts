import { PcmQueue } from './pcmQueue'

// Roda na thread de áudio do Web Audio (AudioWorkletGlobalScope). Recebe PCM pelo `port` e toca
// estéreo. A saída vai para um MediaStreamAudioDestinationNode, que vira a faixa publicada no LiveKit.

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort
  abstract process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void

class PcmPlayer extends AudioWorkletProcessor {
  private readonly queue = new PcmQueue()

  constructor() {
    super()
    this.port.onmessage = (e: MessageEvent<ArrayBuffer>) => this.queue.write(new Float32Array(e.data))
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const [left, right] = outputs[0]
    if (left && right) this.queue.read(left, right)
    return true
  }
}

registerProcessor('resenha-pcm-player', PcmPlayer)
