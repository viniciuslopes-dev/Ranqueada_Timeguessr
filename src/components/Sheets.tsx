import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react'
import { CalendarDays, Check, CheckCircle2, Clock3, Copy, Globe2, Keyboard, ClipboardPaste, Share2, Trophy, Trash2 } from 'lucide-react'
import type { GameMatch, ImportResultInput, MatchInput, MatchUpdateInput, Player, Room, RoundDetail, Score } from '../types'
import { localToday, resolvePeriod, type Period } from '../lib/period'
import { buildMatchSummary, formatScore, formatShortDate, getHardestRound, getRoundValue, ROUND_METRICS, type MatchSummary, type RoundMetric } from '../lib/ranking'
import { formatDistanceLabel } from '../lib/distance'
import { parseTimeGuessrShares, type ParsedTimeGuessrResult } from '../lib/timeguessrParser'
import { PLAYER_COLORS, PlayerAvatar, Sheet } from './ui'

type MatchSheetProps = {
  players: Player[]
  matchNumber: number
  busy: boolean
  onClose: () => void
  onSave: (input: MatchInput) => Promise<void>
  onImport: (inputs: ImportResultInput[]) => Promise<void>
  initialShareText?: string
}

export function MatchSheet({ players, matchNumber, busy, initialShareText, onClose, onSave, onImport }: MatchSheetProps) {
  const [mode, setMode] = useState<'paste' | 'manual'>('paste')
  const [title, setTitle] = useState(`Daily #${matchNumber}`)
  const [playedAt, setPlayedAt] = useState(localToday())
  const [active, setActive] = useState<Record<string, boolean>>(() => Object.fromEntries(players.map((player) => [player.id, true])))
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(players.map((player) => [player.id, ''])))
  const [error, setError] = useState('')
  const [shareText, setShareText] = useState(initialShareText ?? '')
  const [assignments, setAssignments] = useState<string[]>([])
  const [importDate, setImportDate] = useState(localToday())
  const [readingClipboard, setReadingClipboard] = useState(false)
  const [clipboardError, setClipboardError] = useState('')

  const activeCount = Object.values(active).filter(Boolean).length
  const parsed = useMemo(() => {
    if (!shareText.trim()) return { results: [] as ParsedTimeGuessrResult[], error: '' }
    try { return { results: parseTimeGuessrShares(shareText), error: '' } }
    catch (parseError) { return { results: [] as ParsedTimeGuessrResult[], error: parseError instanceof Error ? parseError.message : 'Não foi possível ler o resultado.' } }
  }, [shareText])

  // texto novo invalida as atribuições anteriores; com um resultado só, o
  // primeiro jogador já vem escolhido como antes
  useEffect(() => {
    setAssignments(parsed.results.map(() => parsed.results.length === 1 ? players[0]?.id ?? '' : ''))
    setError('')
  }, [shareText])

  const assign = (index: number, playerId: string) =>
    setAssignments((current) => current.map((value, position) => position === index ? playerId : value))

  const unassigned = parsed.results.some((_, index) => !assignments[index])
  const repeated = parsed.results.some((result, index) =>
    !!assignments[index] && parsed.results.some((other, position) =>
      position < index && other.gameNumber === result.gameNumber && assignments[position] === assignments[index]))

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
    if (!parsed.results.length) return
    if (unassigned) return setError(parsed.results.length > 1 ? 'Diga de quem é cada resultado.' : 'Escolha quem fez esse resultado.')
    if (repeated) return setError('Dois resultados do mesmo jogo estão no mesmo jogador.')
    setError('')
    await onImport(parsed.results.map((result, index) => ({ playerId: assignments[index], playedAt: importDate, ...result })))
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
    <Sheet title="Nova partida" subtitle="Cole os resultados do WhatsApp ou digite os placares" onClose={onClose}>
      <div className="segmented segmented--wide entry-mode" aria-label="Forma de cadastrar resultado">
        <button className={mode === 'paste' ? 'active' : ''} type="button" onClick={() => { setMode('paste'); setError('') }}><ClipboardPaste size={17} /> Colar resultado</button>
        <button className={mode === 'manual' ? 'active' : ''} type="button" onClick={() => { setMode('manual'); setError('') }}><Keyboard size={17} /> Digitar placares</button>
      </div>

      {mode === 'paste' ? (
        <form className="sheet-form" onSubmit={submitImport}>
          <div className="field paste-field">
            <div className="paste-field__heading">
              <label htmlFor="timeguessr-share">Mensagens compartilhadas pelo TimeGuessr</label>
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
            <small>Pode colar várias mensagens de uma vez — uma para cada jogador.</small>
          </div>

          {clipboardError && <p className="form-error" role="alert">{clipboardError}</p>}
          {parsed.error && <p className="form-error" role="alert">{parsed.error}</p>}

          {parsed.results.length > 1 ? (
            <div className="import-batch">
              <div className="score-heading">
                <div><strong>{parsed.results.length} resultados reconhecidos</strong><span>Diga de quem é cada um</span></div>
              </div>
              {parsed.results.map((result, index) => (
                <article key={index}>
                  <header>
                    <span><CheckCircle2 size={15} /> Jogo #{result.gameNumber}</span>
                    <strong>{result.totalScore.toLocaleString('pt-BR')} pts</strong>
                  </header>
                  <div className="profile-picker" role="radiogroup" aria-label={`Jogador do resultado de ${result.totalScore} pontos`}>
                    {players.map((player) => (
                      <button
                        className={assignments[index] === player.id ? 'active' : ''}
                        type="button"
                        role="radio"
                        aria-checked={assignments[index] === player.id}
                        key={player.id}
                        onClick={() => assign(index, player.id)}
                      >
                        <PlayerAvatar player={player} size="sm" />
                        <span>{player.nickname}</span>
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : parsed.results.length === 1 ? (
            <>
              <div className="import-preview">
                <header>
                  <span><CheckCircle2 size={18} /> Resultado reconhecido</span>
                  <strong>#{parsed.results[0].gameNumber} · {parsed.results[0].totalScore.toLocaleString('pt-BR')} pts</strong>
                </header>
                <div className="round-preview" aria-label="Detalhes das cinco rodadas">
                  {parsed.results[0].rounds.map((round) => (
                    <div key={round.roundNumber}>
                      <b>{round.roundNumber}</b>
                      <span><Trophy size={13} /> {round.roundScore.toLocaleString('pt-BR')}</span>
                      <span><Clock3 size={13} /> {round.yearError} ano{round.yearError === 1 ? '' : 's'}</span>
                      <span><Globe2 size={13} /> {formatDistanceLabel(round.distanceKm)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="import-assignment">
                <div className="score-heading"><div><strong>De quem é o resultado?</strong><span>Vincule ao nick cadastrado</span></div></div>
                <div className="import-player-list" role="radiogroup" aria-label="Jogador do resultado">
                  {players.map((player) => (
                    <button
                      className={assignments[0] === player.id ? 'active' : ''}
                      type="button"
                      role="radio"
                      aria-checked={assignments[0] === player.id}
                      key={player.id}
                      onClick={() => assign(0, player.id)}
                    >
                      <PlayerAvatar player={player} size="sm" />
                      <span>{player.nickname}</span>
                      <i>{assignments[0] === player.id && <Check size={12} />}</i>
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          <label className="field field--date import-date">
            <span>Data da partida</span>
            <input type="date" value={importDate} onChange={(event) => setImportDate(event.target.value)} required />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button primary-button--large" type="submit" disabled={busy || !parsed.results.length}>
            {busy
              ? 'Importando…'
              : parsed.results.length > 1
                ? `Importar ${parsed.results.length} resultados`
                : parsed.results.length === 1
                  ? `Importar para ${players.find((player) => player.id === assignments[0])?.nickname ?? 'jogador'}`
                  : 'Cole um resultado para continuar'}
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

function RoundGrid({ summary }: { summary: MatchSummary }) {
  const [metric, setMetric] = useState<RoundMetric>('score')
  const [referenceId, setReferenceId] = useState('')

  const active = ROUND_METRICS.find((item) => item.key === metric)!
  const reference = summary.results.find((result) => result.player.id === referenceId)
  const hardest = getHardestRound(summary.rounds, metric)

  const format = (value: number) => metric === 'distance'
    ? value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
    : formatScore(value)

  return (
    <section>
      <h4>Rodada a rodada</h4>

      <div className="segmented detail-metrics" role="tablist" aria-label="Dado mostrado na grade">
        {ROUND_METRICS.map((item) => (
          <button
            className={item.key === metric ? 'active' : ''}
            type="button"
            key={item.key}
            onClick={() => setMetric(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="detail-scroll">
        <div className="detail-grid" style={{ '--cols': summary.results.length } as React.CSSProperties}>
          <span className="detail-grid__corner">{active.unit}</span>
          {summary.results.map((result) => (
            <button
              className={`detail-grid__head ${result.player.id === referenceId ? 'detail-grid__head--on' : ''}`}
              type="button"
              key={result.player.id}
              aria-pressed={result.player.id === referenceId}
              aria-label={result.player.id === referenceId ? `Parar de comparar com ${result.player.nickname}` : `Comparar todos com ${result.player.nickname}`}
              onClick={() => setReferenceId((current) => current === result.player.id ? '' : result.player.id)}
            >
              <PlayerAvatar player={result.player} size="sm" />
              <small>{result.player.nickname}</small>
            </button>
          ))}

          {summary.rounds.map((round) => (
            <Fragment key={round.roundNumber}>
              <span className="detail-grid__label">{round.roundNumber}ª</span>
              {round.entries.map((entry) => {
                const value = getRoundValue(entry.detail, metric)
                if (value === null) return <span className="detail-grid__cell" key={entry.player.id}>—</span>

                const isReference = entry.player.id === referenceId
                const base = reference
                  ? getRoundValue(round.entries.find((item) => item.player.id === referenceId)?.detail ?? null, metric)
                  : null

                // sem referencia, destacamos o melhor da rodada; com referencia,
                // cada celula vira a diferenca para o jogador escolhido
                if (base === null || isReference) {
                  const best = !reference && round.best[metric] !== null && value === round.best[metric]
                  return (
                    <span className={`detail-grid__cell ${best ? 'detail-grid__cell--best' : ''} ${isReference ? 'detail-grid__cell--ref' : ''}`} key={entry.player.id}>
                      {format(value)}
                    </span>
                  )
                }

                const delta = value - base
                const better = active.lowerIsBetter ? delta < 0 : delta > 0
                const tone = delta === 0 ? 'even' : better ? 'up' : 'down'
                return (
                  <span className={`detail-grid__cell detail-grid__cell--${tone}`} key={entry.player.id}>
                    {delta === 0 ? '=' : `${delta > 0 ? '+' : '−'}${format(Math.abs(delta))}`}
                  </span>
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>

      <p className="detail-note">
        {reference
          ? `Diferença de cada um para ${reference.player.nickname} — verde é melhor que ele na rodada. Toque no nome de novo para voltar.`
          : 'Destaque para o melhor de cada rodada. Toque em um jogador para comparar todos com ele.'}
        {hardest && ` A ${hardest.roundNumber}ª foi a mais difícil: média de ${format(hardest.average[metric])} ${active.unit}.`}
      </p>
    </section>
  )
}

type MatchDetailSheetProps = {
  match: GameMatch
  players: Player[]
  scores: Score[]
  rounds: RoundDetail[]
  onClose: () => void
}

export function MatchDetailSheet({ match, players, scores, rounds, onClose }: MatchDetailSheetProps) {
  const summary = buildMatchSummary(match.id, players, scores, rounds)
  const label = typeof match.game_number === 'number' ? `Jogo oficial #${match.game_number}` : 'Placar registrado à mão'

  return (
    <Sheet title={match.title} subtitle={`${formatShortDate(match.played_at)} · ${label}`} onClose={onClose}>
      <div className="match-detail">
        <section>
          <h4>Resultado</h4>
          <div className="detail-results">
            {summary.results.map((result) => (
              <div key={result.player.id}>
                <span className="detail-place">{result.position === 1 ? '🏆' : result.position}</span>
                <PlayerAvatar player={result.player} size="sm" />
                <strong>{result.player.nickname}</strong>
                <b>{formatScore(result.score)}</b>
                <small>{result.gap === 0 ? 'líder' : formatScore(result.gap)}</small>
              </div>
            ))}
            {!summary.results.length && <p className="profile-empty">Nenhum placar registrado nesta partida.</p>}
          </div>
        </section>

        {summary.rounds.length > 0 && <RoundGrid summary={summary} />}

        {summary.rounds.length > 0 && (
          <section>
            <h4>Precisão nesta partida</h4>
            <div className="detail-precision">
              {summary.results.map((result) => {
                const own = rounds.filter((round) => round.match_id === match.id && round.player_id === result.player.id)
                if (!own.length) return null
                const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
                return (
                  <div key={result.player.id}>
                    <PlayerAvatar player={result.player} size="sm" />
                    <strong>{result.player.nickname}</strong>
                    <span><Clock3 size={13} /> {mean(own.map((round) => round.year_error)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} anos</span>
                    <span><Globe2 size={13} /> {formatDistanceLabel(mean(own.map((round) => round.distance_km)))}</span>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {!summary.rounds.length && !!summary.results.length && (
          <p className="profile-empty">Esta partida foi registrada digitando os placares, então não há leitura por rodada. Cole a mensagem do TimeGuessr para liberar esses detalhes.</p>
        )}
      </div>
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
