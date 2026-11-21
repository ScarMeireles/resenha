import { useEffect, useState } from 'react'
import { useCallContext } from '../hooks/useCall'
import { personAudio } from '../lib/volumePrefs'
import { PopinIcon } from './Icons'
import { PopoutWindow } from './PopoutWindow'
import { Watch } from './Watch'

/**
 * Conteúdo da janela separada: só o vídeo da tela de `call.popoutId` e a mesma barra do palco, com o alfinete
 * "sempre por cima" (desligado ao abrir: a janela é normal por padrão). Se a pessoa sair da chamada, a janela fecha;
 * se ela só parar de compartilhar, a janela espera (a tela volta sozinha se a pessoa trocar a qualidade, por exemplo).
 */
export function ScreenPopout({ nameOf }: { nameOf(userId: string): string }) {
  const call = useCallContext()
  const { popoutId, setPopoutId, participants } = call
  const [pinned, setPinned] = useState(false)
  const person = participants.find((p) => p.id === popoutId)

  useEffect(() => {
    if (popoutId && !person) setPopoutId(null)
  }, [popoutId, person, setPopoutId])

  if (!popoutId || !person) return null
  const name = nameOf(person.id)
  const close = () => setPopoutId(null)
  const togglePin = () => {
    const next = !pinned
    setPinned(next)
    void window.resenha.popout.setAlwaysOnTop(next).catch(() => setPinned(!next))
  }

  return (
    <PopoutWindow title={`Tela de ${name} — Resenha`} onClose={close}>
      {person.screen ? (
        <Watch track={person.screen} inPopout volume={personAudio(call.volumes, person.id).screen} hasAudio={person.screenAudio}
          onVolume={(patch) => call.setPersonVolume(person.id, 'screen', patch)} onPopToggle={close} pinned={pinned} onPin={togglePin} />
      ) : (
        <div className="popped">
          <PopinIcon size={32} />
          <b>A tela de {name} parou</b>
          <span>Ela aparece aqui de novo se voltar a ser compartilhada.</span>
          <button type="button" className="btn-ghost" onClick={close}>Fechar janela</button>
        </div>
      )}
    </PopoutWindow>
  )
}
