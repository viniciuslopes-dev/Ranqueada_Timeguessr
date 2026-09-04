import { useMemo, useState, type FormEvent } from 'react'
import { CalendarDays, Check, CheckCircle2, Clock3, Copy, Globe2, Keyboard, ClipboardPaste, Share2, Trophy, Trash2 } from 'lucide-react'
import type { GameMatch, ImportResultInput, MatchInput, MatchUpdateInput, Player, Room } from '../types'
import { localToday, resolvePeriod, type Period } from '../lib/period'
import { parseTimeGuessrShare } from '../lib/timeguessrParser'
import { PLAYER_COLORS, PlayerAvatar, Sheet } from './ui'

type MatchSheetProps = {
  players: Player[]
  matchNumber: number
  busy: boolean
  onClose: () => void
  onSave: (input: MatchInput) => Promise<void>
  onImport: (input: ImportResultInput) => Promise<void>
}

export function MatchSheet({ players, matchNumber, busy, onClose, onSave, onImport }: MatchSheetProps) {
  const [mode, setMode] = useState<'paste' | 'manual'>('paste')
  const [title, setTitle] = useState(`Daily #${matchNumber}`)
  const [playedAt, setPlayedAt] = useState(localToday())
  const [active, setActive] = useState<Record<string, boolean>>(() => Object.fromEntries(players.map((player) => [player.id, true])))
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(players.map((player) => [player.id, ''])))
  const [error, setError] = useState('')
  const [shareText, setShareText] = useState('')
  const [selectedPlayerId, setSelectedPlayerId] = useState(players[0]?.id ?? '')
  const [importDate, setImportDate] = useState(localToday())
  const [readingClipboard, setReadingClipboard] = useState(false)
  const [clipboardError, setClipboardError] = useState('')

  const activeCount = Object.values(active).filter(Boolean).length
  const parsed = useMemo(() => {
    if (!shareText.trim()) return { result: null, error: '' }
    try { return { result: parseTimeGuessrShare(shareText), error: '' } }
    catch (parseError) { return { result: null, error: parseError instanceof Error ? parseError.message : 'Não foi possível ler o resultado.' } }
  }, [shareText])

  const submitManual = async (event: FormEvent) => {
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

  const submitImport = async (event: FormEvent) => {
    event.preventDefault()
    if (!parsed.result) return
    if (!selectedPlayerId) return setError('Escolha quem fez esse resultado.')
    setError('')
    await onImport({ playerId: selectedPlayerId, playedAt: importDate, ...parsed.result })
  }

  const pasteFromClipboard = async () => {
    setClipboardError('')
    setReadingClipboard(true)
    try {
      if (!navigator.clipboard?.readText) throw new Error('clipboard-indisponivel')
      const copied = await navigator.clipboard.readText()
      if (!copied.trim()) throw new Error('clipboard-vazio')
      setShareText(copied.trim())
    } catch {
      setClipboardError('O navegador nao liberou a area de transferencia. Toque no campo e use Colar.')
    } finally {
      setReadingClipboard(false)
    }
  }

  return (
    <Sheet title="Nova partida" subtitle="Cole o resultado do WhatsApp ou digite os placares" onClose={onClose}>
      <div className="segmented segmented--wide entry-mode" aria-label="Forma de cadastrar resultado">
        <button className={mode === 'paste' ? 'active' : ''} type="button" onClick={() => { setMode('paste'); setError('') }}><ClipboardPaste size={17} /> Colar resultado</button>
        <button className={mode === 'manual' ? 'active' : ''} type="button" onClick={() => { setMode('manual'); setError('') }}><Keyboard size={17} /> Digitar placares</button>
      </div>

      {mode === 'paste' ? (
        <form className="sheet-form" onSubmit={submitImport}>
          <div className="field paste-field">
            <div className="paste-field__heading">
              <label htmlFor="timeguessr-share">Mensagem compartilhada pelo TimeGuessr</label>
              <button className="clipboard-button" type="button" disabled={readingClipboard} onClick={pasteFromClipboard}>
                <ClipboardPaste size={15} /> {readingClipboard ? 'Colando…' : 'Colar do WhatsApp'}
              </button>
            </div>
            <textarea
              id="timeguessr-share"
              autoFocus
              value={shareText}
              onChange={(event) => setShareText(event.target.value)}
              placeholder={'TimeGuessr #1191 — 27,839/50,000\n1️⃣ 🏆6.756 · 📅 5y · 🌍 1288.5km\n…'}
              rows={7}
            />
            <small>Copie a mensagem inteira no WhatsApp e cole aqui.</small>
          </div>

          {clipboardError && <p className="form-error" role="alert">{clipboardError}</p>}
          {parsed.error && <p className="form-error" role="alert">{parsed.error}</p>}
          {parsed.result && (
            <div className="import-preview">
              <header>
                <span><CheckCircle2 size={18} /> Resultado reconhecido</span>
                <strong>#{parsed.result.gameNumber} · {parsed.result.totalScore.toLocaleString('pt-BR')} pts</strong>
              </header>
              <div className="round-preview" aria-label="Detalhes das cinco rodadas">
                {parsed.result.rounds.map((round) => (
                  <div key={round.roundNumber}>
                    <b>{round.roundNumber}</b>
                    <span><Trophy size={13} /> {round.roundScore.toLocaleString('pt-BR')}</span>
                    <span><Clock3 size={13} /> {round.yearError} ano{round.yearError === 1 ? '' : 's'}</span>
                    <span><Globe2 size={13} /> {round.distanceKm.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="import-assignment">
            <div className="score-heading"><div><strong>De quem é o resultado?</strong><span>Vincule ao nick cadastrado</span></div></div>
            <div className="import-player-list" role="radiogroup" aria-label="Jogador do resultado">
              {players.map((player) => (
                <button
                  className={selectedPlayerId === player.id ? 'active' : ''}
                  type="button"
                  role="radio"
                  aria-checked={selectedPlayerId === player.id}
                  key={player.id}
                  onClick={() => setSelectedPlayerId(player.id)}
                >
                  <PlayerAvatar player={player} size="sm" />
                  <span>{player.nickname}</span>
                  <i>{selectedPlayerId === player.id && <Check size={12} />}</i>
                </button>
              ))}
            </div>
          </div>

          <label className="field field--date import-date">
            <span>Data da partida</span>
            <input type="date" value={importDate} onChange={(event) => setImportDate(event.target.value)} required />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button primary-button--large" type="submit" disabled={busy || !parsed.result}>
            {busy ? 'Importando resultado…' : parsed.result ? `Importar para ${players.find((player) => player.id === selectedPlayerId)?.nickname ?? 'jogador'}` : 'Cole um resultado para continuar'}
          </button>
        </form>
      ) : (
      <form className="sheet-form" onSubmit={submitManual}>
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
      )}
    </Sheet>
  )
}

type MatchEditSheetProps = {
  match: GameMatch
  busy: boolean
  onClose: () => void
  onSave: (input: MatchUpdateInput) => Promise<void>
}

export function MatchEditSheet({ match, busy, onClose, onSave }: MatchEditSheetProps) {
  const [title, setTitle] = useState(match.title)
  const [playedAt, setPlayedAt] = useState(match.played_at.slice(0, 10))
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const cleanTitle = title.trim()
    if (!cleanTitle) return setError('Dê um nome para a partida.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(playedAt)) return setError('Escolha uma data válida.')
    setError('')
    await onSave({ title: cleanTitle, playedAt })
  }

  return (
    <Sheet title="Editar partida" subtitle="Corrija a data ou o nome sem relançar os placares" onClose={onClose}>
      <form className="sheet-form" onSubmit={submit}>
        {typeof match.game_number === 'number' && (
          <p className="edit-match-note">
            <CalendarDays size={15} />
            Jogo oficial #{match.game_number}. Os placares e as rodadas continuam intactos — e a ordem do ranking segue o número oficial, não a data.
          </p>
        )}
        <label className="field field--date">
          <span>Data da partida</span>
          <input autoFocus type="date" value={playedAt} onChange={(event) => setPlayedAt(event.target.value)} required />
        </label>
        <label className="field">
          <span>Nome da partida</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={50} placeholder="Daily #123" />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button primary-button--large" type="submit" disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </form>
    </Sheet>
  )
}

type PeriodSheetProps = {
  period: Period
  onClose: () => void
  onSave: (period: Period) => void
}

export function PeriodSheet({ period, onClose, onSave }: PeriodSheetProps) {
  const current = resolvePeriod(period) ?? { from: localToday(), to: localToday() }
  const [from, setFrom] = useState(current.from)
  const [to, setTo] = useState(current.to)
  const [error, setError] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!from || !to) return setError('Preencha as duas datas.')
    setError('')
    // resolvePeriod endireita o intervalo se as datas vierem trocadas
    onSave({ preset: 'custom', from, to })
  }

  return (
    <Sheet title="Escolher período" subtitle="Veja o ranking apenas entre duas datas" onClose={onClose}>
      <form className="sheet-form" onSubmit={submit}>
        <div className="field-grid field-grid--even">
          <label className="field field--date">
            <span>De</span>
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} required />
          </label>
          <label className="field field--date">
            <span>Até</span>
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} required />
          </label>
        </div>
        <p className="edit-match-note">
          <CalendarDays size={15} />
          O filtro usa a data em que a partida aconteceu. Se alguma estiver errada, corrija pelo lápis na aba Partidas.
        </p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button primary-button--large" type="submit">Aplicar período</button>
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
