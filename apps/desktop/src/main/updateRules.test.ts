import { describe, expect, it } from 'vitest'
import { DEV_MESSAGE, describeUpdateError, formatProgress, nextStep, NOTHING_TO_DOWNLOAD } from './updateRules'

describe('nextStep', () => {
  it('em dia segue o app', () => {
    expect(nextStep('startup', { kind: 'upToDate' })).toBe('continue')
    expect(nextStep('required', { kind: 'upToDate' })).toBe('continue')
  })

  it('instalando espera o app fechar sozinho', () => {
    expect(nextStep('startup', { kind: 'installing' })).toBe('wait')
  })

  it('em desenvolvimento só segue ao abrir; se a API barrou, mostra o motivo', () => {
    expect(nextStep('startup', { kind: 'dev' })).toBe('continue')
    expect(nextStep('required', { kind: 'dev' })).toBe('showError')
  })

  it('consulta que falhou ao abrir não trava o app (a API barra depois, se precisar)', () => {
    expect(nextStep('startup', { kind: 'error', stage: 'check', message: 'x' })).toBe('continue')
    expect(nextStep('required', { kind: 'error', stage: 'check', message: 'x' })).toBe('showError')
  })

  it('download que falhou sempre mostra o erro com tentar de novo', () => {
    expect(nextStep('startup', { kind: 'error', stage: 'download', message: 'x' })).toBe('showError')
  })
})

describe('describeUpdateError', () => {
  it('latest.yml ausente vira "não encontrei a atualização"', () => {
    const error = Object.assign(new Error('Cannot find latest.yml (HttpError: 404)'), { code: 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND' })
    expect(describeUpdateError('check', error)).toBe(NOTHING_TO_DOWNLOAD)
  })

  it('servidor fora e download quebrado têm mensagens diferentes', () => {
    expect(describeUpdateError('check', new Error('net::ERR_CONNECTION_REFUSED'))).toMatch(/Radmin/)
    expect(describeUpdateError('download', new Error('net::ERR_CONNECTION_RESET'))).toMatch(/download/)
  })

  it('arquivo corrompido', () => {
    expect(describeUpdateError('download', new Error('sha512 checksum mismatch, expected abc'))).toMatch(/corrompida/)
  })

  it('a mensagem de desenvolvimento explica o que fazer', () => {
    expect(DEV_MESSAGE).toMatch(/package\.json/)
  })
})

describe('formatProgress', () => {
  it('mostra MB com vírgula', () => {
    expect(formatProgress({ percent: 50, transferred: 1024 * 1024 * 12.34, total: 1024 * 1024 * 146 })).toBe('12,3 de 146,0 MB')
  })

  it('sem tamanho total não mostra nada', () => {
    expect(formatProgress({ percent: 0, transferred: 0, total: 0 })).toBe('')
  })
})
