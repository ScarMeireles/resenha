import { useCallback, useEffect, useRef, useState } from 'react'
import { DEV_MESSAGE, nextStep, type UpdateProgress, type UpdateReason } from '../../main/updateRules'
import { api, ApiError, type AuthResponse, type User } from './lib/api'
import { onUpgradeRequired } from './lib/appVersion'
import { AuthScreen } from './screens/AuthScreen'
import { Shell } from './screens/Shell'
import { UpdateErrorScreen, UpdateScreen } from './screens/UpdateScreen'

type State =
  | { kind: 'loading' }
  | { kind: 'offline'; message: string } // tem login salvo, mas o servidor não respondeu
  | { kind: 'signedOut' }
  | { kind: 'signedIn'; token: string; user: User; notice?: string }
  | { kind: 'updating'; progress: UpdateProgress | null } // atualização obrigatória baixando (R13)
  | { kind: 'updateError'; reason: UpdateReason; message: string }

export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' })

  // Ao abrir: se há login salvo, renova o token (mais 30 dias). Se o servidor disser que não vale mais, pede login.
  const resume = useCallback(async () => {
    setState({ kind: 'loading' })
    const saved = await window.resenha.session.load()
    if (!saved) return setState({ kind: 'signedOut' })

    try {
      const auth = await api.refresh(saved)
      await window.resenha.session.save(auth.token)
      setState({ kind: 'signedIn', token: auth.token, user: auth.user })
    } catch (error) {
      if (error instanceof ApiError && error.isUnauthorized) {
        await window.resenha.session.clear()
        setState({ kind: 'signedOut' })
      } else {
        // Sem conexão não apaga o login: a pessoa só tenta de novo quando a internet/API voltar.
        setState({ kind: 'offline', message: error instanceof Error ? error.message : String(error) })
      }
    }
  }, [])

  // Atualização obrigatória (R13): ao abrir, e sempre que a API responder 426 (versão velha), baixa e instala
  // sozinho a versão nova. Devolve true quando o app pode seguir normalmente.
  const updating = useRef(false)
  const update = useCallback(async (reason: UpdateReason): Promise<boolean> => {
    if (updating.current) return false
    updating.current = true
    try {
      const outcome = await window.resenha.updates.run(reason)
      const step = nextStep(reason, outcome)
      if (step === 'showError') setState({ kind: 'updateError', reason, message: outcome.kind === 'error' ? outcome.message : DEV_MESSAGE })
      return step === 'continue'
    } finally {
      updating.current = false
    }
  }, [])

  const start = useCallback(async () => {
    setState({ kind: 'loading' })
    if (await update('startup')) await resume()
  }, [update, resume])

  const required = useCallback(async () => {
    if (updating.current) return
    setState({ kind: 'updating', progress: null })
    if (await update('required')) await resume()
  }, [update, resume])

  useEffect(() => {
    void start()
  }, [start])

  useEffect(() => onUpgradeRequired(() => void required()), [required])

  // O download só começa quando há versão nova: o primeiro progresso troca a tela para "Atualizando…".
  useEffect(() => window.resenha.updates.onProgress((progress) => setState({ kind: 'updating', progress })), [])

  const signIn = useCallback(async (auth: AuthResponse, notice?: string) => {
    await window.resenha.session.save(auth.token)
    setState({ kind: 'signedIn', token: auth.token, user: auth.user, notice })
  }, [])

  /**
   * Meus dados mudaram (cartão de perfil ou outra janela). Na troca de @ a API manda um token novo: ele vai
   * para a sessão salva (é o que o app usa ao abrir de novo). O token em memória continua o mesmo de propósito:
   * os dois valem (a sessão é pelo Id e pelo carimbo de segurança, não pelo @) e trocá-lo religaria o tempo
   * real e derrubaria uma chamada em andamento.
   */
  const updateAccount = useCallback(async (user: User, newToken?: string) => {
    if (newToken) await window.resenha.session.save(newToken)
    setState((s) => (s.kind === 'signedIn' ? { ...s, user } : s))
  }, [])

  const signOut = useCallback(async () => {
    await window.resenha.session.clear()
    setState({ kind: 'signedOut' })
  }, [])

  switch (state.kind) {
    case 'loading':
      return (
        <div className="splash" role="status">
          <span className="brand-mark" aria-hidden="true">R</span>
          <p>Abrindo o Resenha…</p>
        </div>
      )
    case 'offline':
      return (
        <div className="splash">
          <span className="brand-mark" aria-hidden="true">R</span>
          <p>{state.message}</p>
          <button className="btn-primary" onClick={() => void resume()}>Tentar de novo</button>
          <button className="btn-link" onClick={() => void signOut()}>Entrar com outra conta</button>
        </div>
      )
    case 'signedOut':
      return <AuthScreen onAuthenticated={signIn} />
    case 'signedIn':
      return <Shell user={state.user} token={state.token} notice={state.notice} onSignOut={signOut} onAccountChange={updateAccount} />
    case 'updating':
      return <UpdateScreen progress={state.progress} />
    case 'updateError':
      return <UpdateErrorScreen message={state.message} onRetry={() => void (state.reason === 'startup' ? start() : required())} />
  }
}
