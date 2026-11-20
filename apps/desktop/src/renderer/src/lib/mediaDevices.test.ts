import { describe, expect, it } from 'vitest'
import { toDeviceOptions } from './mediaDevices'

const dev = (deviceId: string, label: string, kind: MediaDeviceKind) => ({ deviceId, label, kind })

describe('toDeviceOptions', () => {
  it('filtra pelo tipo', () => {
    const list = [dev('a', 'Mic A', 'audioinput'), dev('b', 'Fone', 'audiooutput'), dev('c', 'Cam', 'videoinput')]
    expect(toDeviceOptions(list, 'audiooutput')).toEqual([{ id: 'b', label: 'Fone' }])
  })

  it('remove default, communications, ids vazios e repetidos', () => {
    const list = [
      dev('default', 'Padrão', 'audioinput'), dev('communications', 'Comunicações', 'audioinput'),
      dev('', 'Sem id', 'audioinput'), dev('a', 'Mic A', 'audioinput'), dev('a', 'Mic A de novo', 'audioinput'),
    ]
    expect(toDeviceOptions(list, 'audioinput')).toEqual([{ id: 'a', label: 'Mic A' }])
  })

  it('dá nome numerado quando o label vem vazio', () => {
    expect(toDeviceOptions([dev('a', '', 'audioinput'), dev('b', '', 'audioinput')], 'audioinput'))
      .toEqual([{ id: 'a', label: 'Microfone 1' }, { id: 'b', label: 'Microfone 2' }])
    expect(toDeviceOptions([dev('s', '', 'audiooutput')], 'audiooutput')[0].label).toBe('Saída de som 1')
    expect(toDeviceOptions([dev('v', '', 'videoinput')], 'videoinput')[0].label).toBe('Câmera 1')
  })
})
