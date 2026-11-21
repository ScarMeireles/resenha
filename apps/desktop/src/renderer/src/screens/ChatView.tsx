import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Avatar } from '../components/Avatar'
import { HashIcon, PhoneIcon, PlusIcon, SendIcon, TrashIcon, XIcon } from '../components/Icons'
import { ConfirmModal } from '../components/Modal'
import { mediaUrl, type User } from '../lib/api'
import {
  formatTime, groupByDay, MAX_MESSAGE_LENGTH, validateAttachments,
  type ChatMessage, type ChatState, type GroupDto, type MessageImageDto,
} from '../lib/groups'
import './Chat.css'

interface Props<M extends ChatMessage> {
  /** Conteúdo do cabeçalho (ícone/foto, título e ações). */
  header: ReactNode
  /** Aparece no topo quando não há mensagens mais antigas para carregar (início da conversa). */
  intro?: ReactNode
  /** Texto da conversa vazia (sem `intro`). */
  emptyText?: string
  placeholder: string
  /** Aviso que troca o campo de envio quando não dá para mandar mensagem (conversa só leitura). */
  readOnly?: string | null
  user: User
  chat: ChatState<M> | undefined
  onLoad(): Promise<void>
  onLoadOlder(before: string): Promise<void>
  onSend(text: string, images: File[]): Promise<void>
  onDelete(messageId: string): Promise<void>
}

const NEAR_BOTTOM_PX = 120
const TOP_TRIGGER_PX = 80

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Chat do grupo: cabeçalho com o canal e o botão de entrar na chamada. Use `key={group.id}` para zerar ao trocar de grupo. */
export function GroupChatView({ group, inCall, onJoinCall, ...rest }: Omit<Props<ChatMessage>, 'header' | 'placeholder' | 'emptyText'> & {
  group: GroupDto
  /** Já estou na chamada deste grupo? (muda o texto do botão do cabeçalho) */
  inCall: boolean
  onJoinCall(): void
}) {
  const memberCount = group.members.length
  return (
    <ChatView {...rest} placeholder="Mensagem em conversa" emptyText="Nenhuma mensagem ainda. Diga oi!" header={
      <>
        <HashIcon size={20} />
        <h2>conversa</h2>
        <span className="chat-count">· {memberCount} {memberCount === 1 ? 'membro' : 'membros'}</span>
        <button className="pill-button" onClick={onJoinCall}>
          <PhoneIcon size={16} /> {inCall ? 'Voltar à chamada' : 'Entrar na chamada'}
        </button>
      </>
    } />
  )
}

/** Lista de mensagens (por dia, com imagens, apagar e paginação) e campo de envio. Serve para grupo e DM. */
export function ChatView<M extends ChatMessage>({
  header, intro, emptyText, placeholder, readOnly, user, chat, onLoad, onLoadOlder, onSend, onDelete,
}: Props<M>) {
  const listRef = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  const loadingOlder = useRef(false)
  const olderAnchor = useRef<number | null>(null) // altura da lista antes de carregar mais antigas
  const lastSeen = useRef<{ first?: string; last?: string }>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<M | null>(null)
  const [viewing, setViewing] = useState<MessageImageDto | null>(null)

  const items = chat?.items ?? []
  const hasMore = chat?.hasMore ?? false
  const firstId = items[0]?.id
  const lastMessage = items[items.length - 1]
  const lastId = lastMessage?.id

  useEffect(() => {
    if (!chat) onLoad().catch((e) => setLoadError(errorText(e)))
    // Só ao abrir o grupo; o resync cuida das recargas depois.
  }, [])

  // Posição da rolagem: abre no fim; mantém o que você lia ao entrar mensagens antigas; segue as novas se estava perto do fim.
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const seen = lastSeen.current
    if (olderAnchor.current !== null && firstId !== seen.first) {
      list.scrollTop += list.scrollHeight - olderAnchor.current
      olderAnchor.current = null
    } else if (lastId !== seen.last) {
      if (seen.last === undefined || nearBottom.current || lastMessage?.author.id === user.id) list.scrollTop = list.scrollHeight
    }
    lastSeen.current = { first: firstId, last: lastId }
  }, [firstId, lastId, lastMessage, user.id])

  async function loadOlder() {
    const list = listRef.current
    if (!list || !firstId || loadingOlder.current) return
    loadingOlder.current = true
    olderAnchor.current = list.scrollHeight
    try {
      await onLoadOlder(firstId)
    } catch (e) {
      olderAnchor.current = null
      setLoadError(errorText(e))
    } finally {
      loadingOlder.current = false
    }
  }

  function onScroll() {
    const list = listRef.current
    if (!list) return
    nearBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < NEAR_BOTTOM_PX
    if (list.scrollTop < TOP_TRIGGER_PX && hasMore) void loadOlder()
  }

  const days = groupByDay(items)

  return (
    <main className="content chat">
      <header className="pane-header content-header">{header}</header>

      <div className="chat-list" ref={listRef} onScroll={onScroll}>
        {loadError && <p className="chat-error" role="alert">{loadError}</p>}
        {chat && !hasMore && intro}
        {chat && items.length === 0 && !intro && emptyText && <p className="chat-empty">{emptyText}</p>}
        {days.map((day) => (
          <section key={day.key}>
            <div className="day-separator"><span>{day.label}</span></div>
            {day.messages.map((m) => (
              <Message key={m.id} message={m} mine={m.author.id === user.id} onDelete={() => setDeleting(m)} onOpenImage={setViewing} />
            ))}
          </section>
        ))}
      </div>

      {readOnly ? (
        <div className="composer"><p className="composer-locked" role="status">{readOnly}</p></div>
      ) : (
        <Composer placeholder={placeholder} onSend={onSend} />
      )}

      {deleting && (
        <ConfirmModal title="Apagar mensagem?" confirmLabel="Apagar" onConfirm={() => onDelete(deleting.id)} onClose={() => setDeleting(null)} />
      )}
      {viewing && <ImageViewer image={viewing} onClose={() => setViewing(null)} />}
    </main>
  )
}

function Message({ message, mine, onDelete, onOpenImage }: {
  message: ChatMessage
  mine: boolean
  onDelete(): void
  onOpenImage(image: MessageImageDto): void
}) {
  const { author, deleted, images } = message
  return (
    <article className="msg">
      <Avatar name={author.displayName} seed={author.id} src={mediaUrl(author.avatarUrl)} size={40} ringColor="var(--bg-main)" />
      <div className="msg-body">
        <div className="msg-head">
          <span className="msg-author">{author.displayName}</span>
          <time className="msg-time" dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
        </div>
        {deleted ? (
          <p className="msg-text msg-deleted">mensagem apagada</p>
        ) : (
          <>
            {message.text && <p className="msg-text">{message.text}</p>}
            {images.length > 0 && (
              <div className={`msg-images msg-images--${images.length === 1 ? 'one' : 'grid'}`}>
                {images.map((image) => (
                  <button key={image.url} type="button" className="msg-image" aria-label="Abrir imagem" onClick={() => onOpenImage(image)}>
                    <img src={mediaUrl(image.url) ?? ''} width={image.width} height={image.height} alt="Imagem enviada"
                      style={images.length === 1 ? { aspectRatio: `${image.width} / ${image.height}` } : undefined} loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {mine && !deleted && (
        <button className="icon-button msg-delete" aria-label="Apagar mensagem" onClick={onDelete}><TrashIcon size={16} /></button>
      )}
    </article>
  )
}

function ImageViewer({ image, onClose }: { image: MessageImageDto; onClose(): void }) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label="Imagem" onClick={onClose}>
      <img src={mediaUrl(image.url) ?? ''} alt="Imagem ampliada" />
    </div>
  )
}

interface Attachment {
  file: File
  url: string
}

function Composer({ placeholder, onSend }: { placeholder: string; onSend(text: string, images: File[]): Promise<void> }) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const latest = useRef(attachments)
  latest.current = attachments

  // Libera as miniaturas ao sair da tela.
  useEffect(() => () => latest.current.forEach((a) => URL.revokeObjectURL(a.url)), [])

  // Cresce com o texto, até ~6 linhas.
  useLayoutEffect(() => {
    const el = textarea.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`
  }, [text])

  function addFiles(files: File[]) {
    if (files.length === 0) return
    const problem = validateAttachments([...attachments.map((a) => a.file), ...files])
    if (problem) return setError(problem)
    setError(null)
    setAttachments((current) => [...current, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))])
  }

  function remove(index: number) {
    URL.revokeObjectURL(attachments[index].url)
    setAttachments((current) => current.filter((_, i) => i !== index))
    setError(null)
  }

  function onPaste(event: ClipboardEvent) {
    const images = [...event.clipboardData.files].filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) return
    event.preventDefault()
    addFiles(images)
  }

  async function submit() {
    if (sending || (text.trim() === '' && attachments.length === 0)) return
    setSending(true)
    setError(null)
    try {
      await onSend(text.trim(), attachments.map((a) => a.file))
      attachments.forEach((a) => URL.revokeObjectURL(a.url))
      setAttachments([])
      setText('')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setSending(false)
      textarea.current?.focus()
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <form className="composer" onSubmit={(e) => { e.preventDefault(); void submit() }}>
      {error && <p className="chat-error" role="alert">{error}</p>}
      {attachments.length > 0 && (
        <ul className="attachments">
          {attachments.map((a, i) => (
            <li key={a.url} className="attachment">
              <img src={a.url} alt={a.file.name} />
              <button type="button" className="attachment-remove" aria-label="Remover imagem" onClick={() => remove(i)}>
                <XIcon size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="composer-box">
        <input ref={fileInput} type="file" accept="image/*" multiple hidden
          onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = '' }} />
        <button type="button" className="composer-attach" aria-label="Anexar imagem" onClick={() => fileInput.current?.click()}>
          <PlusIcon size={18} />
        </button>
        <label className="sr-only" htmlFor="composer-text">Mensagem</label>
        <textarea id="composer-text" ref={textarea} rows={1} value={text} maxLength={MAX_MESSAGE_LENGTH}
          placeholder={placeholder} onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown} onPaste={onPaste} />
        <button type="submit" className="composer-send" aria-label="Enviar" disabled={sending}><SendIcon size={18} /></button>
      </div>
    </form>
  )
}
