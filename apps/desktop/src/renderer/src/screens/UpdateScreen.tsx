import { formatProgress, type UpdateProgress } from '../../../main/updateRules'
import './UpdateScreen.css'

/** Tela cheia de atualização obrigatória (R13): só o progresso, sem botão de cancelar. */
export function UpdateScreen({ progress }: { progress: UpdateProgress | null }) {
  const percent = Math.round(progress?.percent ?? 0)
  const installing = percent >= 100
  return (
    <div className="splash update-screen" role="status" aria-live="polite">
      <span className="brand-mark" aria-hidden="true">R</span>
      <h1 className="update-title">{installing ? 'Instalando…' : 'Atualizando…'}</h1>
      <p>{installing ? 'O Resenha vai fechar e abrir de novo sozinho.' : 'Baixando a versão nova do Resenha.'}</p>
      <div className="update-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div className="update-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="update-detail">
        {percent}%{progress && formatProgress(progress) ? ` · ${formatProgress(progress)}` : ''}
      </p>
    </div>
  )
}

/** Atualização que não deu certo: mostra o motivo e deixa tentar de novo. */
export function UpdateErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="splash update-screen" role="alert">
      <span className="brand-mark" aria-hidden="true">R</span>
      <h1 className="update-title">Não deu para atualizar</h1>
      <p>{message}</p>
      <button className="btn-primary" onClick={onRetry}>Tentar de novo</button>
    </div>
  )
}
