/**
 * Nome do window.open da janela separada da transmissão: prefixo fixo e um número por abertura (cada janela tem nome
 * próprio, então abrir logo depois de fechar nunca reaproveita a que está fechando). Fica à parte para a tela
 * (renderer) importar sem o Electron.
 */
export const POPOUT_FRAME = 'resenha-transmissao'

const NAME = /^resenha-transmissao-\d{1,9}$/

export const popoutName = (n: number): string => `${POPOUT_FRAME}-${n}`
export const isPopoutName = (frameName: string): boolean => NAME.test(frameName)
