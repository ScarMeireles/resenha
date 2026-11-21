import { Avatar } from '../components/Avatar'
import { PhoneIcon } from '../components/Icons'
import { mediaUrl, type User } from '../lib/api'
import { readOnlyNotice, type DirectConversationDto, type DirectMessageDto } from '../lib/dms'
import type { ChatState } from '../lib/groups'
import { presenceLabel, type Presence } from '../lib/presence'
import { ChatView } from './ChatView'

interface Props {
  conversation: DirectConversationDto
  /** Dados atuais da outra pessoa (da lista de amigos, se ainda for amiga). */
  other: User
  /** Só para amigos: de ex-amigo a conversa não mostra presença. */
  presence?: Presence
  /** Já estou numa ligação com essa pessoa? */
  inCall: boolean
  onCall(): void
  user: User
  chat: ChatState<DirectMessageDto> | undefined
  onLoad(): Promise<void>
  onLoadOlder(before: string): Promise<void>
  onSend(text: string, images: File[]): Promise<void>
  onDelete(messageId: string): Promise<void>
}

/** Conversa a dois: o mesmo chat do grupo, com a pessoa e o botão de ligar no cabeçalho. Use `key={conversation.id}`. */
export function DirectChatView({ conversation, other, presence, inCall, onCall, ...chat }: Props) {
  const handle = `@${other.username}`
  const notice = readOnlyNotice(conversation)
  const callLabel = inCall ? 'Voltar à ligação' : notice ? 'Só dá para ligar para amigos' : `Ligar para ${other.displayName}`

  return (
    <ChatView {...chat} placeholder={`Conversar com ${handle}`} readOnly={notice}
      header={
        <>
          <Avatar name={other.displayName} seed={other.id} src={mediaUrl(other.avatarUrl)} size={28} presence={presence} ringColor="var(--bg-main)" />
          <h2 className="dm-head-name">{other.displayName}</h2>
          <span className="dm-head-sub">{presence ? `${handle} · ${presenceLabel[presence]}` : handle}</span>
          <span className="dm-head-actions">
            <button className="icon-button" aria-label={callLabel} title={callLabel} disabled={!inCall && !!notice} onClick={onCall}>
              <PhoneIcon />
            </button>
          </span>
        </>
      }
      intro={
        <div className="dm-intro">
          <Avatar name={other.displayName} seed={other.id} src={mediaUrl(other.avatarUrl)} size={72} />
          <h3>{other.displayName}</h3>
          <p>Início da sua conversa com {handle}. Só vocês dois veem estas mensagens.</p>
        </div>
      } />
  )
}
