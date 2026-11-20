import { describe, expect, it } from 'vitest'
import { PcmQueue } from './pcmQueue'

/** `frames` quadros estéreo com o esquerdo = l e o direito = r. */
const stereo = (frames: number, l: number, r = -l) => Float32Array.from({ length: frames * 2 }, (_, i) => (i % 2 === 0 ? l : r))

function readBlock(q: PcmQueue, frames = 4) {
  const left = new Float32Array(frames).fill(9)
  const right = new Float32Array(frames).fill(9)
  q.read(left, right)
  return { left: [...left], right: [...right] }
}

describe('PcmQueue', () => {
  it('só toca depois de juntar a escorva e separa os canais', () => {
    const q = new PcmQueue(8, 32)
    q.write(stereo(6, 0.5))
    expect(readBlock(q).left).toEqual([0, 0, 0, 0])
    q.write(stereo(2, 0.5))
    expect(readBlock(q)).toEqual({ left: [0.5, 0.5, 0.5, 0.5], right: [-0.5, -0.5, -0.5, -0.5] })
    expect(q.size).toBe(4)
  })

  it('falta no meio vira silêncio e depois espera escorvar de novo', () => {
    const q = new PcmQueue(4, 32)
    q.write(stereo(6, 0.25))
    readBlock(q)
    expect(readBlock(q).left).toEqual([0.25, 0.25, 0, 0])
    q.write(stereo(2, 0.25))
    expect(readBlock(q).left).toEqual([0, 0, 0, 0])
  })

  it('fila cheia descarta o mais antigo e volta para o atraso da escorva', () => {
    const q = new PcmQueue(4, 16)
    q.write(stereo(14, 0.25))
    q.write(stereo(4, 0.75))
    expect(q.size).toBe(8)
    expect(readBlock(q).left).toEqual([0.25, 0.25, 0.25, 0.25])
    expect(readBlock(q).left).toEqual([0.75, 0.75, 0.75, 0.75])
  })

  it('pedaço maior que a fila guarda só o fim e ignora meia amostra solta', () => {
    const q = new PcmQueue(4, 8)
    const big = new Float32Array(21)
    for (let i = 0; i < 20; i++) big[i] = i
    q.write(big)
    expect(q.size).toBe(8)
    expect(readBlock(q)).toEqual({ left: [4, 6, 8, 10], right: [5, 7, 9, 11] })
  })
})
