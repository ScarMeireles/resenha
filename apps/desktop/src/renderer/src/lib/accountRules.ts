import rules from '@shared/account-rules.json'

/**
 * Mesmas regras da API (server/api/Accounts/AccountRules.cs), lidas de shared/account-rules.json.
 * Servem só para avisar antes de enviar; quem decide de verdade é o servidor.
 */
export { rules }

const usernamePattern = new RegExp(rules.usernamePattern)

/** Aceita "@Joao" ou "joao" e devolve "joao", como a API faz. */
export const normalizeUsername = (raw: string): string => raw.trim().replace(/^@+/, '').toLowerCase()

export function validateUsername(raw: string): string | null {
  const username = normalizeUsername(raw)
  if (username.length < rules.usernameMinLength || username.length > rules.usernameMaxLength)
    return `O @ precisa ter de ${rules.usernameMinLength} a ${rules.usernameMaxLength} caracteres.`
  if (!usernamePattern.test(username)) return 'O @ só pode ter letras de a a z, números, _ e ponto.'
  return null
}

export function validateDisplayName(raw: string): string | null {
  const name = raw.trim()
  if (name.length === 0) return 'Informe um nome.'
  if (name.length > rules.displayNameMaxLength) return `O nome pode ter no máximo ${rules.displayNameMaxLength} caracteres.`
  return null
}

export function validatePassword(password: string): string[] {
  const errors: string[] = []
  if (password.length < rules.passwordMinLength || password.length > rules.passwordMaxLength)
    errors.push(`A senha precisa ter de ${rules.passwordMinLength} a ${rules.passwordMaxLength} caracteres.`)
  if (!/\p{Lu}/u.test(password)) errors.push('A senha precisa ter pelo menos uma letra maiúscula.')
  if (!/\p{Ll}/u.test(password)) errors.push('A senha precisa ter pelo menos uma letra minúscula.')
  if (!/[^\p{L}\p{Nd}\s]/u.test(password)) errors.push('A senha precisa ter pelo menos um caractere especial (ex.: ! @ # $ %).')
  return errors
}

const acceptedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
export const imageAccept = acceptedImageTypes.join(',')

export function validateImage(file: File): string | null {
  if (!acceptedImageTypes.includes(file.type)) return 'Envie uma imagem JPG, PNG, GIF ou WebP.'
  if (file.size > rules.maxImageBytes) return 'A imagem pode ter no máximo 10 MB.'
  return null
}
