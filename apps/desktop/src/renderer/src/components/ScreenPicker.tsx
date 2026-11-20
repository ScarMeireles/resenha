import { useEffect, useState } from 'react'
import type { ScreenAudioChoice, ScreenSource } from '../../../preload/bridge'
import {
  appLabel, audioAppList, loadScreenAudioPrefs, saveScreenAudioPrefs, toAudioChoice, type ScreenAudioPrefs,
} from '../lib/screenAudioPrefs'
import { filterSources, type ScreenTab } from '../lib/screenSources'
import { Modal } from './Modal'
import './ScreenPicker.css'

interface Props {
  onCancel(): void
  onConfirm(sourceId: string, audio: ScreenAudioChoice): void
}

/** Escolha do que compartilhar: telas ou janelas, com miniaturas, e o som que vai junto (nenhum, todo, ou todo menos alguns apps). */
export function ScreenPicker({ onCancel, onConfirm }: Props) {
  const [sources, setSources] = useState<ScreenSource[] | null>(null)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<ScreenTab>('screen')
  const [selected, setSelected] = useState<string | null>(null)
  const [audio, setAudio] = useState<ScreenAudioPrefs>(() => loadScreenAudioPrefs(window.localStorage))
  const [playing, setPlaying] = useState<string[] | null>(null)
  const [appsError, setAppsError] = useState(false)

  useEffect(() => {
    let alive = true
    window.resenha.screen.listSources().then(
      (list) => alive && setSources(list),
      () => alive && setError(true))
    window.resenha.screenAudio.listApps().then(
      (list) => alive && setPlaying(list),
      () => alive && setAppsError(true))
    return () => { alive = false }
  }, [])

  const apps = audioAppList(playing ?? [], audio.exes)
  const toggleApp = (exe: string, on: boolean) =>
    setAudio((a) => ({ ...a, exes: on ? [...a.exes, exe] : a.exes.filter((e) => e !== exe) }))
  const confirm = () => {
    if (!selected) return
    saveScreenAudioPrefs(window.localStorage, audio)
    onConfirm(selected, toAudioChoice(audio))
  }

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

      <fieldset className="screen-audio">
        <legend className="screen-audio-title">Som</legend>
        <label className="screen-audio-option">
          <input type="radio" name="screen-audio" checked={audio.mode === 'none'} onChange={() => setAudio((a) => ({ ...a, mode: 'none' }))} />
          Sem áudio
        </label>
        <label className="screen-audio-option">
          <input type="radio" name="screen-audio" checked={audio.mode === 'all'} onChange={() => setAudio((a) => ({ ...a, mode: 'all' }))} />
          Todo o áudio do PC
        </label>
        {audio.mode === 'all' && (
          <p className="screen-audio-hint">Inclui o som do Resenha: quem está na chamada ouve a própria voz de volta, mesmo que você use fone.</p>
        )}
        <label className="screen-audio-option">
          <input type="radio" name="screen-audio" checked={audio.mode === 'except'} onChange={() => setAudio((a) => ({ ...a, mode: 'except' }))} />
          Todo o áudio, menos:
        </label>
        {audio.mode === 'except' && (
          <ul className="screen-audio-apps">
            <li>
              <label className="screen-audio-app">
                <input type="checkbox" checked={audio.resenha} onChange={(e) => setAudio((a) => ({ ...a, resenha: e.target.checked }))} />
                Resenha <span className="screen-audio-app-note">(evita eco das vozes da chamada)</span>
              </label>
            </li>
            {apps.map((exe) => (
              <li key={exe}>
                <label className="screen-audio-app" title={exe}>
                  <input type="checkbox" checked={audio.exes.includes(exe)} onChange={(e) => toggleApp(exe, e.target.checked)} />
                  {appLabel(exe)}
                </label>
              </li>
            ))}
            {appsError ? <li className="screen-audio-hint" role="alert">Não foi possível listar os apps com som.</li>
              : playing === null ? <li className="screen-audio-hint">Procurando apps com som…</li>
              : apps.length === 0 ? <li className="screen-audio-hint">Nenhum outro app está tocando som agora.</li>
              : null}
          </ul>
        )}
      </fieldset>

      <div className="modal-actions">
        <button type="button" className="modal-cancel" onClick={onCancel}>Cancelar</button>
        <button type="button" className="modal-confirm" disabled={!selected} onClick={confirm}>Compartilhar</button>
      </div>
    </Modal>
  )
}
