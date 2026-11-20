import { useEffect, useState } from 'react'
import type { ScreenSource } from '../../../preload/bridge'
import { filterSources, type ScreenTab } from '../lib/screenSources'
import { Modal } from './Modal'
import './ScreenPicker.css'

interface Props {
  onCancel(): void
  onConfirm(sourceId: string, audio: boolean): void
}

/** Escolha do que compartilhar: telas ou janelas, com miniaturas, e a opção de levar o áudio do computador. */
export function ScreenPicker({ onCancel, onConfirm }: Props) {
  const [sources, setSources] = useState<ScreenSource[] | null>(null)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<ScreenTab>('screen')
  const [selected, setSelected] = useState<string | null>(null)
  const [audio, setAudio] = useState(false)

  useEffect(() => {
    let alive = true
    window.resenha.screen.listSources().then(
      (list) => alive && setSources(list),
      () => alive && setError(true))
    return () => { alive = false }
  }, [])

  const visible = sources ? filterSources(sources, tab) : []
  const chooseTab = (t: ScreenTab) => { setTab(t); setSelected(null) }

  return (
    <Modal title="Compartilhar tela" onClose={onCancel}>
      <div className="screen-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'screen'} className="screen-tab" onClick={() => chooseTab('screen')}>Telas</button>
        <button type="button" role="tab" aria-selected={tab === 'window'} className="screen-tab" onClick={() => chooseTab('window')}>Janelas</button>
      </div>

      {error ? <p className="modal-error" role="alert">Não foi possível listar as telas.</p>
        : !sources ? <p className="picker-empty">Carregando…</p>
        : visible.length === 0 ? <p className="picker-empty">Nada para compartilhar aqui.</p>
        : (
          <ul className="screen-grid">
            {visible.map((s) => (
              <li key={s.id}>
                <button type="button" className={`screen-item${s.id === selected ? ' screen-item--selected' : ''}`}
                  aria-pressed={s.id === selected} onClick={() => setSelected(s.id)}>
                  <img src={s.thumbnail} alt="" className="screen-thumb" />
                  <span className="screen-name">{s.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

      <label className="screen-audio">
        <input type="checkbox" checked={audio} onChange={(e) => setAudio(e.target.checked)} />
        Compartilhar o áudio do computador
      </label>
      <p className="screen-audio-hint">Quem estiver na chamada também ouve o som do seu computador, inclusive as vozes da chamada. Use com fone.</p>

      <div className="modal-actions">
        <button type="button" className="modal-cancel" onClick={onCancel}>Cancelar</button>
        <button type="button" className="modal-confirm" disabled={!selected} onClick={() => selected && onConfirm(selected, audio)}>Compartilhar</button>
      </div>
    </Modal>
  )
}
