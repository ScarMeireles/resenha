import { useId, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { FormModal } from '../components/Modal'
import { mediaUrl } from '../lib/api'
import { sortFriends, type FriendDto } from '../lib/friends'
import { MAX_GROUP_MEMBERS, MAX_GROUP_NAME, type GroupDto } from '../lib/groups'

interface PickerProps {
  friends: FriendDto[]
  selected: ReadonlySet<string>
  /** Quantas pessoas o grupo já teria sem contar as marcadas (você, ou os membros atuais). */
  baseCount: number
  onToggle(userId: string): void
  emptyText: string
}

/** Lista de amigos com caixa de seleção e o contador "N de 10 pessoas". */
function FriendPicker({ friends, selected, baseCount, onToggle, emptyText }: PickerProps) {
  const total = baseCount + selected.size
  const full = total >= MAX_GROUP_MEMBERS

  return (
    <fieldset className="picker">
      <legend>Amigos</legend>
      {friends.length === 0 ? (
        <p className="picker-empty">{emptyText}</p>
      ) : (
        <ul className="picker-list">
          {sortFriends(friends).map(({ user }) => {
            const checked = selected.has(user.id)
            const blocked = full && !checked
            return (
              <li key={user.id}>
                <label className={`picker-row${blocked ? ' picker-row--disabled' : ''}`}>
                  <input type="checkbox" checked={checked} disabled={blocked} onChange={() => onToggle(user.id)} />
                  <Avatar name={user.displayName} seed={user.id} src={mediaUrl(user.avatarUrl)} size={32} />
                  <span className="picker-names">
                    <span className="picker-name">{user.displayName}</span>
                    <span className="picker-handle">@{user.username}</span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
      <p className="picker-count">{total} de {MAX_GROUP_MEMBERS} pessoas</p>
    </fieldset>
  )
}

function useSelection() {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  return { selected, toggle }
}

function NameField({ value, onChange }: { value: string; onChange(value: string): void }) {
  const id = useId()
  return (
    <>
      <label className="modal-label" htmlFor={id}>Nome do grupo</label>
      <input id={id} className="modal-input" value={value} maxLength={MAX_GROUP_NAME} autoComplete="off"
        onChange={(e) => onChange(e.target.value)} />
    </>
  )
}

export function CreateGroupModal({ friends, onCreate, onClose }: {
  friends: FriendDto[]
  onCreate(name: string, memberIds: string[]): Promise<void>
  onClose(): void
}) {
  const [name, setName] = useState('')
  const { selected, toggle } = useSelection()

  return (
    <FormModal title="Criar grupo" submitLabel="Criar grupo" canSubmit={name.trim() !== ''} onClose={onClose}
      onSubmit={() => onCreate(name.trim(), [...selected])}>
      <NameField value={name} onChange={setName} />
      <FriendPicker friends={friends} selected={selected} baseCount={1} onToggle={toggle}
        emptyText="Você ainda não tem amigos para convidar. Dá para criar o grupo só com você e adicionar gente depois." />
    </FormModal>
  )
}

export function AddPeopleModal({ group, friends, onAdd, onClose }: {
  group: GroupDto
  friends: FriendDto[]
  onAdd(userIds: string[]): Promise<void>
  onClose(): void
}) {
  const { selected, toggle } = useSelection()
  const inGroup = new Set(group.members.map((m) => m.user.id))
  const candidates = friends.filter((f) => !inGroup.has(f.user.id))

  return (
    <FormModal title="Adicionar pessoas" submitLabel="Adicionar" canSubmit={selected.size > 0} onClose={onClose}
      onSubmit={() => onAdd([...selected])}>
      <FriendPicker friends={candidates} selected={selected} baseCount={group.members.length} onToggle={toggle}
        emptyText="Todos os seus amigos já estão no grupo." />
    </FormModal>
  )
}

export function RenameGroupModal({ group, onRename, onClose }: {
  group: GroupDto
  onRename(name: string): Promise<void>
  onClose(): void
}) {
  const [name, setName] = useState(group.name)

  return (
    <FormModal title="Renomear grupo" submitLabel="Salvar" canSubmit={name.trim() !== ''} onClose={onClose}
      onSubmit={() => onRename(name.trim())}>
      <NameField value={name} onChange={setName} />
    </FormModal>
  )
}
