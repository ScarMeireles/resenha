import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import './Modal.css'

interface ModalProps {
  title: string
  onClose(): void
  children: ReactNode
}

const FOCUSABLE = 'input:not(:disabled), textarea:not(:disabled), button:not(:disabled)'

/** Janela sobre um fundo escuro: Esc fecha, o foco vai para o primeiro campo e volta para quem abriu ao fechar. */
export function Modal({ title, onClose, children }: ModalProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current()
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [])

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef}>
        <h2 className="modal-title" id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  )
}

interface ConfirmProps {
  title: string
  message?: string
  confirmLabel: string
  danger?: boolean
  onConfirm(): Promise<void>
  onClose(): void
}

/** Pergunta "tem certeza?" com Cancelar/confirmar. Mostra o erro da API se a ação falhar. */
export function ConfirmModal({ title, message, confirmLabel, danger = true, onConfirm, onClose }: ConfirmProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      {message && <p className="modal-text">{message}</p>}
      {error && <p className="modal-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="modal-cancel" onClick={onClose}>Cancelar</button>
        <button type="button" className={danger ? 'modal-danger' : 'modal-confirm'} disabled={busy} onClick={() => void confirm()}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

interface FormModalProps {
  title: string
  submitLabel: string
  /** Impede o envio (campos incompletos). */
  canSubmit: boolean
  onSubmit(): Promise<void>
  onClose(): void
  children: ReactNode
}

/** Modal com formulário: botões Cancelar/enviar, erro da API embaixo e fechamento ao dar certo. */
export function FormModal({ title, submitLabel, canSubmit, onSubmit, onClose, children }: FormModalProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || !canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)}>
        {children}
        {error && <p className="modal-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="modal-cancel" onClick={onClose}>Cancelar</button>
          <button type="submit" className="modal-confirm" disabled={busy || !canSubmit}>{submitLabel}</button>
        </div>
      </form>
    </Modal>
  )
}
