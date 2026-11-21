import { useState } from 'react'
import { Avatar } from '../components/Avatar'
import { PlusIcon } from '../components/Icons'
import { Modal } from '../components/Modal'
import { mediaUrl } from '../lib/api'
import { previewText, sidebarConversations, type DirectConversationDto, type UnreadState } from '../lib/dms'
import { sortFriends, type FriendDto } from '../lib/friends'

interface ListProps {
  meId: string
  conversations: DirectConversationDto[]
  friends: FriendDto[]
  unread: UnreadState
  openId: string | null
  onOpen(conversationId: string): void
  onNew(): void
}

/** Seção "Mensagens diretas" da barra lateral do Início: a conversa mais recente em cima. */
export function DirectMessageList({ meId, conversations, friends, unread, openId, onOpen, onNew }: ListProps) {
  const shown = sidebarConversations(conversations, openId)
  const friendById = new Map(friends.map((f) => [f.user.id, f]))

  return (
    <>
      <h2 className="sidebar-section">
        Mensagens diretas
        <button className="plus" aria-label="Nova mensagem" title="Nova mensagem" onClick={onNew}><PlusIcon size={16} /></button>
      </h2>
      {shown.length === 0 && <p className="sidebar-empty">Fale com um amigo pelo “+” ou pelo botão “Mensagem” da lista.</p>}
      {shown.map((c) => {
        const friend = friendById.get(c.user.id)
        const person = friend?.user ?? c.user
        const count = c.id === openId ? 0 : unread[c.id]?.count ?? 0
        const preview = previewText(c.lastMessage, meId)
        return (
          <button key={c.id} className={`dm-row${count > 0 ? ' dm-row--unread' : ''}`} aria-current={c.id === openId ? 'page' : undefined}
            onClick={() => onOpen(c.id)}>
            <Avatar name={person.displayName} seed={person.id} src={mediaUrl(person.avatarUrl)} size={32} presence={friend?.presence} />
            <span className="dm-names">
              <span className="dm-name">{person.displayName}</span>
              <span className="dm-prev">{preview}</span>
            </span>
            {count > 0 && <span className="sidebar-badge" aria-label={`${count} não lidas`}>{count > 99 ? '99+' : count}</span>}
          </button>
        )
      })}
    </>
  )
}

/** O "+": escolhe um amigo para abrir (ou criar) a conversa. */
export function NewMessageModal({ friends, onPick, onClose }: {
  friends: FriendDto[]
  onPick(userId: string): Promise<void>
  onClose(): void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pick(userId: string) {
    setBusy(true)
    setError(null)
    try {
      await onPick(userId)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Modal title="Nova mensagem" onClose={onClose}>
      {friends.length === 0 ? (
        <p className="dm-pick-empty">Você ainda não tem amigos. Mande um pedido pelo @ na tela de Amigos.</p>
      ) : (
        <ul className="dm-pick-list">
          {sortFriends(friends).map(({ user, presence }) => (
            <li key={user.id}>
              <button className="dm-row" disabled={busy} onClick={() => void pick(user.id)}>
                <Avatar name={user.displayName} seed={user.id} src={mediaUrl(user.avatarUrl)} size={32} presence={presence} />
                <span className="dm-names">
                  <span className="dm-name">{user.displayName}</span>
                  <span className="dm-prev">@{user.username}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="modal-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="modal-cancel" onClick={onClose}>Cancelar</button>
      </div>
    </Modal>
  )
}
