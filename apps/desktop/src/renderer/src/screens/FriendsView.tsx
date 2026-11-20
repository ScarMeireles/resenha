import { useId, useState, type FormEvent, type Ref } from 'react'
import { Avatar } from '../components/Avatar'
import { CheckIcon, ChatIcon, PhoneIcon, XIcon } from '../components/Icons'
import { ApiError, mediaUrl, type User } from '../lib/api'
import { isOnline, normalizeUsername, sortFriends, type FriendDto, type FriendRequestDto, type FriendsState } from '../lib/friends'
import { presenceLabel } from '../lib/presence'
import './FriendsView.css'

type Tab = 'online' | 'all' | 'requests'

interface Props {
  state: FriendsState
  inputRef: Ref<HTMLInputElement>
  onSendRequest(username: string): Promise<unknown>
  onAccept(id: string): Promise<void>
  onRemoveRequest(id: string): Promise<void>
  onCall(user: User): void
}

export function FriendsView({ state, inputRef, onSendRequest, onAccept, onRemoveRequest, onCall }: Props) {
  const [tab, setTab] = useState<Tab>('all')
  const tabs: { id: Tab; label: string }[] = [
    { id: 'online', label: 'Online' },
    { id: 'all', label: 'Todos' },
    { id: 'requests', label: state.incoming.length > 0 ? `Pedidos (${state.incoming.length})` : 'Pedidos' },
  ]

  return (
    <section className="friends">
      <div className="friends-tabs" role="tablist" aria-label="Filtro">
        {tabs.map((t) => (
          <button key={t.id} role="tab" id={`friends-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="friends-panel"
            className="friends-tab" onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <AddFriend inputRef={inputRef} onSendRequest={onSendRequest} />

      <div id="friends-panel" role="tabpanel" aria-labelledby={`friends-tab-${tab}`} className="friends-list">
        {tab === 'requests' ? (
          <Requests state={state} onAccept={onAccept} onRemoveRequest={onRemoveRequest} />
        ) : (
          <FriendList friends={state.friends} onlyOnline={tab === 'online'} onCall={onCall} />
        )}
      </div>
    </section>
  )
}

function AddFriend({ inputRef, onSendRequest }: Pick<Props, 'inputRef' | 'onSendRequest'>) {
  const id = useId()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const username = normalizeUsername(value)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || username === '') return
    setBusy(true)
    setResult(null)
    try {
      await onSendRequest(username)
      setResult({ ok: true, text: `Pedido enviado para @${username}.` })
      setValue('')
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      setResult({ ok: false, text: error.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="friends-add" onSubmit={submit}>
      <h3 id={`${id}-title`}>Adicionar amigo</h3>
      <p id={`${id}-help`}>Digite o @ da pessoa. Ela recebe um pedido e precisa aceitar.</p>
      <div className="friends-add-row">
        <div className="friends-add-input">
          <span aria-hidden="true">@</span>
          <input ref={inputRef} value={value} onChange={(e) => { setValue(e.target.value); setResult(null) }} placeholder="usuario"
            aria-labelledby={`${id}-title`} aria-describedby={`${id}-help`} autoComplete="off" spellCheck={false} />
        </div>
        <button type="submit" className="friends-send" disabled={busy || username === ''}>
          {busy ? 'Enviando…' : 'Enviar pedido'}
        </button>
      </div>
      {result && <p className={result.ok ? 'friends-ok' : 'friends-error'} role={result.ok ? 'status' : 'alert'}>{result.text}</p>}
    </form>
  )
}

function FriendList({ friends, onlyOnline, onCall }: { friends: FriendDto[]; onlyOnline: boolean; onCall(user: User): void }) {
  const shown = sortFriends(onlyOnline ? friends.filter((f) => isOnline(f.presence)) : friends)
  const empty = onlyOnline ? 'Nenhum amigo online agora.' : 'Você ainda não tem amigos. Mande um pedido pelo @ ali em cima.'

  if (shown.length === 0) return <p className="friends-empty">{empty}</p>
  return (
    <>
      <h3 className="friends-heading">{onlyOnline ? 'ONLINE' : 'TODOS OS AMIGOS'} — {shown.length}</h3>
      <ul>
        {shown.map(({ user, presence }) => (
          <li key={user.id} className="friends-row">
            <Avatar name={user.displayName} seed={user.id} src={mediaUrl(user.avatarUrl)} size={40} presence={presence} ringColor="var(--bg-main)" />
            <div className="friends-names">
              <div>
                <strong>{user.displayName}</strong> <span className="friends-handle">@{user.username}</span>
              </div>
              <span className={`friends-status friends-status--${presence}`}>
                {presenceLabel[presence]}
              </span>
            </div>
            <button className="friends-action" aria-label="Mandar mensagem" title="Em breve" disabled><ChatIcon size={18} /></button>
            {/* Liga mesmo para quem aparece offline: pode estar invisível. Se o app dele estiver fechado, fica uma chamada perdida. */}
            <button className="friends-action" aria-label={`Ligar para ${user.displayName}`} title="Ligar" onClick={() => onCall(user)}>
              <PhoneIcon size={18} />
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function Requests({ state, onAccept, onRemoveRequest }: Pick<Props, 'onAccept' | 'onRemoveRequest'> & { state: FriendsState }) {
  if (state.incoming.length === 0 && state.outgoing.length === 0) return <p className="friends-empty">Nenhum pedido pendente.</p>
  return (
    <>
      {state.incoming.length > 0 && (
        <RequestSection title="PEDIDOS RECEBIDOS" items={state.incoming} subtitle="quer ser seu amigo">
          {(r) => (
            <>
              <RequestButton label="Aceitar pedido" kind="accept" onClick={() => onAccept(r.id)}><CheckIcon size={18} /></RequestButton>
              <RequestButton label="Recusar pedido" kind="remove" onClick={() => onRemoveRequest(r.id)}><XIcon size={18} /></RequestButton>
            </>
          )}
        </RequestSection>
      )}
      {state.outgoing.length > 0 && (
        <RequestSection title="PEDIDOS ENVIADOS" items={state.outgoing} subtitle="aguardando resposta">
          {(r) => (
            <RequestButton label="Cancelar pedido" kind="remove" onClick={() => onRemoveRequest(r.id)}><XIcon size={18} /></RequestButton>
          )}
        </RequestSection>
      )}
    </>
  )
}

function RequestSection({ title, items, subtitle, children }: {
  title: string
  items: FriendRequestDto[]
  subtitle: string
  children(request: FriendRequestDto): React.ReactNode
}) {
  return (
    <>
      <h3 className="friends-heading">{title} — {items.length}</h3>
      <ul>
        {items.map((r) => (
          <li key={r.id} className="friends-row">
            <Avatar name={r.user.displayName} seed={r.user.id} src={mediaUrl(r.user.avatarUrl)} size={40} ringColor="var(--bg-main)" />
            <div className="friends-names">
              <strong>{r.user.displayName}</strong>
              <span className="friends-status">@{r.user.username} · {subtitle}</span>
            </div>
            {children(r)}
          </li>
        ))}
      </ul>
    </>
  )
}

/** Botão de ação do pedido; trava enquanto a chamada roda e ignora erro (o estado só muda se der certo). */
function RequestButton({ label, kind, onClick, children }: {
  label: string
  kind: 'accept' | 'remove'
  onClick(): Promise<void>
  children: React.ReactNode
}) {
  const [busy, setBusy] = useState(false)
  return (
    <button className={`friends-action friends-action--${kind}`} aria-label={label} disabled={busy}
      onClick={async () => {
        setBusy(true)
        try { await onClick() } catch { /* o pedido continua na lista; a pessoa pode tentar de novo */ } finally { setBusy(false) }
      }}>
      {children}
    </button>
  )
}
