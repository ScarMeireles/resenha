import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, type AuthResponse, type User } from './lib/api'
import { AuthScreen } from './screens/AuthScreen'
import { Shell } from './screens/Shell'

type State =
  | { kind: 'loading' }
  | { kind: 'offline'; message: string } // tem login salvo, mas o servidor não respondeu
  | { kind: 'signedOut' }
  | { kind: 'signedIn'; token: string; user: User; notice?: string }

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

  useEffect(() => {
    void resume()
  }, [resume])

  const signIn = useCallback(async (auth: AuthResponse, notice?: string) => {
    await window.resenha.session.save(auth.token)
    setState({ kind: 'signedIn', token: auth.token, user: auth.user, notice })
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
      return <Shell user={state.user} notice={state.notice} onSignOut={signOut} />
  }
}
