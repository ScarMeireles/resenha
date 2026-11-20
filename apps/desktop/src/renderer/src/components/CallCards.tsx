import { mediaUrl } from '../lib/api'
import type { CallState } from '../lib/calls'
import { Avatar } from './Avatar'
import './CallCards.css'

interface Props {
  state: CallState
  onAccept(): void
  onDecline(): void
  onCancel(): void
}

/** Cards no canto inferior direito: ligação recebida, "Chamando…" e avisos curtos. */
export function CallCards({ state, onAccept, onDecline, onCancel }: Props) {
  const { incoming, current, notice } = state
  const calling = current?.status === 'ringing-out' && current.target.kind === 'direct' ? current.target.friend : null

  if (!incoming && !calling && !notice) return null
  return (
    <div className="call-cards">
      {incoming && (
        <div className="call-card" role="alertdialog" aria-label={`${incoming.from.displayName} está te ligando`}>
          <Avatar name={incoming.from.displayName} seed={incoming.from.id} src={mediaUrl(incoming.from.avatarUrl)} size={72} ringColor="#111318" />
          <strong className="call-card-name">{incoming.from.displayName}</strong>
          <span className="call-card-sub">está te ligando…</span>
          <div className="call-card-actions">
            <button className="call-card-btn call-card-btn--decline" onClick={onDecline}>Recusar</button>
            <button className="call-card-btn call-card-btn--accept" onClick={onAccept} autoFocus>Atender</button>
          </div>
        </div>
      )}

      {calling && (
        <div className="call-card" role="alertdialog" aria-label={`Chamando ${calling.displayName}`}>
          <Avatar name={calling.displayName} seed={calling.id} src={mediaUrl(calling.avatarUrl)} size={72} ringColor="#111318" />
          <strong className="call-card-name">{calling.displayName}</strong>
          <span className="call-card-sub">Chamando {calling.displayName}…</span>
          <div className="call-card-actions">
            <button className="call-card-btn call-card-btn--decline" onClick={onCancel}>Cancelar</button>
          </div>
        </div>
      )}

      {notice && <div className="call-notice" role="status">{notice}</div>}
    </div>
  )
}
