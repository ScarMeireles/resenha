/** Cliente da API do Resenha. Os tipos espelham server/api (AuthResponse, UserDto). */

export const apiUrl: string = import.meta.env.VITE_API_URL

export interface User {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  bannerUrl: string | null
}

export interface AuthResponse {
  token: string
  expiresAt: string
  user: User
}

/** Erro já com a mensagem pronta para a tela e, quando houver, os erros por campo. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number, // 0 = não conseguiu falar com o servidor
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message)
    this.name = 'ApiError'
  }

  get isUnauthorized(): boolean {
    return this.status === 401
  }
}

/** Monta a URL completa de uma imagem da API ("/media/avatars/x.webp" → "http://.../media/avatars/x.webp"). */
export const mediaUrl = (path: string | null): string | null => (path ? apiUrl + path : null)

interface ProblemDetails {
  title?: string
  errors?: Record<string, string[]>
}

/** Converte a resposta de erro da API (ProblemDetails) em ApiError. Exportada para teste. */
export async function toApiError(response: Response): Promise<ApiError> {
  let problem: ProblemDetails = {}
  try {
    problem = (await response.json()) as ProblemDetails
  } catch {
    // corpo vazio ou não-JSON: fica só com a mensagem padrão
  }

  const fieldErrors = problem.errors ?? {}
  if (response.status === 429) return new ApiError('Muitas tentativas seguidas. Espere um minuto e tente de novo.', 429)
  if (Object.keys(fieldErrors).length > 0) return new ApiError('Confira os campos destacados.', response.status, fieldErrors)
  return new ApiError(problem.title ?? `O servidor respondeu com erro (${response.status}).`, response.status)
}

/** Chamada genérica à API. Exportada para os módulos de cada área (ex.: amigos). Respostas 204 voltam como undefined. */
export async function request<T>(method: string, path: string, options: { token?: string; json?: unknown; body?: FormData; signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`
  if (options.json !== undefined) headers['Content-Type'] = 'application/json'

  let response: Response
  try {
    response = await fetch(apiUrl + path, {
      method,
      headers,
      body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
      signal: options.signal,
    })
  } catch {
    throw new ApiError('Não consegui falar com o servidor. Confira sua internet ou se a API está no ar.', 0)
  }

  if (!response.ok) throw await toApiError(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const api = {
  register: (username: string, displayName: string, password: string) =>
    request<AuthResponse>('POST', '/auth/register', { json: { username, displayName, password } }),

  login: (username: string, password: string) =>
    request<AuthResponse>('POST', '/auth/login', { json: { username, password } }),

  /** Troca o token salvo por um novo de 30 dias. O app chama ao abrir. */
  refresh: (token: string) => request<AuthResponse>('POST', '/auth/refresh', { token }),

  uploadAvatar: (token: string, file: File) => request<User>('PUT', '/me/avatar', { token, body: fileForm(file) }),

  uploadBanner: (token: string, file: File) => request<User>('PUT', '/me/banner', { token, body: fileForm(file) }),

  removeBanner: (token: string) => request<User>('DELETE', '/me/banner', { token }),

  updateDisplayName: (token: string, displayName: string) => request<User>('PATCH', '/me', { token, json: { displayName } }),

  /** Troca o próprio @. Devolve um token novo (com o @ novo); 409 = já está em uso. */
  changeUsername: (token: string, username: string) => request<AuthResponse>('PUT', '/me/username', { token, json: { username } }),
}

function fileForm(file: File): FormData {
  const body = new FormData()
  body.append('file', file)
  return body
}
