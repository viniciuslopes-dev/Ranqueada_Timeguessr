import { useState, type FormEvent } from 'react'
import { ArrowRight, BarChart3, Radio, Sparkles, Users } from 'lucide-react'
import { Brand } from './ui'

type Props = {
  isDemo: boolean
  initialCode: string
  busy: boolean
  error: string
  onCreate: (name: string, nickname: string) => Promise<void>
  onJoin: (code: string, nickname: string) => Promise<void>
  onDemo: () => Promise<void>
}

export function Onboarding({ isDemo, initialCode, busy, error, onCreate, onJoin, onDemo }: Props) {
  const [mode, setMode] = useState<'create' | 'join'>(initialCode ? 'join' : 'create')
  const [roomName, setRoomName] = useState('Liga dos Crononautas')
  const [nickname, setNickname] = useState('')
  const [code, setCode] = useState(initialCode)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (mode === 'create') await onCreate(roomName.trim(), nickname.trim())
    else await onJoin(code.trim().toUpperCase(), nickname.trim())
  }

  return (
    <main className="onboarding">
      <div className="onboarding__glow onboarding__glow--one" />
      <div className="onboarding__glow onboarding__glow--two" />
      <section className="onboarding__hero">
        <Brand />
        <span className="eyebrow"><Sparkles size={14} /> Cada palpite vira história</span>
        <h1>Quem domina o <em>tempo</em> e o mapa?</h1>
        <p>Registre as partidas da turma, acompanhe as viradas e transforme cada Daily em uma disputa épica.</p>
        <div className="feature-row">
          <span><BarChart3 size={18} /> Ranking vivo</span>
          <span><Radio size={18} /> Tempo real</span>
          <span><Users size={18} /> Feito para amigos</span>
        </div>
      </section>

      <section className="access-card">
        <div className="segmented segmented--wide" role="tablist" aria-label="Acesso à sala">
          <button className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')} type="button">Criar uma liga</button>
          <button className={mode === 'join' ? 'active' : ''} onClick={() => setMode('join')} type="button">Entrar com código</button>
        </div>

        {isDemo && (
          <div className="local-notice">
            <strong>Modo local ativo</strong>
            <span>Você pode testar tudo agora. Para compartilhar com amigos, conecte o Neon seguindo o guia do projeto.</span>
          </div>
        )}

        <form onSubmit={submit}>
          {mode === 'create' ? (
            <label className="field">
              <span>Nome da liga</span>
              <input value={roomName} onChange={(event) => setRoomName(event.target.value)} maxLength={40} required placeholder="Ex.: Reis do Daily" />
            </label>
          ) : (
            <label className="field">
              <span>Código da liga</span>
              <input className="code-input" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={6} minLength={6} required placeholder="ABC123" autoCapitalize="characters" />
            </label>
          )}
          <label className="field">
            <span>Como seus amigos te chamam?</span>
            <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={24} required placeholder="Seu nick" autoComplete="nickname" />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button primary-button--large" disabled={busy} type="submit">
            {busy ? 'Preparando…' : mode === 'create' ? 'Criar minha liga' : 'Entrar na liga'}
            {!busy && <ArrowRight size={19} />}
          </button>
        </form>

        {isDemo && (
          <button className="demo-link" type="button" onClick={onDemo} disabled={busy}>
            <span>ou explorar uma liga de demonstração</span><ArrowRight size={16} />
          </button>
        )}
      </section>
      <p className="onboarding__footer">Não oficial e feito com carinho para fãs de TimeGuessr.</p>
    </main>
  )
}
