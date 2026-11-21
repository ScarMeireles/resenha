import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent } from 'react'
import { api, ApiError, mediaUrl, type User } from '../lib/api'
import { imageAccept, normalizeUsername, rules, validateDisplayName, validateImage } from '../lib/accountRules'
import { CHOSEN_STATUSES, presenceLabel, type ChosenStatus } from '../lib/presence'
import { canSaveHandle, handleStatus, needsAvailabilityCheck, type HandleStatus } from '../lib/profileHandle'
import { useAccount } from '../hooks/useAccount'
import { useMyStatusContext } from '../hooks/useMyStatus'
import { useUsernameAvailability } from '../hooks/useUsernameAvailability'
import { Avatar } from './Avatar'
import { CameraIcon, EditIcon, ImageIcon, MoonIcon, SettingsIcon, XIcon } from './Icons'
import './ProfileCard.css'

interface Props {
  user: User
  onClose(): void
  onOpenMedia(): void
}

type Editing = 'name' | 'handle' | null

/** No cartão, "Offline" deixa claro que é o modo invisível. */
const statusText = (status: ChosenStatus) => (status === 'offline' ? 'Offline (invisível)' : presenceLabel[status])

function StatusIcon({ status }: { status: ChosenStatus }) {
  return (
    <span className="sm-ico" aria-hidden="true">
      {status === 'away' ? <span className="sm-moon"><MoonIcon size={14} /></span> : <span className={`sm-dot sm-dot--${status}`} />}
    </span>
  )
}

function handleMessage(status: HandleStatus, username: string): { text: string; tone: 'ok' | 'bad' | 'wait' } {
  switch (status.kind) {
    case 'current':
      return { text: 'É o seu @ atual.', tone: 'ok' }
    case 'checking':
      return { text: 'Verificando…', tone: 'wait' }
    case 'available':
      return { text: `@${username} — Disponível`, tone: 'ok' }
    case 'taken':
      return { text: `@${username} — Em uso`, tone: 'bad' }
    case 'invalid':
      return { text: status.message, tone: 'bad' }
  }
}

/** Mensagem pronta do erro da API (400 traz o erro do campo; 409 já vem com "Esse @ já está em uso."). */
function errorText(error: unknown, field: string): string {
  if (error instanceof ApiError) return error.fieldErrors[field]?.[0] ?? error.message
  return error instanceof Error ? error.message : String(error)
}

/**
 * Cartão do meu perfil (clicar na própria foto no painel): banner, foto, nome e @ editáveis,
 * e a bolinha de status no canto da foto, que abre o menu Online / Ausente / Offline (invisível).
 */
export function ProfileCard({ user, onClose, onOpenMedia }: Props) {
  const account = useAccount()
  const myStatus = useMyStatusContext()
  const [editing, setEditing] = useState<Editing>(null)
  const [statusMenu, setStatusMenu] = useState(false)
  const [nameDraft, setNameDraft] = useState(user.displayName)
  const [handleDraft, setHandleDraft] = useState(user.username)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const avatarInput = useRef<HTMLInputElement>(null)
  const bannerInput = useRef<HTMLInputElement>(null)

  const handle = normalizeUsername(handleDraft)
  const availability = useUsernameAvailability(handle, editing === 'handle' && needsAvailabilityCheck(handleDraft, user.username))
  const handleState = handleStatus(handleDraft, user.username, availability)
  const handleInfo = handleMessage(handleState, handle)

  // Esc fecha uma coisa por vez: a edição aberta, depois o menu de status, depois o cartão.
  const escape = useRef<() => void>(() => undefined)
  escape.current = () => {
    if (editing) setEditing(null)
    else if (statusMenu) setStatusMenu(false)
    else onClose()
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && escape.current()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const startEditing = (which: Exclude<Editing, null>) => {
    setError(null)
    setStatusMenu(false)
    if (which === 'name') setNameDraft(user.displayName)
    else setHandleDraft(user.username)
    setEditing(which)
  }

  /** Roda uma alteração na API: trava os botões, mostra o erro se falhar. Devolve se deu certo. */
  const run = async (action: () => Promise<void>, field: string): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try {
      await action()
      return true
    } catch (e) {
      setError(errorText(e, field))
      return false
    } finally {
      setBusy(false)
    }
  }

  const saveName = async (e: FormEvent) => {
    e.preventDefault()
    const invalid = validateDisplayName(nameDraft)
    if (invalid) return setError(invalid)
    if (nameDraft.trim() === user.displayName) return setEditing(null)
    if (await run(async () => account.update(await api.updateDisplayName(account.token, nameDraft.trim())), 'displayName'))
      setEditing(null)
  }

  const saveHandle = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSaveHandle(handleState)) return
    const ok = await run(async () => {
      const auth = await api.changeUsername(account.token, handle)
      await account.update(auth.user, auth.token)
    }, 'username')
    if (ok) setEditing(null)
  }

  const upload = (kind: 'avatar' | 'banner') => async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // deixa escolher o mesmo arquivo de novo
    if (!file) return
    const invalid = validateImage(file)
    if (invalid) return setError(invalid)
    await run(async () => {
      const send = kind === 'avatar' ? api.uploadAvatar : api.uploadBanner
      await account.update(await send(account.token, file))
    }, 'file')
  }

  const removeBanner = () => run(async () => account.update(await api.removeBanner(account.token)), 'file')

  const chooseStatus = (value: ChosenStatus) => {
    setStatusMenu(false)
    void myStatus.setStatus(value)
  }

  const bannerSrc = mediaUrl(user.bannerUrl)
  const bannerStyle: CSSProperties | undefined = bannerSrc ? { backgroundImage: `url("${bannerSrc}")` } : undefined

  return (
    <>
      <div className="pc-dim" onPointerDown={onClose} />
      <section className="profile-card" role="dialog" aria-label="Meu perfil"
        onPointerDown={(e) => { if (!(e.target as Element).closest('.status-menu, .pc-status-btn')) setStatusMenu(false) }}>
        <div className={`pc-banner${bannerSrc ? ' pc-banner--image' : ''}`} style={bannerStyle}>
          <div className="pc-banner-actions">
            {bannerSrc && (
              <button className="pc-banner-edit" aria-label="Remover banner" title="Remover banner" disabled={busy} onClick={() => void removeBanner()}>
                <XIcon size={14} />
              </button>
            )}
            <button className="pc-banner-edit" disabled={busy} onClick={() => bannerInput.current?.click()}>
              <ImageIcon size={14} /> Trocar banner
            </button>
          </div>
        </div>

        <div className="pc-avatar-wrap">
          <Avatar name={user.displayName} seed={user.id} src={mediaUrl(user.avatarUrl)} size={84} />
          <button className="pc-photo-edit" aria-label="Trocar foto" disabled={busy} onClick={() => avatarInput.current?.click()}>
            <CameraIcon size={20} />TROCAR FOTO
          </button>
          <button className="pc-status-btn" aria-label={`Status: ${statusText(myStatus.status)}. Trocar status`} aria-haspopup="menu"
            aria-expanded={statusMenu} onClick={() => setStatusMenu((open) => !open)}>
            <span className={`avatar-presence avatar-presence--${myStatus.status}`} style={{ '--ring': 'var(--bg-rail)' } as CSSProperties} />
          </button>
        </div>

        <input ref={avatarInput} type="file" accept={imageAccept} hidden onChange={(e) => void upload('avatar')(e)} />
        <input ref={bannerInput} type="file" accept={imageAccept} hidden onChange={(e) => void upload('banner')(e)} />

        <div className="pc-body">
          {editing === 'name' ? (
            <form className="pc-box" onSubmit={(e) => void saveName(e)}>
              <label className="pc-label" htmlFor="pc-name-input">Nome</label>
              <div className="pc-input">
                <input id="pc-name-input" value={nameDraft} maxLength={rules.displayNameMaxLength} autoFocus
                  onChange={(e) => setNameDraft(e.target.value)} />
              </div>
              <div className="pc-actions">
                <button type="button" className="pc-btn pc-btn--ghost" onClick={() => setEditing(null)}>Cancelar</button>
                <button type="submit" className="pc-btn pc-btn--primary" disabled={busy || nameDraft.trim() === ''}>Salvar</button>
              </div>
            </form>
          ) : (
            <div className="pc-name-row">
              <span className="pc-name">{user.displayName}</span>
              <button className="pc-edit" aria-label="Editar nome" title="Editar nome" onClick={() => startEditing('name')}>
                <EditIcon size={15} />
              </button>
            </div>
          )}

          {editing === 'handle' ? (
            <form className="pc-box" onSubmit={(e) => void saveHandle(e)}>
              <label className="pc-label" htmlFor="pc-handle-input">Seu @</label>
              <div className="pc-input">
                @<input id="pc-handle-input" value={handleDraft} maxLength={rules.usernameMaxLength + 1} spellCheck={false} autoFocus
                  autoComplete="off" onChange={(e) => setHandleDraft(e.target.value)} />
              </div>
              <p className={`pc-avail pc-avail--${handleInfo.tone}`} role="status">{handleInfo.text}</p>
              <div className="pc-actions">
                <button type="button" className="pc-btn pc-btn--ghost" onClick={() => setEditing(null)}>Cancelar</button>
                <button type="submit" className="pc-btn pc-btn--primary" disabled={busy || !canSaveHandle(handleState)}>Salvar</button>
              </div>
            </form>
          ) : (
            <div className="pc-handle-row">
              <span className="pc-handle">@{user.username}</span>
              <button className="pc-edit" aria-label="Trocar @" title="Trocar @" onClick={() => startEditing('handle')}>
                <EditIcon size={14} />
              </button>
            </div>
          )}

          <div className="pc-status-line">
            <StatusIcon status={myStatus.status} />
            <span>{statusText(myStatus.status)}</span>
          </div>

          {error && <p className="pc-error" role="alert">{error}</p>}

          <div className="pc-foot">
            <button className="pc-btn" disabled={busy} onClick={() => avatarInput.current?.click()}>
              <CameraIcon size={14} /> Trocar foto
            </button>
            <button className="pc-btn" onClick={onOpenMedia}>
              <SettingsIcon size={14} /> Áudio e vídeo
            </button>
          </div>
        </div>

        {statusMenu && (
          <div className="status-menu" role="menu" aria-label="Status">
            {CHOSEN_STATUSES.map(({ value, hint }) => (
              <button key={value} role="menuitemradio" aria-checked={myStatus.status === value} className="sm-item"
                autoFocus={myStatus.status === value} onClick={() => chooseStatus(value)}>
                <StatusIcon status={value} />
                <span className="sm-text">
                  <span>{statusText(value)}</span>
                  <span className="sm-hint">{hint}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
