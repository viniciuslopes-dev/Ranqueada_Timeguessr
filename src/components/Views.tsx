import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, BarChart3, CalendarCheck, CalendarDays, CalendarRange, Check, ChevronDown, ChevronRight, ChevronUp, Clock3, Crown, Edit3, Flame, Globe2, Info, Medal, MoveHorizontal, Plus, Share2, Sparkles, Swords, Target, Trash2, TrendingDown, TrendingUp, Trophy, UserPlus, Users, X } from 'lucide-react'
import type { GameMatch, Player, PlayerRanking, RankingMetric, RoomSnapshot, Score } from '../types'
import { buildHeadToHead, buildMonthlyChampions, buildRanking, buildRankingShareText, buildRoundAverages, buildScaleTicks, buildStreaks, compareMatchesNewest, compareMatchesOldest, formatMonthLabel, formatScore, formatShortDate, formatCompact, getMatchPositions, getRankingValue, getRivalries, getWinnerIds, leaguePointsForPosition, LEAGUE_RULE_LABEL, MEDALS, niceScale, RANKING_METRICS, type DailyStatus } from '../lib/ranking'
import { formatDistance, formatDistanceLabel } from '../lib/distance'
import { formatPeriodLabel, localToday, type DateRange, type Period, type PeriodPreset } from '../lib/period'
import { DailyLink, EmptyState, PlayerAvatar } from './ui'

type Specialty = {
  player: PlayerRanking
  rounds: number
  yearError: number | null
  distanceKm: number | null
  roundScore: number | null
}

type SpecialtyColumn = 'yearError' | 'distanceKm' | 'roundScore'

// ano e mapa sao melhores quanto menores; pontos, quanto maior. bestFirst e a
// direcao aplicada no primeiro clique de cada coluna.
const SPECIALTY_COLUMNS: Array<{ key: SpecialtyColumn; label: string; bestFirst: 'asc' | 'desc' }> = [
  { key: 'yearError', label: 'Ano', bestFirst: 'asc' },
  { key: 'distanceKm', label: 'Mapa', bestFirst: 'asc' },
  { key: 'roundScore', label: 'Pontos', bestFirst: 'desc' },
]

const formatAverage = (value: number | null) => value === null ? '—' : value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const formatRoundAverage = (value: number | null) => value === null ? '—' : Math.round(value).toLocaleString('pt-BR')

export function PeriodBar({ period, range, matchCount, onPreset, onCustom }: {
  period: Period
  range: DateRange
  matchCount: number
  onPreset: (preset: PeriodPreset) => void
  onCustom: () => void
}) {
  return (
    <div className="period-bar">
      <div className="segmented period-filter" role="tablist" aria-label="Período dos resultados">
        <button type="button" className={period.preset === 'all' ? 'active' : ''} onClick={() => onPreset('all')}>Tudo</button>
        <button type="button" className={period.preset === 'today' ? 'active' : ''} onClick={() => onPreset('today')}>Hoje</button>
        <button type="button" className={period.preset === 'week' ? 'active' : ''} onClick={() => onPreset('week')}>Semana</button>
        <button type="button" className={period.preset === 'month' ? 'active' : ''} onClick={() => onPreset('month')}>Mês</button>
        <button type="button" className={period.preset === 'custom' ? 'active' : ''} onClick={onCustom}><CalendarRange size={12} /> Período</button>
      </div>
      {range && (
        <p className="period-summary">
          <strong>{formatPeriodLabel(range)}</strong>
          <span>{matchCount} partida{matchCount === 1 ? '' : 's'}</span>
          <button type="button" onClick={() => onPreset('all')} aria-label="Limpar o filtro de período"><X size={13} /></button>
        </p>
      )}
    </div>
  )
}

const TODAY_COLLAPSE_KEY = 'cronorank:today-collapsed'

function TodayCard({ today, onNewMatch }: { today: DailyStatus; onNewMatch: () => void }) {
  const complete = today.played.length > 0 && today.missing.length === 0
  const day = localToday()
  // quando todos ja lancaram o quadro nasce recolhido; com pendentes, so fica
  // recolhido se o proprio usuario tiver fechado hoje
  const [collapsed, setCollapsed] = useState(() => {
    if (complete) return true
    try { return localStorage.getItem(TODAY_COLLAPSE_KEY) === day } catch { return false }
  })

  useEffect(() => { if (complete) setCollapsed(true) }, [complete])

  const toggle = () => setCollapsed((current) => {
    const next = !current
    try {
      if (next) localStorage.setItem(TODAY_COLLAPSE_KEY, day)
      else localStorage.removeItem(TODAY_COLLAPSE_KEY)
    } catch { /* sem armazenamento local, a escolha vale so nesta sessao */ }
    return next
  })

  const summary = complete
    ? 'Todo mundo já lançou'
    : today.missing.length <= 2
      ? `Falta${today.missing.length === 1 ? '' : 'm'} ${today.missing.map((player) => player.nickname).join(' e ')}`
      : `Faltam ${today.missing.length} jogadores`

  if (collapsed) {
    return (
      <section className={`today-strip ${complete ? 'today-strip--done' : ''}`}>
        <button className="today-strip__main" type="button" onClick={toggle} aria-expanded={false}>
          <span className="today-card__badge">{complete ? <Check size={12} /> : <CalendarCheck size={12} />} Hoje</span>
          <strong>{summary}</strong>
          <ChevronDown size={16} />
        </button>
        <DailyLink variant="icon" label="Jogar a daily de hoje" />
        <button className="today-strip__add" type="button" onClick={onNewMatch} aria-label="Lançar resultado"><Plus size={16} /></button>
      </section>
    )
  }

  return (
    <section className={`today-card ${complete ? 'today-card--done' : ''}`}>
      <header>
        <span className="today-card__badge"><CalendarCheck size={15} /> Hoje</span>
        <strong>
          {complete
            ? 'Todo mundo já lançou!'
            : today.played.length
              ? `${today.played.length} de ${today.played.length + today.missing.length} já lançaram`
              : 'Ninguém lançou o resultado ainda'}
        </strong>
        <button className="today-card__collapse" type="button" onClick={toggle} aria-expanded aria-label="Recolher o quadro de hoje"><ChevronUp size={17} /></button>
      </header>

      {!!today.played.length && (
        <div className="today-card__row">
          {today.played.map((item) => (
            <span className="today-chip today-chip--done" key={item.player.id}>
              <PlayerAvatar player={item.player} size="sm" />
              {item.player.nickname}
              <b>{formatScore(item.score)}</b>
            </span>
          ))}
        </div>
      )}

      {!!today.missing.length && (
        <div className="today-card__row">
          {today.missing.map((player) => (
            <span className="today-chip" key={player.id}>
              <PlayerAvatar player={player} size="sm" />
              {player.nickname}
            </span>
          ))}
        </div>
      )}

      <div className="today-card__actions">
        <DailyLink variant="button" label="Jogar a daily de hoje" />
        <button
          className={`primary-button ${complete ? 'today-card__cta--quiet' : ''}`}
          type="button"
          onClick={onNewMatch}
        >
          <Plus size={17} /> {complete ? 'Lançar outra partida' : 'Lançar resultado'}
        </button>
      </div>
    </section>
  )
}

type RankingProps = {
  snapshot: RoomSnapshot
  metric: RankingMetric
  onMetric: (metric: RankingMetric) => void
  onNewMatch: () => void
  filtered: boolean
  onClearPeriod: () => void
  today: DailyStatus | null
  periodLabel: string
  onToast: (message: string) => void
  onOpenMatch: (match: GameMatch) => void
}

export function RankingView({ snapshot, metric, onMetric, onNewMatch, filtered, onClearPeriod, today, periodLabel, onToast, onOpenMatch }: RankingProps) {
  const ranking = buildRanking(snapshot.players, snapshot.matches, snapshot.scores, metric)
  const leader = ranking[0]
  const descriptor = RANKING_METRICS.find((item) => item.key === metric) ?? RANKING_METRICS[0]

  if (!snapshot.players.length) {
    return <EmptyState title="O pódio está esperando" text="Cadastre os nicks da turma para começar a liga." icon={<Users size={28} />} />
  }

  const shareRanking = async () => {
    const text = buildRankingShareText(snapshot.room.name, periodLabel, ranking, snapshot.matches.length, metric)
    try {
      if (navigator.share) await navigator.share({ title: snapshot.room.name, text })
      else { await navigator.clipboard.writeText(text); onToast('Ranking copiado! É só colar no grupo.') }
    } catch { /* o usuario desistiu de compartilhar */ }
  }

  return (
    <div className="view-stack">
      {today && !!snapshot.players.length && <TodayCard today={today} onNewMatch={onNewMatch} />}
      {!snapshot.matches.length ? (
        filtered ? (
          <EmptyState
            title="Nenhuma partida nesse período"
            text="Nada foi registrado entre as datas escolhidas."
            icon={<CalendarRange size={28} />}
            action={<button className="primary-button" type="button" onClick={onClearPeriod}>Ver todas as partidas</button>}
          />
        ) : (
        <section className="welcome-card">
          <span className="welcome-card__icon"><Sparkles size={22} /></span>
          <div><span>Tudo pronto!</span><h2>Registre a primeira viagem</h2><p>Adicione os placares e veja o pódio ganhar vida.</p></div>
          <button className="primary-button" type="button" onClick={onNewMatch}><Plus size={18} /> Nova partida</button>
        </section>
        )
      ) : (
        <section className="leader-hero">
          <div className="leader-hero__map-lines" />
          <div className="leader-hero__copy">
            <span className="eyebrow eyebrow--light"><Crown size={14} /> Liderança atual</span>
            <h2>{leader.nickname} está<br />no topo!</h2>
            <p>{leader.wins} vitória{leader.wins === 1 ? '' : 's'} · média de {formatScore(leader.average)}</p>
          </div>
          <PlayerAvatar player={leader} size="xl" rank={1} />
          <span className="leader-hero__score">{formatScore(getRankingValue(leader, metric))}<small>{metric === 'wins' ? ' vitórias' : ' pts'}</small></span>
        </section>
      )}

      <section>
        <div className="section-heading">
          <div><span className="section-kicker">PLACAR GERAL</span><h2>Ranking da liga</h2></div>
          <span className="live-pill"><i /> sincronizado</span>
        </div>
        <div className="segmented ranking-filter" role="tablist" aria-label="Critério do ranking">
          {RANKING_METRICS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={metric === item.key}
              title={item.hint}
              className={metric === item.key ? 'active' : ''}
              onClick={() => onMetric(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="metric-hint">{metric === 'league' ? <Medal size={13} /> : <Info size={13} />} {metric === 'league' ? `Pontos por colocação na partida: ${LEAGUE_RULE_LABEL}` : descriptor.hint}</p>

        {snapshot.matches.length > 0 && <Podium ranking={ranking} metric={metric} />}
        <div className="ranking-list">
          {ranking.map((player, index) => (
            <article className={`rank-row ${index === 0 ? 'rank-row--leader' : ''}`} key={player.id}>
              <span className="rank-row__position">{MEDALS[index] ?? index + 1}</span>
              <PlayerAvatar player={player} size="md" rank={index + 1} />
              <div className="rank-row__identity">
                <strong>{player.nickname}</strong>
                <span>{metric === 'league'
                  ? `${player.games} jogo${player.games === 1 ? '' : 's'} · ${player.wins}× 1º · ${player.seconds}× 2º · ${player.thirds}× 3º`
                  : `${player.games} jogo${player.games === 1 ? '' : 's'} · ${player.wins} vitória${player.wins === 1 ? '' : 's'}`}</span>
              </div>
              <div className="rank-row__value">
                <strong>{formatScore(getRankingValue(player, metric))}</strong>
                <span>{descriptor.unit}</span>
              </div>
              {player.trend !== 0 && (
                <span className={`trend ${player.trend > 0 ? 'trend--up' : 'trend--down'}`} title="Comparação das últimas partidas">
                  {player.trend > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                </span>
              )}
            </article>
          ))}
        </div>

        {!!snapshot.matches.length && (
          <button className="share-ranking" type="button" onClick={shareRanking}><Share2 size={16} /> Compartilhar ranking</button>
        )}
      </section>

      {!!snapshot.matches.length && <RecentMatches snapshot={snapshot} limit={3} onOpen={onOpenMatch} />}
    </div>
  )
}

function Podium({ ranking, metric }: { ranking: PlayerRanking[]; metric: RankingMetric }) {
  const top = ranking.slice(0, 3)
  if (!top.length) return null
  const displayOrder = top.length === 1 ? [top[0]] : top.length === 2 ? [top[1], top[0]] : [top[1], top[0], top[2]]
  return (
    <div className={`podium podium--${top.length}`}>
      {displayOrder.map((player) => {
        const actualRank = ranking.findIndex((item) => item.id === player.id) + 1
        const value = getRankingValue(player, metric)
        return (
          <div className={`podium__place podium__place--${actualRank}`} key={player.id}>
            <PlayerAvatar player={player} size={actualRank === 1 ? 'xl' : 'lg'} rank={actualRank} />
            <strong>{player.nickname}</strong>
            <span>{formatScore(value)} {RANKING_METRICS.find((item) => item.key === metric)?.short ?? 'pts'}</span>
            <div>{actualRank}</div>
          </div>
        )
      })}
    </div>
  )
}

export function MatchesView({ snapshot, onNew, onEdit, onDelete, onOpen, filtered, onClearPeriod }: { snapshot: RoomSnapshot; onNew: () => void; onEdit: (match: GameMatch) => void; onDelete: (match: GameMatch) => void; onOpen: (match: GameMatch) => void; filtered: boolean; onClearPeriod: () => void }) {
  const ordered = [...snapshot.matches].sort(compareMatchesNewest)
  return (
    <div className="view-stack">
      <div className="page-title">
        <div><span className="section-kicker">MEMÓRIA DA LIGA</span><h1>Partidas</h1><p>{snapshot.matches.length} desafio{snapshot.matches.length === 1 ? '' : 's'} registrado{snapshot.matches.length === 1 ? '' : 's'}</p></div>
        <button className="round-add" type="button" onClick={onNew} aria-label="Nova partida"><Plus /></button>
      </div>
      {!ordered.length ? (
        <EmptyState
          title={filtered ? 'Nenhuma partida nesse período' : 'Nenhuma partida ainda'}
          text={filtered ? 'Nada foi registrado entre as datas escolhidas.' : 'Quando todos terminarem o jogo, registre os placares por aqui.'}
          icon={filtered ? <CalendarRange size={28} /> : undefined}
          action={filtered
            ? <button className="primary-button" type="button" onClick={onClearPeriod}>Ver todas as partidas</button>
            : <button className="primary-button" onClick={onNew}><Plus size={18} /> Nova partida</button>}
        />
      ) : (
        <div className="match-list">
          {ordered.map((match, index) => <MatchCard key={match.id} match={match} snapshot={snapshot} index={index} onEdit={() => onEdit(match)} onDelete={() => onDelete(match)} onOpen={() => onOpen(match)} />)}
        </div>
      )}
    </div>
  )
}

function MatchCard({ match, snapshot, index, onEdit, onDelete, onOpen }: { match: GameMatch; snapshot: RoomSnapshot; index: number; onEdit: () => void; onDelete: () => void; onOpen: () => void }) {
  const values = snapshot.scores.filter((score) => score.match_id === match.id).sort((a, b) => b.score - a.score)
  const winnerIds = getWinnerIds(match.id, snapshot.scores)
  return (
    <article className="match-card">
      <header>
        <span className="match-date"><CalendarDays size={15} /> {formatShortDate(match.played_at)}</span>
        <div><h3>{match.title}</h3><span>{typeof match.game_number === 'number' ? `Jogo oficial #${match.game_number}` : `Partida #${snapshot.matches.length - index}`}</span></div>
        <div className="match-card__actions">
          <button className="ghost-icon ghost-icon--edit" type="button" onClick={onEdit} aria-label={`Editar ${match.title}`}><Edit3 size={16} /></button>
          <button className="ghost-icon" type="button" onClick={onDelete} aria-label={`Apagar ${match.title}`}><Trash2 size={16} /></button>
        </div>
      </header>
      <div className="match-scores">
        {values.map((score, scoreIndex) => {
          const player = snapshot.players.find((item) => item.id === score.player_id)
          if (!player) return null
          return (
            <div key={score.id}>
              <span className="mini-position">{winnerIds.includes(player.id) ? '🏆' : scoreIndex + 1}</span>
              <PlayerAvatar player={player} size="sm" />
              <strong>{player.nickname}</strong>
              <span className="match-score-value">{formatScore(score.score)}</span>
            </div>
          )
        })}
      </div>
      <button className="match-detail-link" type="button" onClick={onOpen}>
        Ver rodada a rodada <ChevronRight size={15} />
      </button>
    </article>
  )
}

function RecentMatches({ snapshot, limit, onOpen }: { snapshot: RoomSnapshot; limit: number; onOpen: (match: GameMatch) => void }) {
  const matches = [...snapshot.matches].sort(compareMatchesNewest).slice(0, limit)
  return (
    <section>
      <div className="section-heading"><div><span className="section-kicker">ÚLTIMAS VIAGENS</span><h2>Partidas recentes</h2></div></div>
      <div className="recent-list">
        {matches.map((match) => {
          const matchScores = snapshot.scores.filter((item) => item.match_id === match.id)
          const winners = getWinnerIds(match.id, snapshot.scores)
          const winner = snapshot.players.find((player) => winners.includes(player.id))
          const highScore = Math.max(...matchScores.map((item) => item.score))
          return (
            <button type="button" key={match.id} onClick={() => onOpen(match)} aria-label={`Ver detalhes de ${match.title}`}>
              <span className="date-badge"><strong>{formatShortDate(match.played_at).split(' ')[0]}</strong><small>{formatShortDate(match.played_at).split(' ')[1]}</small></span>
              <div><strong>{match.title}</strong><span>{winner ? `${winner.nickname} venceu` : 'Sem placares'}</span></div>
              {winner && <PlayerAvatar player={winner} size="sm" />}
              <strong className="recent-score">{Number.isFinite(highScore) ? formatScore(highScore) : '—'}</strong>
              <ChevronRight size={17} />
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function PlayersView({ snapshot, onAdd, onEdit }: { snapshot: RoomSnapshot; onAdd: () => void; onEdit: (player: Player) => void }) {
  const ranking = buildRanking(snapshot.players, snapshot.matches, snapshot.scores)
  return (
    <div className="view-stack">
      <div className="page-title">
        <div><span className="section-kicker">SUA TURMA</span><h1>Jogadores</h1><p>Cadastre e personalize os competidores</p></div>
        <button className="round-add" type="button" onClick={onAdd} aria-label="Adicionar jogador"><UserPlus /></button>
      </div>
      {!ranking.length ? (
        <EmptyState title="Chame os crononautas" text="Adicione cada nick uma vez. Depois, basta preencher os placares." action={<button className="primary-button" onClick={onAdd}><UserPlus size={18} /> Adicionar jogador</button>} />
      ) : (
        <div className="player-grid">
          {ranking.map((player, index) => (
            <article className="player-card" key={player.id} style={{ '--player-color': player.color } as React.CSSProperties}>
              <button type="button" className="edit-player" onClick={() => onEdit(player)} aria-label={`Editar ${player.nickname}`}><Edit3 size={15} /></button>
              <PlayerAvatar player={player} size="lg" rank={index + 1} />
              <h3>{player.nickname}</h3>
              <span>#{index + 1} na liga</span>
              <div className="player-card__stats">
                <div><strong>{player.wins}</strong><span>vitórias</span></div>
                <div><strong>{formatScore(player.best)}</strong><span>recorde</span></div>
              </div>
              {/* form vem da mais recente para a mais antiga; aqui invertemos para a linha
                  do tempo ler da esquerda para a direita, como o grafico de evolucao */}
              <div className="form-dots" aria-label="Forma nas últimas partidas, da mais antiga para a mais recente">
                {[...player.form].reverse().map((result, resultIndex) => <i key={resultIndex} className={`form-dot form-dot--${result}`} />)}
              </div>
            </article>
          ))}
          <button className="add-player-card" type="button" onClick={onAdd}><UserPlus size={24} /><strong>Novo jogador</strong><span>Adicionar à liga</span></button>
        </div>
      )}
    </div>
  )
}

export function InsightsView({ snapshot, history, filtered, onClearPeriod }: { snapshot: RoomSnapshot; history: RoomSnapshot; filtered: boolean; onClearPeriod: () => void }) {
  const ranking = buildRanking(snapshot.players, snapshot.matches, snapshot.scores)
  const allScores = snapshot.scores.map((item) => item.score)
  const best = allScores.length ? Math.max(...allScores) : 0
  // o recorde pode estar empatado entre jogadores; guardamos todos os donos
  const recordScores = allScores.length ? snapshot.scores.filter((item) => item.score === best) : []
  const recordHolders = ranking.filter((player) => recordScores.some((item) => item.player_id === player.id))
  const recordNames = recordHolders.map((player) => player.nickname).join(' e ')
  const recordMatch = snapshot.matches.find((match) => match.id === recordScores[0]?.match_id)
  const champion = ranking[0]
  const specialties: Specialty[] = ranking.map((player) => {
    const rounds = (snapshot.rounds ?? []).filter((round) => round.player_id === player.id)
    const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
    return {
      player,
      rounds: rounds.length,
      yearError: rounds.length ? average(rounds.map((round) => round.year_error)) : null,
      distanceKm: rounds.length ? average(rounds.map((round) => round.distance_km)) : null,
      roundScore: rounds.length ? average(rounds.map((round) => round.round_score)) : null,
    }
  })
  const measured = specialties.filter((item) => item.rounds > 0)
  const timeMaster = [...measured].sort((a, b) => a.yearError! - b.yearError!)[0]
  const geoMaster = [...measured].sort((a, b) => a.distanceKm! - b.distanceKm!)[0]
  // a liga le o mesmo periodo pela pontuacao de colocacao: quem soma mais placar
  // nem sempre e quem mais sobe ao podio
  const leagueTable = buildRanking(snapshot.players, snapshot.matches, snapshot.scores, 'league')
    .filter((player) => player.games > 0)
  const leagueLeader = leagueTable[0]

  return (
    <div className="view-stack">
      <div className="page-title"><div><span className="section-kicker">RAIO-X DA DISPUTA</span><h1>Estatísticas</h1><p>Os números por trás das viagens</p></div><span className="page-title__icon"><BarChart3 /></span></div>
      {!snapshot.matches.length ? (
        <EmptyState
          title={filtered ? 'Nenhuma partida nesse período' : 'Os gráficos vêm logo depois'}
          text={filtered ? 'Escolha outro intervalo para ver evolução, recordes e conquistas.' : 'Registre a primeira partida para revelar evolução, recordes e conquistas.'}
          icon={filtered ? <CalendarRange size={28} /> : <BarChart3 size={28} />}
          action={filtered ? <button className="primary-button" type="button" onClick={onClearPeriod}>Ver todas as partidas</button> : undefined}
        />
      ) : (
        <>
          <div className="stat-grid">
            <article><span><CalendarDays size={18} /></span><strong>{snapshot.matches.length}</strong><small>partidas</small></article>
            <article><span><Target size={18} /></span><strong>{formatScore(best)}</strong><small>maior placar</small>{!!recordHolders.length && <em className="stat-owner">{recordNames}</em>}</article>
            <article><span><Trophy size={18} /></span><strong>{snapshot.rounds?.length ?? 0}</strong><small>rodadas detalhadas</small></article>
          </div>
          <section className="chart-card">
            <div className="section-heading"><div><span className="section-kicker">PLACAR POR PARTIDA</span><h2>Corrida no tempo</h2></div></div>
            <EvolutionChart snapshot={snapshot} />
          </section>
          <StreaksCard snapshot={snapshot} />
          <LeagueTable ranking={leagueTable} />
          <section>
            <div className="section-heading"><div><span className="section-kicker">PRECISÃO POR JOGADOR</span><h2>Especialidades</h2></div></div>
            {measured.length ? (
              <SpecialtyTable specialties={specialties} />
            ) : (
              <div className="detail-empty"><span className="detail-empty__icon">📋</span><div><strong>Os placares antigos continuam valendo</strong><p>Cole um resultado compartilhado para liberar as métricas de ano e mapa.</p></div></div>
            )}
          </section>
          <PlayerProfile snapshot={snapshot} />
          <section>
            <div className="section-heading"><div><span className="section-kicker">DESTAQUES</span><h2>Hall da fama</h2></div></div>
            <div className="achievement-grid">
              <article className="achievement achievement--gold"><span><Crown /></span><div><small>DONO DO TEMPO</small><strong>{champion?.nickname ?? '—'}</strong><p>Lidera o placar geral</p></div></article>
              <article className="achievement achievement--mint"><span><Target /></span><div><small>{filtered ? 'RECORDE DO PERÍODO' : 'RECORDE ETERNO'}</small><strong>{recordNames || 'Aguardando'}</strong><p>{recordHolders.length ? `${formatScore(best)} pts${recordMatch ? ` em ${recordMatch.title}` : ''}` : 'Registre um placar para abrir o recorde'}</p></div></article>
              <article className="achievement achievement--coral"><span><Clock3 /></span><div><small>MESTRE DO TEMPO</small><strong>{timeMaster?.player.nickname ?? 'Aguardando'}</strong><p>{timeMaster ? `${formatAverage(timeMaster.yearError)} anos de erro médio` : 'Importe resultados detalhados'}</p></div></article>
              <article className="achievement achievement--blue"><span><Globe2 /></span><div><small>MESTRE DO MAPA</small><strong>{geoMaster?.player.nickname ?? 'Aguardando'}</strong><p>{geoMaster ? `${formatDistanceLabel(geoMaster.distanceKm)} de distância média` : 'Importe resultados detalhados'}</p></div></article>
              <article className="achievement achievement--violet"><span><Medal /></span><div><small>REI DA LIGA</small><strong>{leagueLeader?.nickname ?? 'Aguardando'}</strong><p>{leagueLeader ? `${formatScore(leagueLeader.leaguePoints)} pts por colocação · ${leagueLeader.wins}× 1º` : 'Registre uma partida para abrir a tabela'}</p></div></article>
            </div>
          </section>
          <ChampionsCard snapshot={history} />
        </>
      )}
    </div>
  )
}

function PlayerProfile({ snapshot }: { snapshot: RoomSnapshot }) {
  const ranking = buildRanking(snapshot.players, snapshot.matches, snapshot.scores)
  const [selectedId, setSelectedId] = useState('')
  const selected = ranking.find((player) => player.id === selectedId) ?? ranking[0]
  if (!selected) return null

  const rounds = snapshot.rounds ?? []
  const averages = buildRoundAverages(rounds, selected.id)
  const league = buildRoundAverages(rounds)
  const duels = buildHeadToHead(selected.id, snapshot.players, snapshot.scores)
  const rivalries = getRivalries(duels)
  const measured = averages.some((item) => item.rounds > 0)

  return (
    <section>
      <div className="section-heading"><div><span className="section-kicker">PERFIL DO JOGADOR</span><h2>Como {selected.nickname} joga</h2></div></div>

      <div className="profile-picker" role="radiogroup" aria-label="Jogador do perfil">
        {ranking.map((player) => (
          <button
            className={player.id === selected.id ? 'active' : ''}
            type="button"
            role="radio"
            aria-checked={player.id === selected.id}
            key={player.id}
            onClick={() => setSelectedId(player.id)}
          >
            <PlayerAvatar player={player} size="sm" />
            <span>{player.nickname}</span>
          </button>
        ))}
      </div>

      <article className="profile-block">
        <header><Trophy size={15} /><div><strong>Desempenho por rodada</strong><span>Média de pontos em cada uma das cinco</span></div></header>
        {measured ? (
          <>
            <div className="round-chart">
              {averages.map((item, index) => (
                <div className="round-chart__column" key={item.roundNumber}>
                  <div className="round-chart__track">
                    <div className="round-chart__bar" style={{ height: `${(item.average / 10000) * 100}%`, background: selected.color }} />
                    {league[index].average > 0 && <i className="round-chart__league" style={{ bottom: `${(league[index].average / 10000) * 100}%` }} />}
                  </div>
                  <strong>{item.rounds ? formatScore(item.average) : '—'}</strong>
                  <small>{item.roundNumber}ª</small>
                </div>
              ))}
            </div>
            <p className="round-chart__legend"><i /> média da liga na mesma rodada</p>
          </>
        ) : (
          <p className="profile-empty">Cole um resultado compartilhado para liberar a leitura por rodada.</p>
        )}
      </article>

      <article className="profile-block">
        <header><Swords size={15} /><div><strong>Confronto direto</strong><span>Só contam as partidas em que os dois jogaram</span></div></header>
        {(rivalries.nemesis || rivalries.favourite) && (
          <div className="rivalry-row">
            {rivalries.nemesis && (
              <span className="rivalry rivalry--bad">
                <small>ALGOZ</small>
                <strong>{rivalries.nemesis.opponent.nickname}</strong>
                <b>{rivalries.nemesis.wins}–{rivalries.nemesis.losses}</b>
              </span>
            )}
            {rivalries.favourite && (
              <span className="rivalry rivalry--good">
                <small>FREGUÊS</small>
                <strong>{rivalries.favourite.opponent.nickname}</strong>
                <b>{rivalries.favourite.wins}–{rivalries.favourite.losses}</b>
              </span>
            )}
          </div>
        )}
        {duels.length ? (
          <div className="duel-list">
            {duels.map((duel) => (
              <div key={duel.opponent.id}>
                <PlayerAvatar player={duel.opponent} size="sm" />
                <div className="duel-identity">
                  <strong>{duel.opponent.nickname}</strong>
                  <small>{duel.games} confronto{duel.games === 1 ? '' : 's'}{duel.draws ? ` · ${duel.draws} empate${duel.draws === 1 ? '' : 's'}` : ''}</small>
                </div>
                <div className="duel-bar" aria-hidden="true">
                  <i style={{ width: `${(duel.wins / duel.games) * 100}%`, background: selected.color }} />
                  <i style={{ width: `${(duel.draws / duel.games) * 100}%`, background: '#d8d9dd' }} />
                  <i style={{ width: `${(duel.losses / duel.games) * 100}%`, background: duel.opponent.color }} />
                </div>
                <span className="duel-score" aria-label={`${duel.wins} vitórias contra ${duel.losses}`}>{duel.wins}<small>–</small>{duel.losses}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="profile-empty">Ainda não houve partida com outro jogador para comparar.</p>
        )}
      </article>
    </section>
  )
}

function StreaksCard({ snapshot }: { snapshot: RoomSnapshot }) {
  const streaks = buildStreaks(snapshot.players, snapshot.matches, snapshot.scores)
  if (!streaks.some((item) => item.longest > 0)) return null

  return (
    <section>
      <div className="section-heading"><div><span className="section-kicker">VITÓRIAS SEGUIDAS</span><h2>Sequências</h2></div></div>
      <div className="streak-card">
        {streaks.map((item) => (
          <article key={item.player.id}>
            <PlayerAvatar player={item.player} size="sm" />
            <strong>{item.player.nickname}</strong>
            <span className={`streak-now ${item.current > 0 ? 'streak-now--hot' : ''}`}>
              {item.current > 0 ? <><Flame size={13} /> {item.current}</> : '—'}
            </span>
            <span className="streak-best">recorde <b>{item.longest}</b></span>
          </article>
        ))}
      </div>
      <p className="section-note">Sequência atual à esquerda e o recorde à direita. Faltar em uma partida não zera a sequência — só não a aumenta.</p>
    </section>
  )
}

function ChampionsCard({ snapshot }: { snapshot: RoomSnapshot }) {
  const champions = buildMonthlyChampions(snapshot.players, snapshot.matches, snapshot.scores)
    .filter((item) => item.champion)
  if (!champions.length) return null
  const runningMonth = localToday().slice(0, 7)

  return (
    <section>
      <div className="section-heading"><div><span className="section-kicker">TEMPORADAS</span><h2>Campeões do mês</h2></div></div>
      <div className="champion-card">
        {champions.map((item) => (
          <article key={item.month}>
            <div className="champion-month">
              <strong>{formatMonthLabel(item.month)}</strong>
              {item.month === runningMonth
                ? <small className="champion-live">em disputa</small>
                : <small>{item.matches} partida{item.matches === 1 ? '' : 's'}</small>}
            </div>
            <PlayerAvatar player={item.champion!} size="sm" />
            <div className="champion-name">
              <strong>{item.champion!.nickname}</strong>
              <small>{formatScore(item.champion!.leaguePoints)} pts de liga · {item.champion!.wins}× 1º</small>
            </div>
            <span className="champion-medal">🏆</span>
          </article>
        ))}
      </div>
      <p className="section-note">Campeão do mês pela pontuação por colocação ({LEAGUE_RULE_LABEL}). O histórico ignora o filtro de período — ele é a memória da liga inteira.</p>
    </section>
  )
}

// Tabela no formato de liga: quantas vezes cada um subiu a cada degrau do
// podio e quanto isso rendeu. E a leitura que o ranking por colocacao usa.
function LeagueTable({ ranking }: { ranking: PlayerRanking[] }) {
  if (!ranking.length) return null
  const leader = ranking[0]
  const runnerUp = ranking[1]
  const lead = runnerUp ? leader.leaguePoints - runnerUp.leaguePoints : 0

  return (
    <section>
      <div className="section-heading">
        <div><span className="section-kicker">PONTUAÇÃO POR COLOCAÇÃO</span><h2>Tabela da liga</h2></div>
        {!!runnerUp && (
          <span className="league-lead">
            {lead === 0
              ? `${leader.nickname} e ${runnerUp.nickname} empatados`
              : `${leader.nickname} abre ${lead} pt${lead === 1 ? '' : 's'}`}
          </span>
        )}
      </div>
      <div className="league-card">
        <div className="league-head">
          <span>Jogador</span>
          <span title="Primeiros lugares">1º</span>
          <span title="Segundos lugares">2º</span>
          <span title="Terceiros lugares">3º</span>
          <span>Pts</span>
        </div>
        {ranking.map((player, index) => {
          const outside = player.games - player.wins - player.seconds - player.thirds
          return (
            <div className={`league-row ${index === 0 ? 'league-row--leader' : ''}`} key={player.id}>
              <div>
                <PlayerAvatar player={player} size="sm" rank={index + 1} />
                <strong>{player.nickname}</strong>
                <small>{player.games} jogo{player.games === 1 ? '' : 's'}{outside > 0 ? ` · ${outside} fora do pódio` : ''}</small>
              </div>
              <span className={player.wins ? 'league-count league-count--gold' : 'league-count'}>{player.wins}</span>
              <span className={player.seconds ? 'league-count league-count--silver' : 'league-count'}>{player.seconds}</span>
              <span className={player.thirds ? 'league-count league-count--bronze' : 'league-count'}>{player.thirds}</span>
              <span className="league-points">{formatScore(player.leaguePoints)}</span>
            </div>
          )
        })}
      </div>
      <p className="section-note">{LEAGUE_RULE_LABEL}. Empate divide a colocação: dois primeiros levam 5 pontos cada e o próximo já cai para o 3º lugar.</p>
    </section>
  )
}

function SpecialtyTable({ specialties }: { specialties: Specialty[] }) {
  const [sort, setSort] = useState<{ key: SpecialtyColumn; direction: 'asc' | 'desc' } | null>(null)

  const rows = sort
    ? [...specialties].sort((a, b) => {
        const first = a[sort.key]
        const second = b[sort.key]
        // quem ainda nao tem rodadas detalhadas fica sempre no fim da lista
        if (first === null || second === null) return first === second ? 0 : first === null ? 1 : -1
        return sort.direction === 'asc' ? first - second : second - first
      })
    : specialties

  return (
    <div className="specialty-card">
      <div className="specialty-head">
        <span>Jogador</span>
        {SPECIALTY_COLUMNS.map((column) => {
          const active = sort?.key === column.key
          const direction = active ? sort.direction : column.bestFirst
          return (
            <button
              className={`specialty-sort ${active ? 'specialty-sort--active' : ''}`}
              type="button"
              key={column.key}
              aria-label={`Ordenar por ${column.label}, ${direction === 'asc' ? 'do menor para o maior' : 'do maior para o menor'}`}
              onClick={() => setSort((current) => current?.key === column.key
                ? { key: column.key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
                : { key: column.key, direction: column.bestFirst })}
            >
              {column.label}
              {active ? (direction === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ArrowUpDown size={11} />}
            </button>
          )
        })}
      </div>
      {rows.map((item) => (
        <div className="specialty-row" key={item.player.id}>
          <div><PlayerAvatar player={item.player} size="sm" /><strong>{item.player.nickname}</strong><small>{item.rounds ? `${item.rounds} rodadas` : 'sem detalhes'}</small></div>
          <span title="Erro médio em anos"><Clock3 size={14} /><strong>{formatAverage(item.yearError)}</strong><small>anos</small></span>
          <span title="Distância média"><Globe2 size={14} /><strong>{formatDistance(item.distanceKm).value}</strong><small>{formatDistance(item.distanceKm).unit}</small></span>
          <span title="Pontuação média por rodada"><Trophy size={14} /><strong>{formatRoundAverage(item.roundScore)}</strong><small>média</small></span>
        </div>
      ))}
    </div>
  )
}

type ChartMode = 'total' | 'league' | 'match' | 'position'

const CHART_MODES: Array<{ key: ChartMode; label: string }> = [
  { key: 'total', label: 'Acumulado' },
  { key: 'league', label: 'Liga' },
  { key: 'match', label: 'Partida' },
  { key: 'position', label: 'Colocação' },
]

function EvolutionChart({ snapshot }: { snapshot: RoomSnapshot }) {
  const [mode, setMode] = useState<ChartMode>('total')
  const ordered = [...snapshot.matches].sort(compareMatchesOldest)
  const matches = ordered.slice(-8)
  const players = buildRanking(snapshot.players, snapshot.matches, snapshot.scores).slice(0, 4)
  // a colocacao de todas as partidas do periodo, nao so a da janela visivel: a
  // corrida da liga precisa somar o que veio antes
  const positionsByMatch = new Map(ordered.map((match) => [match.id, getMatchPositions(match.id, snapshot.scores)]))
  const positions = matches.map((match) => positionsByMatch.get(match.id)!)
  const lastPlace = Math.max(2, ...positions.map((item) => item.size))

  const scoreOf = (matchId: string, playerId: string) =>
    snapshot.scores.find((item) => item.match_id === matchId && item.player_id === playerId)?.score ?? null

  // o acumulado corre sobre todas as partidas do periodo e so mostra a janela
  // visivel, para os valores baterem com os totais do ranking
  const totals = new Map(players.map((player) => {
    let sum = 0
    const running = ordered.map((match) => {
      sum += scoreOf(match.id, player.id) ?? 0
      return sum
    })
    return [player.id, running.slice(ordered.length - matches.length)]
  }))

  const leagueTotals = new Map(players.map((player) => {
    let sum = 0
    const running = ordered.map((match) => {
      const position = positionsByMatch.get(match.id)?.get(player.id)
      sum += position ? leaguePointsForPosition(position) : 0
      return sum
    })
    return [player.id, running.slice(ordered.length - matches.length)]
  }))

  const valueAt = (playerId: string, index: number): number | null => {
    if (mode === 'total') return totals.get(playerId)?.[index] ?? null
    if (mode === 'league') return leagueTotals.get(playerId)?.[index] ?? null
    if (mode === 'position') return positions[index].get(playerId) ?? null
    return scoreOf(matches[index].id, playerId)
  }

  const values = players.flatMap((player) =>
    matches.map((_, index) => valueAt(player.id, index)).filter((value): value is number => value !== null))
  const scale = mode === 'position'
    ? { min: 1, max: lastPlace, step: 1 }
    : niceScale(Math.min(...values), Math.max(...values))
  const span = scale.max - scale.min || 1

  const width = 680
  const height = 260
  const padding = { top: 20, right: 16, bottom: 34, left: 45 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const columnX = (index: number) => padding.left + (matches.length === 1 ? plotWidth / 2 : (index / (matches.length - 1)) * plotWidth)
  // ratio 1 e o topo do grafico; na colocacao o 1o lugar e que fica em cima
  const ratioOf = (value: number) => mode === 'position'
    ? 1 - (value - scale.min) / span
    : (value - scale.min) / span
  const rowY = (ratio: number) => padding.top + plotHeight - ratio * plotHeight

  const ticks = buildScaleTicks(scale).map((value) => ({
    key: value,
    ratio: ratioOf(value),
    label: mode === 'position' ? `${value}º` : formatCompact(value, scale.step),
  }))

  const wrapRef = useRef<HTMLDivElement>(null)
  const [axisShift, setAxisShift] = useState(0)

  // o eixo Y vive dentro do SVG que rola, entao empurramos ele de volta pela
  // mesma distancia rolada para que continue visivel ao arrastar o grafico
  useEffect(() => {
    const node = wrapRef.current
    if (!node) return
    let frame = 0
    const measure = () => {
      frame = 0
      const rendered = node.querySelector('svg')?.getBoundingClientRect().width ?? 0
      setAxisShift(rendered ? (node.scrollLeft * width) / rendered : 0)
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure) }
    measure()
    node.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      node.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [mode, matches.length])

  const series = players.map((player) => ({
    player,
    points: matches
      .map((_, index) => {
        const value = valueAt(player.id, index)
        return value === null ? null : { x: columnX(index), y: rowY(ratioOf(value)) }
      })
      .filter((item): item is { x: number; y: number } => item !== null),
  }))

  const note = mode === 'total'
    ? 'Soma de pontos ao longo das partidas — quem sobe mais rápido está abrindo vantagem.'
    : mode === 'league'
      ? `Pontos de liga acumulados (${LEAGUE_RULE_LABEL}) — a corrida pelo título.`
      : mode === 'match'
        ? 'Placar de cada partida, na escala dos resultados da liga.'
        : 'Colocação dentro de cada partida.'

  return (
    <>
      <div className="segmented chart-mode" role="tablist" aria-label="Leitura do gráfico">
        {CHART_MODES.map((item) => (
          <button
            className={item.key === mode ? 'active' : ''}
            type="button"
            key={item.key}
            onClick={() => setMode(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="chart-scroll-area">
        <p className="chart-swipe-hint"><MoveHorizontal size={15} /> Deslize o gráfico para os lados</p>
        <div className="chart-wrap" ref={wrapRef} tabIndex={0} role="region" aria-label="Gráfico com rolagem horizontal">
          <div className="chart-stage">
            <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={note}>
              {ticks.map((tick) => <line key={tick.key} x1={padding.left} x2={width - padding.right} y1={rowY(tick.ratio)} y2={rowY(tick.ratio)} />)}
              {series.map((item) => (
                <g key={item.player.id} className="chart-series">
                  <polyline points={item.points.map((point) => `${point.x},${point.y}`).join(' ')} style={{ stroke: item.player.color }} />
                  {item.points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="5" style={{ fill: item.player.color }} />)}
                </g>
              ))}
              {matches.map((match, index) => <text className="x-label" key={match.id} x={columnX(index)} y={height - 8}>{typeof match.game_number === 'number' ? `#${match.game_number}` : formatShortDate(match.played_at)}</text>)}
              <g className="chart-axis" transform={`translate(${axisShift} 0)`}>
                <rect x={-14} y={-6} width={padding.left + 10} height={height + 12} />
                {ticks.map((tick) => <text key={tick.key} x={padding.left - 8} y={rowY(tick.ratio) + 4}>{tick.label}</text>)}
              </g>
            </svg>
            <div className="chart-legend">{players.map((player) => <span key={player.id}><i style={{ background: player.color }} />{player.nickname}</span>)}</div>
          </div>
        </div>
      </div>
      <p className="section-note">{note}{ordered.length > matches.length && ` Mostrando as últimas ${matches.length} de ${ordered.length} partidas.`}</p>
    </>
  )
}
