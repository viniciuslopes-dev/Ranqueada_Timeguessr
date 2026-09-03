import { useMemo, useState, type FormEvent } from 'react'
import { Check, Copy, Share2, Trash2 } from 'lucide-react'
import type { MatchInput, Player, Room } from '../types'
import { PLAYER_COLORS, PlayerAvatar, Sheet } from './ui'

type MatchSheetProps = {
  players: Player[]
  matchNumber: number
  busy: boolean
  onClose: () => void
  onSave: (input: MatchInput) => Promise<void>
}

export function MatchSheet({ players, matchNumber, busy, onClose, onSave }: MatchSheetProps) {
  const [title, setTitle] = useState(`Daily #${matchNumber}`)
  const [playedAt, setPlayedAt] = useState(new Date().toISOString().slice(0, 10))
  const [active, setActive] = useState<Record<string, boolean>>(() => Object.fromEntries(players.map((player) => [player.id, true])))
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(players.map((player) => [player.id, ''])))
  const [error, setError] = useState('')

  const activeCount = Object.values(active).filter(Boolean).length

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    const scores = players
      .filter((player) => active[player.id])
      .map((player) => ({ playerId: player.id, score: Number(values[player.id]) }))
    if (!scores.length) return setError('Selecione pelo menos um jogador.')
    if (scores.some((item) => !Number.isFinite(item.score) || item.score < 0 || item.score > 50000)) {
      return setError('Preencha os placares entre 0 e 50.000.')
    }
    await onSave({ title: title.trim() || `Partida #${matchNumber}`, playedAt, scores })
  }

  return (
    <Sheet title="Nova partida" subtitle="Vale até 50.000 pontos" onClose={onClose}>
      <form className="sheet-form" onSubmit={submit}>
        <div className="field-grid">
          <label className="field">
            <span>Nome da partida</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={50} placeholder="Daily #123" />
          </label>
          <label className="field field--date">
            <span>Data</span>
            <input type="date" value={playedAt} onChange={(event) => setPlayedAt(event.target.value)} required />
          </label>
        </div>

        <div className="score-heading">
          <div><strong>Placares</strong><span>{activeCount} participante{activeCount === 1 ? '' : 's'}</span></div>
          <span>máx. 50.000</span>
        </div>

        <div className="score-inputs">
          {players.map((player) => (
            <div className={`score-input ${active[player.id] ? '' : 'score-input--inactive'}`} key={player.id}>
              <button
                type="button"
                className="player-toggle"
                aria-label={`${active[player.id] ? 'Remover' : 'Adicionar'} ${player.nickname}`}
                onClick={() => setActive((current) => ({ ...current, [player.id]: !current[player.id] }))}
              >
                <PlayerAvatar player={player} size="sm" />
                <span>{player.nickname}</span>
                <i>{active[player.id] && <Check size={13} />}</i>
              </button>
              <input
                aria-label={`Pontuação de ${player.nickname}`}
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="00.000"
                disabled={!active[player.id]}
                value={values[player.id]}
                onChange={(event) => setValues((current) => ({ ...current, [player.id]: event.target.value.replace(/\D/g, '').slice(0, 5) }))}
              />
            </div>
          ))}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button primary-button--large" type="submit" disabled={busy}>
          {busy ? 'Salvando placares…' : 'Salvar e ver o ranking'}
        </button>
      </form>
    </Sheet>
  )
}

type PlayerSheetProps = {
  player?: Player
  busy: boolean
  onClose: () => void
  onSave: (nickname: string, color: string) => Promise<void>
  onDelete?: () => Promise<void>
}

export function PlayerSheet({ player, busy, onClose, onSave, onDelete }: PlayerSheetProps) {
  const [nickname, setNickname] = useState(player?.nickname ?? '')
  const [color, setColor] = useState(player?.color ?? PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)])
  const [confirmDelete, setConfirmDelete] = useState(false)

  const preview = useMemo(() => ({ nickname: nickname || '?', color }), [nickname, color])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await onSave(nickname.trim(), color)
  }

  return (
    <Sheet title={player ? 'Editar jogador' : 'Novo jogador'} subtitle={player ? 'Atualize o perfil da lenda' : 'Mais um crononauta na disputa'} onClose={onClose}>
      <form className="sheet-form" onSubmit={submit}>
        <div className="player-preview">
          <PlayerAvatar player={preview} size="xl" />
          <div><strong>{nickname || 'Seu apelido'}</strong><span>Pronto para viajar no tempo</span></div>
        </div>
        <label className="field">
          <span>Nick</span>
          <input autoFocus value={nickname} onChange={(event) => setNickname(event.target.value)} required maxLength={24} placeholder="Ex.: Mestre dos Mapas" />
        </label>
        <fieldset className="color-picker">
          <legend>Escolha uma cor</legend>
          <div>
            {PLAYER_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                className={color === option ? 'active' : ''}
                style={{ '--swatch': option } as React.CSSProperties}
                onClick={() => setColor(option)}
                aria-label={`Usar cor ${option}`}
              >
                {color === option && <Check size={16} />}
              </button>
            ))}
          </div>
        </fieldset>
        <button className="primary-button primary-button--large" disabled={busy} type="submit">
          {busy ? 'Salvando…' : player ? 'Salvar alterações' : 'Adicionar ao ranking'}
        </button>
        {player && onDelete && (
          confirmDelete ? (
            <div className="delete-confirm">
              <span>Apagar {player.nickname} e seus placares?</span>
              <button type="button" disabled={busy} onClick={onDelete}>Sim, apagar</button>
              <button type="button" onClick={() => setConfirmDelete(false)}>Cancelar</button>
            </div>
          ) : (
            <button className="danger-link" type="button" onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> Remover jogador</button>
          )
        )}
      </form>
    </Sheet>
  )
}

export function ShareSheet({ room, onClose, onToast }: { room: Room; onClose: () => void; onToast: (message: string) => void }) {
  const link = `${window.location.origin}${window.location.pathname}?room=${room.invite_code}`
  const message = `Entre na liga “${room.name}” no CronoRank! Código: ${room.invite_code}`

  const copy = async (value: string, feedback: string) => {
    await navigator.clipboard.writeText(value)
    onToast(feedback)
  }

  const share = async () => {
    if (navigator.share) {
      await navigator.share({ title: room.name, text: message, url: link })
    } else {
      await copy(`${message}\n${link}`, 'Convite copiado!')
    }
  }

  return (
    <Sheet title="Chamar a galera" subtitle="Quem tiver o código pode entrar na liga" onClose={onClose}>
      <div className="share-content">
        <div className="invite-ticket">
          <span>Código da liga</span>
          <strong>{room.invite_code}</strong>
          <button type="button" onClick={() => copy(room.invite_code, 'Código copiado!')}><Copy size={16} /> Copiar código</button>
        </div>
        <button className="primary-button primary-button--large" type="button" onClick={share}><Share2 size={19} /> Compartilhar convite</button>
        <p>Seus amigos só precisam abrir o link, escolher um nick e pronto.</p>
      </div>
    </Sheet>
  )
}
