/**
 * Regras da atualização obrigatória (R13), sem Electron, para dar para testar.
 * Quem usa é o main/updater.ts; a tela recebe o resultado pelo preload.
 */

/** Por que a atualização foi pedida: ao abrir o app, ou porque a API respondeu 426 durante o uso. */
export type UpdateReason = 'startup' | 'required'

export type UpdateOutcome =
  | { kind: 'upToDate' } // nada para instalar: segue o app normal
  | { kind: 'installing' } // baixou; o app vai fechar, instalar em silêncio e reabrir
  | { kind: 'dev' } // app de desenvolvimento (não empacotado) não se atualiza
  | { kind: 'error'; stage: 'check' | 'download'; message: string }

/** Progresso do download, já pronto para a tela. */
export interface UpdateProgress {
  percent: number
  transferred: number
  total: number
}

/** O que a tela faz com o resultado: seguir o app ou mostrar o erro com "Tentar de novo". */
export function nextStep(reason: UpdateReason, outcome: UpdateOutcome): 'continue' | 'wait' | 'showError' {
  switch (outcome.kind) {
    case 'upToDate':
      return 'continue'
    case 'installing':
      return 'wait'
    case 'dev':
      // Ao abrir, em desenvolvimento, segue normal. Se a API barrou, não tem como seguir: mostra o motivo.
      return reason === 'startup' ? 'continue' : 'showError'
    case 'error':
      // Ao abrir, falha só na consulta (servidor fora, nada publicado) não trava: o app mostra a tela de sem
      // conexão de sempre, e se a API barrar a versão o fluxo volta como "required". Download que falhou, trava.
      return reason === 'startup' && outcome.stage === 'check' ? 'continue' : 'showError'
  }
}

/** A API barrou, mas o servidor não tem versão mais nova que esta para baixar. */
export const NOTHING_TO_DOWNLOAD =
  'O servidor pede uma versão nova do Resenha, mas não encontrei a atualização para baixar. Avise quem hospeda o servidor.'

export const DEV_MESSAGE =
  'O servidor pede uma versão nova do Resenha. Em desenvolvimento o app não se atualiza sozinho: suba a "version" do package.json ou apague o latest.yml da pasta de atualizações da API.'

/** Erro do electron-updater em português, sem detalhes técnicos que assustam. */
export function describeUpdateError(stage: 'check' | 'download', error: unknown): string {
  const text = error instanceof Error ? `${(error as { code?: string }).code ?? ''} ${error.message}` : String(error)
  if (/ERR_UPDATER_CHANNEL_FILE_NOT_FOUND|\b404\b/.test(text)) return NOTHING_TO_DOWNLOAD
  if (/sha512 checksum mismatch|ERR_CHECKSUM/i.test(text))
    return 'A atualização baixada veio corrompida. Tente de novo.'
  if (/ENOSPC/.test(text)) return 'Falta espaço no disco para baixar a atualização.'
  return stage === 'check'
    ? 'Não consegui falar com o servidor para atualizar o Resenha. Confira se o Radmin VPN está ligado e tente de novo.'
    : 'O download da atualização falhou. Confira a conexão com o servidor e tente de novo.'
}

/** "12,3 de 146,0 MB" */
export function formatProgress(progress: UpdateProgress): string {
  const mb = (bytes: number) => (bytes / 1024 / 1024).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return progress.total > 0 ? `${mb(progress.transferred)} de ${mb(progress.total)} MB` : ''
}
