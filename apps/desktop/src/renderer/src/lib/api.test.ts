import { describe, expect, it } from 'vitest'
import { toApiError } from './api'

const problem = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/problem+json' } })

describe('erros da API viram mensagens para a tela', () => {
  it('usa o título do ProblemDetails', async () => {
    const error = await toApiError(problem(409, { title: 'Esse @ já está em uso.' }))
    expect(error.message).toBe('Esse @ já está em uso.')
    expect(error.status).toBe(409)
  })

  it('separa os erros de cada campo', async () => {
    const error = await toApiError(problem(400, { title: 'One or more validation errors occurred.', errors: { password: ['A senha precisa ter pelo menos uma letra maiúscula.'] } }))
    expect(error.fieldErrors.password).toEqual(['A senha precisa ter pelo menos uma letra maiúscula.'])
    expect(error.message).toBe('Confira os campos destacados.')
  })

  it('explica o limite de tentativas', async () => {
    const error = await toApiError(new Response('', { status: 429 }))
    expect(error.message).toMatch(/Espere um minuto/)
  })

  it('reconhece sessão expirada', async () => {
    expect((await toApiError(new Response('', { status: 401 }))).isUnauthorized).toBe(true)
  })
})
