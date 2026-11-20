import { useEffect, useRef, useState } from 'react'
import { PlusIcon, UserPlusIcon, UsersIcon } from '../components/Icons'
import { UserPanel } from '../components/UserPanel'
import { useRealtime } from '../hooks/useRealtime'
import type { User } from '../lib/api'
import { initials } from '../lib/groups'
import { ChatView } from './ChatView'
import { FriendsView } from './FriendsView'
import { CreateGroupModal } from './GroupModals'
import { GroupSidebar } from './GroupSidebar'
import { MembersPanel } from './MembersPanel'
import './Shell.css'
import './Chat.css'

interface Props {
  user: User
  token: string
  notice?: string
  onSignOut(): void
}

/**
 * Layout dos mockups: trilho de grupos | barra lateral | conteúdo (| membros, dentro de um grupo).
 * Amigos, grupos e mensagens vêm da API e se atualizam em tempo real por uma conexão só.
 */
export function Shell({ user, token, notice, onSignOut }: Props) {
  const [banner, setBanner] = useState(notice)
  const data = useRealtime(token)
  const { friends, groups } = data
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const addFriendInput = useRef<HTMLInputElement>(null)
  const pending = friends.incoming.length
  const group = groups.find((g) => g.id === openId)

  // Se o grupo aberto sumir (saí, fui removido), volta para Amigos.
  useEffect(() => {
    if (openId && data.groupsLoaded && !group) setOpenId(null)
  }, [openId, data.groupsLoaded, group])

  return (
    <div className={`shell${group ? ' shell--group' : ''}`}>
      <nav className="rail" aria-label="Grupos">
        <div className="rail-item">
          {!group && <span className="rail-pill" aria-hidden="true" />}
          <button className="rail-button rail-home" aria-label="Amigos" title="Amigos" aria-current={group ? undefined : 'page'}
            onClick={() => setOpenId(null)}>
            R
          </button>
        </div>
        <div className="rail-divider" aria-hidden="true" />
        {groups.map((g) => (
          <div className="rail-item" key={g.id}>
            {g.id === group?.id && <span className="rail-pill" aria-hidden="true" />}
            <button className="rail-button rail-group" aria-label={g.name} title={g.name} aria-current={g.id === group?.id ? 'page' : undefined}
              onClick={() => setOpenId(g.id)}>
              {initials(g.name)}
            </button>
          </div>
        ))}
        <button className="rail-add" aria-label="Criar grupo" title="Criar grupo" onClick={() => setCreating(true)}>
          <PlusIcon size={22} />
        </button>
      </nav>

      {group ? (
        <>
          <GroupSidebar group={group} user={user} friends={friends.friends} onSignOut={onSignOut}
            onRename={(name) => data.renameGroup(group.id, name)}
            onAddMembers={(ids) => data.addMembers(group.id, ids)}
            onLeave={() => data.removeMember(group.id, user.id, true)} />
          <ChatView key={group.id} group={group} user={user} chat={data.messages[group.id]}
            onLoad={() => data.loadMessages(group.id)}
            onLoadOlder={(before) => data.loadOlder(group.id, before)}
            onSend={(text, images) => data.sendMessage(group.id, text, images)}
            onDelete={(messageId) => data.deleteMessage(group.id, messageId)} />
          <MembersPanel group={group} meId={user.id} onRemove={(userId) => data.removeMember(group.id, userId, false)} />
        </>
      ) : (
        <>
          <aside className="sidebar">
            <header className="pane-header">
              <h1 className="sidebar-title">Início</h1>
            </header>
            <div className="sidebar-body">
              <button className="sidebar-link" aria-current="page">
                <UsersIcon /> Amigos
                {pending > 0 && <span className="sidebar-badge" aria-label={`${pending} pedidos recebidos`}>{pending}</span>}
              </button>
              <h2 className="sidebar-section">Conversas</h2>
              <p className="sidebar-empty">Seus grupos aparecem no trilho à esquerda.</p>
            </div>
            <UserPanel user={user} onSignOut={onSignOut} />
          </aside>

          <main className="content">
            <header className="pane-header content-header">
              <UsersIcon size={20} />
              <h2>Amigos</h2>
              <button className="pill-button" onClick={() => addFriendInput.current?.focus()}>
                <UserPlusIcon size={16} /> Adicionar amigo
              </button>
            </header>

            {banner && (
              <div className="content-banner" role="alert">
                <span>{banner}</span>
                <button className="btn-link" onClick={() => setBanner(undefined)}>Fechar</button>
              </div>
            )}

            <FriendsView state={friends} inputRef={addFriendInput} onSendRequest={data.sendRequest} onAccept={data.accept}
              onRemoveRequest={data.removeRequest} />
          </main>
        </>
      )}

      {creating && (
        <CreateGroupModal friends={friends.friends} onClose={() => setCreating(false)}
          onCreate={async (name, memberIds) => {
            const created = await data.createGroup(name, memberIds)
            setOpenId(created.id)
          }} />
      )}
    </div>
  )
}
