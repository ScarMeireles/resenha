import { describe, expect, it } from 'vitest'
import { captureArgs, createFrameAligner } from './screenAudioFrames'

describe('createFrameAligner', () => {
  it('entrega só quadros inteiros e junta a sobra com o próximo pedaço', () => {
    const align = createFrameAligner(8)
    expect(align(Buffer.from([1, 2, 3]))).toBeNull()
    const out = align(Buffer.from([4, 5, 6, 7, 8, 9, 10]))
    expect([...out!]).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    const rest = align(Buffer.from([11, 12, 13, 14, 15, 16]))
    expect([...rest!]).toEqual([9, 10, 11, 12, 13, 14, 15, 16])
  })

  it('pedaço já alinhado passa inteiro', () => {
    const align = createFrameAligner(8)
    expect(align(Buffer.alloc(16))?.length).toBe(16)
    expect(align(Buffer.alloc(0))).toBeNull()
  })

  it('a sobra guardada não muda se o buffer original for reaproveitado', () => {
    const align = createFrameAligner(4)
    const chunk = Buffer.from([1, 2, 3, 4, 5, 6])
    align(chunk)
    chunk.fill(0)
    expect([...align(Buffer.from([7, 8]))!]).toEqual([5, 6, 7, 8])
  })
})

describe('captureArgs', () => {
  it('monta os argumentos do ajudante', () => {
    expect(captureArgs(1234, ['discord.exe'])).toEqual(['capture', '--exclude-pid', '1234', '--exclude-exe', 'discord.exe'])
    expect(captureArgs(null, ['a.exe', 'b.exe'])).toEqual(['capture', '--exclude-exe', 'a.exe', '--exclude-exe', 'b.exe'])
  })
})
