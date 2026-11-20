import { useEffect, useState } from 'react'
import { listMediaDevices, type DeviceOption } from '../lib/mediaDevices'
import { QUALITY_PRESETS, type MediaSettings, type QualityPreset } from '../lib/mediaSettings'
import { Modal } from './Modal'
import './MediaSettingsModal.css'

interface Props {
  settings: MediaSettings
  onChange(next: MediaSettings): void
  onClose(): void
}

interface Devices {
  audioInput: DeviceOption[]
  audioOutput: DeviceOption[]
  videoInput: DeviceOption[]
}

const NO_DEVICES: Devices = { audioInput: [], audioOutput: [], videoInput: [] }
const QUALITIES: QualityPreset[] = ['economia', 'normal', 'alta']

function DeviceSelect({ label, value, options, onChange }: { label: string; value: string | null; options: DeviceOption[]; onChange(id: string | null): void }) {
  // Se o aparelho escolhido foi desconectado, mantém a opção visível em vez de mostrar "Padrão" por engano.
  const missing = value && !options.some((o) => o.id === value)
  return (
    <label className="media-field">
      <span className="modal-label">{label}</span>
      <select className="modal-input media-select" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Padrão do sistema</option>
        {missing && <option value={value}>Aparelho desconectado</option>}
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  )
}

/** Escolha de microfone, saída de som, câmera, supressão de ruído e qualidade. Cada mudança vale na hora. */
export function MediaSettingsModal({ settings, onChange, onClose }: Props) {
  const [devices, setDevices] = useState<Devices>(NO_DEVICES)

  useEffect(() => {
    let alive = true
    const load = () => listMediaDevices().then((d) => alive && setDevices(d)).catch(() => undefined)
    void load()
    navigator.mediaDevices.addEventListener('devicechange', load)
    return () => {
      alive = false
      navigator.mediaDevices.removeEventListener('devicechange', load)
    }
  }, [])

  const set = (patch: Partial<MediaSettings>) => onChange({ ...settings, ...patch })

  return (
    <Modal title="Voz e vídeo" onClose={onClose}>
      <DeviceSelect label="Microfone" value={settings.audioInputId} options={devices.audioInput} onChange={(id) => set({ audioInputId: id })} />
      <DeviceSelect label="Saída de som" value={settings.audioOutputId} options={devices.audioOutput} onChange={(id) => set({ audioOutputId: id })} />
      <DeviceSelect label="Câmera" value={settings.videoInputId} options={devices.videoInput} onChange={(id) => set({ videoInputId: id })} />

      <label className="media-check">
        <input type="checkbox" checked={settings.noiseSuppression} onChange={(e) => set({ noiseSuppression: e.target.checked })} />
        <span>
          Supressão de ruído
          <small>Corta barulho de fundo, como teclado e ventilador.</small>
        </span>
      </label>

      <fieldset className="picker media-quality">
        <legend>Qualidade</legend>
        {QUALITIES.map((q) => (
          <label key={q} className="media-radio">
            <input type="radio" name="quality" value={q} checked={settings.quality === q} onChange={() => set({ quality: q })} />
            <span>
              {QUALITY_PRESETS[q].label}
              <small>{QUALITY_PRESETS[q].description}</small>
            </span>
          </label>
        ))}
        <p className="media-note">A qualidade nova vale na próxima vez que você ligar a câmera ou a tela.</p>
      </fieldset>

      <div className="modal-actions">
        <button type="button" className="modal-cancel" onClick={onClose}>Fechar</button>
      </div>
    </Modal>
  )
}
