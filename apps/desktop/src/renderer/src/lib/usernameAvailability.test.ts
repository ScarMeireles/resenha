import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './api'
import { DEBOUNCE_MS, scheduleUsernameCheck, toAvailability, type Availability } from './usernameAvailability'

describe('toAvailability', () => {
  it('traduz a resposta da API', () => {
    expect(toAvailability({ available: true, error: null })).toEqual({ kind: 'available' })
    expect(toAvailability({ available: false, error: null })).toEqual({ kind: 'taken' })
    expect(toAvailability({ available: false, error: 'Curto demais.' })).toEqual({ kind: 'invalid', message: 'Curto demais.' })
  })
})

describe('scheduleUsernameCheck', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const setup = (check = vi.fn().mockResolvedValue({ available: true, error: null })) => {
    const results: Availability[] = []
    return { check, results, start: (u: string) => scheduleUsernameCheck(u, (r) => results.push(r), check) }
  }

  it('só consulta depois de 400 ms parado', async () => {
    const { check, results, start } = setup()
    start('maria')
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1)
    expect(check).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(check).toHaveBeenCalledWith('maria', expect.any(AbortSignal))
    expect(results.at(-1)).toEqual({ kind: 'available' })
  })

  it('nova digitação cancela a consulta anterior e ignora resposta velha', async () => {
    let resolveOld!: (v: { available: boolean; error: null }) => void
    const check = vi.fn()
      .mockImplementationOnce(() => new Promise((r) => { resolveOld = r }))
      .mockResolvedValueOnce({ available: false, error: null })
    const { results, start } = setup(check)

    const cancelOld = start('mar')
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    const oldSignal = check.mock.calls[0][1] as AbortSignal
    cancelOld()
    expect(oldSignal.aborted).toBe(true)

    start('maria')
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    resolveOld({ available: true, error: null }) // resposta velha chega atrasada
    await vi.advanceTimersByTimeAsync(0)
    expect(results.at(-1)).toEqual({ kind: 'taken' })
  })

  it('digitar de novo antes dos 400 ms não consulta a primeira', async () => {
    const { check, start } = setup()
    const cancel = start('ma')
    await vi.advanceTimersByTimeAsync(200)
    cancel()
    start('mar')
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    expect(check).toHaveBeenCalledTimes(1)
    expect(check.mock.calls[0][0]).toBe('mar')
  })

  it('campo vazio não consulta e limpa a indicação', async () => {
    const { check, results, start } = setup()
    start('  ')
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2)
    expect(check).not.toHaveBeenCalled()
    expect(results).toEqual([{ kind: 'idle' }])
  })

  it('429 e erro de rede ficam em silêncio', async () => {
    const { results, start } = setup(vi.fn().mockRejectedValue(new ApiError('Muitas tentativas.', 429)))
    start('maria')
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    expect(results).toEqual([{ kind: 'idle' }])
  })
})
