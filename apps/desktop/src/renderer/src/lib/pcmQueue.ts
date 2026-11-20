/**
 * Fila de áudio do worklet que toca o som do ajudante: entra PCM estéreo intercalado [E, D, E, D...]
 * em pedaços de ~10 ms pelo IPC e sai em blocos de 128 quadros, que é o que o Web Audio pede.
 *
 * Os pedaços do IPC não chegam em ritmo perfeito. A fila só começa a tocar com `primeFrames` guardados
 * (40 ms) e, se esvaziar, toca silêncio e espera encher de novo. Isso troca um pouco de atraso por som
 * sem estalos. Acima de `maxFrames` (200 ms) descarta o mais antigo e volta ao atraso inicial, para o
 * atraso não crescer se os dois relógios (o do ajudante e o do Web Audio) andarem em ritmos diferentes.
 */
export class PcmQueue {
  private readonly ring: Float32Array
  private start = 0
  private frames = 0
  private primed = false

  constructor(
    readonly primeFrames = 1920,
    readonly maxFrames = 9600,
  ) {
    this.ring = new Float32Array(maxFrames * 2)
  }

  get size(): number {
    return this.frames
  }

  write(interleaved: Float32Array): void {
    let input = interleaved.subarray(0, interleaved.length - (interleaved.length % 2))
    if (input.length / 2 >= this.maxFrames) {
      input = input.subarray(input.length - this.maxFrames * 2)
      this.start = 0
      this.frames = 0
    }
    const incoming = input.length / 2
    const overflow = this.frames + incoming - this.maxFrames
    if (overflow > 0) {
      const drop = Math.min(this.frames, Math.max(overflow, this.frames - this.primeFrames))
      this.start = (this.start + drop) % this.maxFrames
      this.frames -= drop
    }
    for (let i = 0; i < incoming; i++) {
      const at = ((this.start + this.frames + i) % this.maxFrames) * 2
      this.ring[at] = input[i * 2]
      this.ring[at + 1] = input[i * 2 + 1]
    }
    this.frames += incoming
  }

  /** Preenche os dois canais; o que faltar vira silêncio. */
  read(left: Float32Array, right: Float32Array): void {
    const wanted = left.length
    if (!this.primed && this.frames >= this.primeFrames) this.primed = true
    const n = this.primed ? Math.min(wanted, this.frames) : 0
    for (let i = 0; i < n; i++) {
      const at = ((this.start + i) % this.maxFrames) * 2
      left[i] = this.ring[at]
      right[i] = this.ring[at + 1]
    }
    left.fill(0, n)
    right.fill(0, n)
    this.start = (this.start + n) % this.maxFrames
    this.frames -= n
    if (this.frames === 0) this.primed = false
  }
}
