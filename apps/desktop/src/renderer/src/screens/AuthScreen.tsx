import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { CameraIcon, CheckIcon, EyeIcon, EyeOffIcon } from '../components/Icons'
import { imageAccept, rules, validateDisplayName, validateImage, validatePassword, validateUsername } from '../lib/accountRules'
import { api, ApiError, type AuthResponse } from '../lib/api'
import './AuthScreen.css'

type Mode = 'login' | 'register'
type Field = 'displayName' | 'username' | 'password' | 'avatar'
type Errors = Partial<Record<Field, string[]>>

interface Props {
  onAuthenticated(auth: AuthResponse, notice?: string): Promise<void>
}

export function AuthScreen({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<Mode>('login')
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [avatar, setAvatar] = useState<File | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const registering = mode === 'register'

  function switchMode(next: Mode) {
    setMode(next)
    setErrors({})
    setFormError(null)
  }

  function validate(): Errors {
    const found: Errors = {}
    const usernameError = validateUsername(username)
    if (usernameError) found.username = [usernameError]
    if (registering) {
      const nameError = validateDisplayName(displayName)
      if (nameError) found.displayName = [nameError]
      const passwordErrors = validatePassword(password)
      if (passwordErrors.length > 0) found.password = passwordErrors
    } else if (password.length === 0) {
      found.password = ['Informe sua senha.']
    }
    return found
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setFormError(null)

    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setBusy(true)
    try {
      if (!registering) {
        await onAuthenticated(await api.login(username, password))
        return
      }

      const auth = await api.register(username, displayName, password)
      let notice: string | undefined
      if (avatar) {
        try {
          auth.user = await api.uploadAvatar(auth.token, avatar)
        } catch (error) {
          notice = `Conta criada, mas a foto não foi enviada: ${error instanceof Error ? error.message : error}`
        }
      }
      await onAuthenticated(auth, notice)
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      if (error.status === 409) setErrors({ username: [error.message] })
      else if (Object.keys(error.fieldErrors).length > 0) setErrors(error.fieldErrors as Errors)
      else setFormError(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit} noValidate aria-busy={busy}>
        <header className="auth-header">
          <span className="brand-mark" aria-hidden="true">R</span>
          <h1>{registering ? 'Criar sua conta' : 'Entrar no Resenha'}</h1>
          <p>{registering ? 'Só o básico. Sem e-mail.' : 'Que bom te ver de novo.'}</p>
        </header>

        {registering && (
          <AvatarPicker
            file={avatar}
            error={errors.avatar?.[0]}
            onPick={(file) => {
              const error = file && validateImage(file)
              setErrors((prev) => ({ ...prev, avatar: error ? [error] : undefined }))
              setAvatar(error ? null : file)
            }}
          />
        )}

        {registering && (
          <TextField label="Nome" errors={errors.displayName}>
            {(props) => (
              <div className="auth-input" data-invalid={props['aria-invalid']}>
                <input {...props} value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={rules.displayNameMaxLength} autoComplete="nickname" autoFocus />
              </div>
            )}
          </TextField>
        )}

        <TextField label={registering ? 'Seu @ (único)' : 'Seu @'} errors={errors.username}
          hint={registering ? `De ${rules.usernameMinLength} a ${rules.usernameMaxLength} caracteres: letras, números, _ e ponto.` : undefined}
          valid={registering && username.length > 0 && !validateUsername(username)}>
          {(props) => (
            <div className="auth-input auth-input--prefix" data-invalid={props['aria-invalid']}>
              <span aria-hidden="true">@</span>
              <input {...props} value={username} onChange={(e) => setUsername(e.target.value)}
                maxLength={rules.usernameMaxLength + 1} autoComplete="username" spellCheck={false} autoFocus={!registering} />
              {registering && username.length > 0 && !validateUsername(username) && (
                <span className="auth-ok"><CheckIcon /></span>
              )}
            </div>
          )}
        </TextField>

        <TextField label="Senha" errors={errors.password}
          hint={registering ? `De ${rules.passwordMinLength} a ${rules.passwordMaxLength} caracteres, com maiúscula, minúscula e um caractere especial. O app lembra de você.` : undefined}>
          {(props) => (
            <div className="auth-input auth-input--suffix" data-invalid={props['aria-invalid']}>
              <input {...props} type={showPassword ? 'text' : 'password'} value={password}
                onChange={(e) => setPassword(e.target.value)} maxLength={rules.passwordMaxLength}
                autoComplete={registering ? 'new-password' : 'current-password'} />
              <button type="button" className="auth-eye" onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'} aria-pressed={showPassword}>
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          )}
        </TextField>

        {formError && <p className="auth-form-error" role="alert">{formError}</p>}

        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Aguarde…' : registering ? 'Criar conta' : 'Entrar'}
        </button>

        <p className="auth-switch">
          {registering ? 'Já tem conta? ' : 'Ainda não tem conta? '}
          <button type="button" className="btn-link" onClick={() => switchMode(registering ? 'login' : 'register')}>
            {registering ? 'Entrar' : 'Criar conta'}
          </button>
        </p>
      </form>
    </div>
  )
}

interface InputProps {
  id: string
  'aria-invalid': boolean
  'aria-describedby': string | undefined
}

/** Rótulo + campo + dica/erros, com tudo ligado para leitores de tela. */
function TextField({ label, hint, errors, valid, children }: {
  label: string
  hint?: string
  errors?: string[]
  valid?: boolean
  children(props: InputProps): ReactNode
}) {
  const id = useId()
  const hasErrors = !!errors && errors.length > 0
  const describedBy = hasErrors ? `${id}-errors` : hint ? `${id}-hint` : undefined

  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-invalid': hasErrors, 'aria-describedby': describedBy })}
      {hasErrors ? (
        <ul id={`${id}-errors`} className="auth-errors">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      ) : valid ? (
        <span className="auth-valid">Formato válido</span>
      ) : hint ? (
        <span id={`${id}-hint`} className="auth-hint">{hint}</span>
      ) : null}
    </div>
  )
}

function AvatarPicker({ file, error, onPick }: { file: File | null; error?: string; onPick(file: File | null): void }) {
  const id = useId()
  const [preview, setPreview] = useState<string | null>(null)

  // Mostra a foto escolhida sem enviar nada ainda; libera a memória ao trocar.
  useEffect(() => {
    if (!file) return setPreview(null)
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  return (
    <div className="auth-avatar">
      <label htmlFor={id} className="auth-avatar-drop" data-filled={!!preview}>
        {preview ? <img src={preview} alt="" /> : <CameraIcon size={26} />}
        <span className="sr-only">Escolher foto de perfil</span>
      </label>
      <input id={id} type="file" accept={imageAccept} className="sr-only"
        onChange={(e) => { onPick(e.target.files?.[0] ?? null); e.target.value = '' }} />
      <div className="auth-avatar-text">
        <span>Foto de perfil</span>
        {error ? <span className="auth-errors" role="alert">{error}</span>
          : file ? <button type="button" className="btn-link" onClick={() => onPick(null)}>Remover foto</button>
          : <span className="auth-hint">Opcional. Pode ser GIF animado.</span>}
      </div>
    </div>
  )
}
