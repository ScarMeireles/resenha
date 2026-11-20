import { useState } from 'react'
import { Avatar } from '../components/Avatar'
import { XIcon } from '../components/Icons'
import { ConfirmModal } from '../components/Modal'
import { mediaUrl } from '../lib/api'
import type { GroupDto, GroupMemberDto } from '../lib/groups'

interface Props {
  group: GroupDto
  meId: string
  onRemove(userId: string): Promise<void>
}

const byName = (a: GroupMemberDto, b: GroupMemberDto) => a.user.displayName.localeCompare(b.user.displayName, 'pt-BR')

/** Painel da direita: membros separados em online e offline. O dono pode remover os outros. */
export function MembersPanel({ group, meId, onRemove }: Props) {
  const [removing, setRemoving] = useState<GroupMemberDto | null>(null)
  const canRemove = group.ownerId === meId
  const online = group.members.filter((m) => m.presence === 'online').sort(byName)
  const offline = group.members.filter((m) => m.presence !== 'online').sort(byName)

  const section = (title: string, members: GroupMemberDto[]) => (
    <section>
      <h3 className="members-heading">{title} — {members.length}</h3>
      <ul className="members-list">
        {members.map((m) => (
          <li key={m.user.id} className={`member${m.presence === 'online' ? '' : ' member--offline'}`}>
            <Avatar name={m.user.displayName} seed={m.user.id} src={mediaUrl(m.user.avatarUrl)} size={36} presence={m.presence} />
            <div className="member-names">
              <span className="member-name">{m.user.displayName}</span>
              <span className="member-sub">
                {m.isOwner ? `@${m.user.username} · dono` : m.presence === 'online' ? `@${m.user.username}` : 'Offline'}
              </span>
            </div>
            {canRemove && m.user.id !== meId && (
              <button className="icon-button member-remove" aria-label="Remover do grupo" onClick={() => setRemoving(m)}>
                <XIcon size={16} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )

  return (
    <aside className="members" aria-label="Membros">
      {section('ONLINE', online)}
      {section('OFFLINE', offline)}

      {removing && (
        <ConfirmModal title={`Remover ${removing.user.displayName} do grupo?`} confirmLabel="Remover"
          onConfirm={() => onRemove(removing.user.id)} onClose={() => setRemoving(null)} />
      )}
    </aside>
  )
}
