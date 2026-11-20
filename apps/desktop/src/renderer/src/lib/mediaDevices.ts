export interface DeviceOption {
  id: string
  label: string
}

const FALLBACK_LABEL: Partial<Record<MediaDeviceKind, string>> = {
  audioinput: 'Microfone',
  audiooutput: 'Saída de som',
  videoinput: 'Câmera',
}

/** Opções de um tipo de aparelho. Tira 'default'/'communications' (o Windows os duplica; o app já tem "Padrão do sistema"), ids vazios e repetidos. */
export function toDeviceOptions(devices: Pick<MediaDeviceInfo, 'deviceId' | 'label' | 'kind'>[], kind: MediaDeviceKind): DeviceOption[] {
  const seen = new Set<string>()
  const options: DeviceOption[] = []
  for (const d of devices) {
    if (d.kind !== kind || !d.deviceId || d.deviceId === 'default' || d.deviceId === 'communications' || seen.has(d.deviceId)) continue
    seen.add(d.deviceId)
    options.push({ id: d.deviceId, label: d.label || `${FALLBACK_LABEL[kind] ?? 'Aparelho'} ${options.length + 1}` })
  }
  return options
}

export async function listMediaDevices(): Promise<{ audioInput: DeviceOption[]; audioOutput: DeviceOption[]; videoInput: DeviceOption[] }> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return {
    audioInput: toDeviceOptions(devices, 'audioinput'),
    audioOutput: toDeviceOptions(devices, 'audiooutput'),
    videoInput: toDeviceOptions(devices, 'videoinput'),
  }
}
