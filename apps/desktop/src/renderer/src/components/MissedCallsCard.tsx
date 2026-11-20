import { mediaUrl, type User } from '../lib/api'
import { missedText, summarizeMissed, type MissedCallDto } from '../lib/missedCalls'
import { Avatar } from './Avatar'
import { PhoneIcon } from './Icons'

interface Props {
  calls: MissedCallDto[]
  onCallBack(user: User): void
  onDismiss(): void
}

/** Aviso de quem tentou ligar enquanto o app estava fechado. "Fechar" apaga as chamadas perdidas. */
export function MissedCallsCard({ calls, onCallBack, onDismiss }: Props) {
  const list = summarizeMissed(calls)
  if (list.length === 0) return null
  return (
    <div className="call-card call-card--missed" role="alertdialog" aria-label="Chamadas perdidas">
      <strong className="call-card-name">{list.length === 1 && list[0].count === 1 ? 'Chamada perdida' : 'Chamadas perdidas'}</strong>
      <ul className="missed-list">
        {list.map((s) => (
          <li key={s.caller.id} className="missed-row">
            <Avatar name={s.caller.displayName} seed={s.caller.id} src={mediaUrl(s.caller.avatarUrl)} size={32} ringColor="#111318" />
            <span className="missed-text"><strong>{s.caller.displayName}</strong> {missedText(s)}</span>
            <button className="missed-call-back" aria-label={`Ligar para ${s.caller.displayName}`} title="Ligar de volta"
              onClick={() => onCallBack(s.caller)}>
              <PhoneIcon size={16} />
            </button>
          </li>
        ))}
      </ul>
      <div className="call-card-actions">
        <button className="call-card-btn call-card-btn--neutral" onClick={onDismiss}>Fechar</button>
      </div>
    </div>
  )
}
