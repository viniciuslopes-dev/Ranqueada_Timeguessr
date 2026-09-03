import { BarChart3, CalendarDays, ChevronDown, ChevronRight, Clock3, Crown, Edit3, Globe2, Plus, Sparkles, Target, Trash2, TrendingDown, TrendingUp, Trophy, UserPlus, Users } from 'lucide-react'
import type { GameMatch, Player, PlayerRanking, RankingMetric, RoomSnapshot, Score } from '../types'
import { buildRanking, formatScore, formatShortDate, getWinnerIds } from '../lib/ranking'
import { EmptyState, PlayerAvatar } from './ui'

const MEDALS = ['🥇', '🥈', '🥉']

type RankingProps = {
  snapshot: RoomSnapshot
  metric: RankingMetric
  onMetric: (metric: RankingMetric) => void
  onNewMatch: () => void
}

export function RankingView({ snapshot, metric, onMetric, onNewMatch }: RankingProps) {
  const ranking = buildRanking(snapshot.players, snapshot.matches, snapshot.scores, metric)
  const leader = ranking[0]

  if (!snapshot.players.length) {
    return <EmptyState title="O pódio está esperando" text="Cadastre os nicks da turma para começar a liga." icon={<Users size={28} />} />
  }

  return (
    <div className="view-stack">
      {!snapshot.matches.length ? (
        <section className="welcome-card">
          <span className="welcome-card__icon"><Sparkles size={22} /></span>
          <div><span>Tudo pronto!</span><h2>Registre a primeira viagem</h2><p>Adicione os placares e veja o pódio ganhar vida.</p></div>
          <button className="primary-button" type="button" onClick={onNewMatch}><Plus size={18} /> Nova partida</button>
        </section>
      ) : (
        <section className="leader-hero">
          <div className="leader-hero__map-lines" />
          <div className="leader-hero__copy">
            <span className="eyebrow eyebrow--light"><Crown size={14} /> Liderança atual</span>
            <h2>{leader.nickname} está<br />no topo!</h2>
            <p>{leader.wins} vitória{leader.wins === 1 ? '' : 's'} · média de {formatScore(leader.average)}</p>
          </div>
          <PlayerAvatar player={leader} size="xl" rank={1} />
          <span className="leader-hero__score">{formatScore(metric === 'total' ? leader.total : metric === 'average' ? leader.average : leader.wins)}<small>{metric === 'wins' ? ' vitórias' : ' pts'}</small></span>
        </section>
      )}

      <section>
        <div className="section-heading">
          <div><span className="section-kicker">PLACAR GERAL</span><h2>Ranking da liga</h2></div>
          <span className="live-pill"><i /> sincronizado</span>
        </div>
        <div className="segmented ranking-filter" role="tablist" aria-label="Critério do ranking">
          <button type="button" className={metric === 'total' ? 'active' : ''} onClick={() => onMetric('total')}>Pontos</button>
          <button type="button" className={metric === 'average' ? 'active' : ''} onClick={() => onMetric('average')}>Média</button>
          <button type="button" className={metric === 'wins' ? 'active' : ''} onClick={() => onMetric('wins')}>Vitórias</button>
        </div>

        {snapshot.matches.length > 0 && <Podium ranking={ranking} metric={metric} />}
        <div className="ranking-list">
          {ranking.map((player, index) => (
            <article className={`rank-row ${index === 0 ? 'rank-row--leader' : ''}`} key={player.id}>
              <span className="rank-row__position">{MEDALS[index] ?? index + 1}</span>
              <PlayerAvatar player={player} size="md" rank={index + 1} />
              <div className="rank-row__identity">
                <strong>{player.nickname}</strong>
                <span>{player.games} jogo{player.games === 1 ? '' : 's'} · {player.wins} vitória{player.wins === 1 ? '' : 's'}</span>
              </div>
              <div className="rank-row__value">
                <strong>{formatScore(metric === 'total' ? player.total : metric === 'average' ? player.average : player.wins)}</strong>
                <span>{metric === 'wins' ? 'vitórias' : 'pontos'}</span>
              </div>
              {player.trend !== 0 && (
                <span className={`trend ${player.trend > 0 ? 'trend--up' : 'trend--down'}`} title="Comparação das últimas partidas">
                  {player.trend > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                </span>
              )}
            </article>
          ))}
        </div>
      </section>

      {!!snapshot.matches.length && <RecentMatches snapshot={snapshot} limit={3} />}
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
        const value = metric === 'total' ? player.total : metric === 'average' ? player.average : player.wins
        return (
          <div className={`podium__place podium__place--${actualRank}`} key={player.id}>
            <PlayerAvatar player={player} size={actualRank === 1 ? 'xl' : 'lg'} rank={actualRank} />
            <strong>{player.nickname}</strong>
            <span>{formatScore(value)} {metric === 'wins' ? 'vit.' : 'pts'}</span>
            <div>{actualRank}</div>
          </div>
        )
      })}
    </div>
  )
}

export function MatchesView({ snapshot, onNew, onDelete }: { snapshot: RoomSnapshot; onNew: () => void; onDelete: (match: GameMatch) => void }) {
  const ordered = [...snapshot.matches].sort((a, b) => b.played_at.localeCompare(a.played_at) || b.created_at.localeCompare(a.created_at))
  return (
    <div className="view-stack">
      <div className="page-title">
        <div><span className="section-kicker">MEMÓRIA DA LIGA</span><h1>Partidas</h1><p>{snapshot.matches.length} desafio{snapshot.matches.length === 1 ? '' : 's'} registrado{snapshot.matches.length === 1 ? '' : 's'}</p></div>
        <button className="round-add" type="button" onClick={onNew} aria-label="Nova partida"><Plus /></button>
      </div>
      {!ordered.length ? (
        <EmptyState title="Nenhuma partida ainda" text="Quando todos terminarem o jogo, registre os placares por aqui." action={<button className="primary-button" onClick={onNew}><Plus size={18} /> Nova partida</button>} />
      ) : (
        <div className="match-list">
          {ordered.map((match, index) => <MatchCard key={match.id} match={match} snapshot={snapshot} index={index} onDelete={() => onDelete(match)} />)}
        </div>
      )}
    </div>
  )
}

function MatchCard({ match, snapshot, index, onDelete }: { match: GameMatch; snapshot: RoomSnapshot; index: number; onDelete: () => void }) {
  const values = snapshot.scores.filter((score) => score.match_id === match.id).sort((a, b) => b.score - a.score)
  const winnerIds = getWinnerIds(match.id, snapshot.scores)
  return (
    <article className="match-card">
      <header>
        <span className="match-date"><CalendarDays size={15} /> {formatShortDate(match.played_at)}</span>
        <div><h3>{match.title}</h3><span>Partida #{snapshot.matches.length - index}</span></div>
        <button className="ghost-icon" type="button" onClick={onDelete} aria-label={`Apagar ${match.title}`}><Trash2 size={16} /></button>
      </header>
      <div className="match-scores">
        {values.map((score, scoreIndex) => {
          const player = snapshot.players.find((item) => item.id === score.player_id)
          if (!player) return null
          const details = (snapshot.rounds ?? [])
            .filter((round) => round.match_id === match.id && round.player_id === player.id)
            .sort((a, b) => a.round_number - b.round_number)
          const resultSummary = (
            <>
              <span className="mini-position">{winnerIds.includes(player.id) ? '🏆' : scoreIndex + 1}</span>
              <PlayerAvatar player={player} size="sm" />
              <strong>{player.nickname}</strong>
              <span className="match-score-value">{formatScore(score.score)}</span>
            </>
          )
          if (details.length) return (
            <details className="match-player-result" key={score.id}>
              <summary>{resultSummary}<ChevronDown size={16} /></summary>
              <div className="match-round-details">
                {details.map((round) => (
                  <div key={round.id}>
                    <b>{round.round_number}</b>
                    <span><Trophy size={12} /> {formatScore(round.round_score)}</span>
                    <span><Clock3 size={12} /> {round.year_error} ano{round.year_error === 1 ? '' : 's'}</span>
                    <span><Globe2 size={12} /> {round.distance_km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km</span>
                  </div>
                ))}
              </div>
            </details>
          )
          return (
            <div key={score.id}>
              {resultSummary}
            </div>
          )
        })}
      </div>
    </article>
  )
}

function RecentMatches({ snapshot, limit }: { snapshot: RoomSnapshot; limit: number }) {
  const matches = [...snapshot.matches].sort((a, b) => b.played_at.localeCompare(a.played_at)).slice(0, limit)
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
            <article key={match.id}>
              <span className="date-badge"><strong>{formatShortDate(match.played_at).split(' ')[0]}</strong><small>{formatShortDate(match.played_at).split(' ')[1]}</small></span>
              <div><strong>{match.title}</strong><span>{winner ? `${winner.nickname} venceu` : 'Sem placares'}</span></div>
              {winner && <PlayerAvatar player={winner} size="sm" />}
              <strong className="recent-score">{Number.isFinite(highScore) ? formatScore(highScore) : '—'}</strong>
              <ChevronRight size={17} />
            </article>
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
              <div className="form-dots" aria-label="Forma nas últimas partidas">
                {player.form.map((result, resultIndex) => <i key={resultIndex} className={`form-dot form-dot--${result}`} />)}
              </div>
            </article>
          ))}
          <button className="add-player-card" type="button" onClick={onAdd}><UserPlus size={24} /><strong>Novo jogador</strong><span>Adicionar à liga</span></button>
        </div>
      )}
    </div>
  )
}

export function InsightsView({ snapshot }: { snapshot: RoomSnapshot }) {
  const ranking = buildRanking(snapshot.players, snapshot.matches, snapshot.scores)
  const allScores = snapshot.scores.map((item) => item.score)
  const best = allScores.length ? Math.max(...allScores) : 0
  const champion = ranking[0]
  const specialties = ranking.map((player) => {
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
  const formatAverage = (value: number | null) => value === null ? '—' : value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  const formatRoundAverage = (value: number | null) => value === null ? '—' : Math.round(value).toLocaleString('pt-BR')

  return (
    <div className="view-stack">
      <div className="page-title"><div><span className="section-kicker">RAIO-X DA DISPUTA</span><h1>Estatísticas</h1><p>Os números por trás das viagens</p></div><span className="page-title__icon"><BarChart3 /></span></div>
      {!snapshot.matches.length ? (
        <EmptyState title="Os gráficos vêm logo depois" text="Registre a primeira partida para revelar evolução, recordes e conquistas." icon={<BarChart3 size={28} />} />
      ) : (
        <>
          <div className="stat-grid">
            <article><span><CalendarDays size={18} /></span><strong>{snapshot.matches.length}</strong><small>partidas</small></article>
            <article><span><Target size={18} /></span><strong>{formatScore(best)}</strong><small>maior placar</small></article>
            <article><span><Trophy size={18} /></span><strong>{snapshot.rounds?.length ?? 0}</strong><small>rodadas detalhadas</small></article>
          </div>
          <section className="chart-card">
            <div className="section-heading"><div><span className="section-kicker">PLACAR POR PARTIDA</span><h2>Corrida no tempo</h2></div></div>
            <EvolutionChart snapshot={snapshot} />
          </section>
          <section>
            <div className="section-heading"><div><span className="section-kicker">PRECISÃO POR JOGADOR</span><h2>Especialidades</h2></div></div>
            {measured.length ? (
              <div className="specialty-card">
                <div className="specialty-head"><span>Jogador</span><span>Ano</span><span>Mapa</span><span>Pontos</span></div>
                {specialties.map((item) => (
                  <div className="specialty-row" key={item.player.id}>
                    <div><PlayerAvatar player={item.player} size="sm" /><strong>{item.player.nickname}</strong><small>{item.rounds ? `${item.rounds} rodadas` : 'sem detalhes'}</small></div>
                    <span title="Erro médio em anos"><Clock3 size={14} /><strong>{formatAverage(item.yearError)}</strong><small>anos</small></span>
                    <span title="Distância média"><Globe2 size={14} /><strong>{formatAverage(item.distanceKm)}</strong><small>km</small></span>
                    <span title="Pontuação média por rodada"><Trophy size={14} /><strong>{formatRoundAverage(item.roundScore)}</strong><small>média</small></span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="detail-empty"><span className="detail-empty__icon">📋</span><div><strong>Os placares antigos continuam valendo</strong><p>Cole um resultado compartilhado para liberar as métricas de ano e mapa.</p></div></div>
            )}
          </section>
          <section>
            <div className="section-heading"><div><span className="section-kicker">DESTAQUES</span><h2>Hall da fama</h2></div></div>
            <div className="achievement-grid">
              <article className="achievement achievement--gold"><span><Crown /></span><div><small>DONO DO TEMPO</small><strong>{champion?.nickname ?? '—'}</strong><p>Lidera o placar geral</p></div></article>
              <article className="achievement achievement--coral"><span><Clock3 /></span><div><small>MESTRE DO TEMPO</small><strong>{timeMaster?.player.nickname ?? 'Aguardando'}</strong><p>{timeMaster ? `${formatAverage(timeMaster.yearError)} anos de erro médio` : 'Importe resultados detalhados'}</p></div></article>
              <article className="achievement achievement--blue"><span><Globe2 /></span><div><small>MESTRE DO MAPA</small><strong>{geoMaster?.player.nickname ?? 'Aguardando'}</strong><p>{geoMaster ? `${formatAverage(geoMaster.distanceKm)} km de distância média` : 'Importe resultados detalhados'}</p></div></article>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function EvolutionChart({ snapshot }: { snapshot: RoomSnapshot }) {
  const matches = [...snapshot.matches].sort((a, b) => a.played_at.localeCompare(b.played_at)).slice(-8)
  const players = buildRanking(snapshot.players, snapshot.matches, snapshot.scores).slice(0, 4)
  const width = 680
  const height = 260
  const padding = { top: 20, right: 16, bottom: 34, left: 45 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const point = (index: number, score: number) => ({
    x: padding.left + (matches.length === 1 ? plotWidth / 2 : (index / (matches.length - 1)) * plotWidth),
    y: padding.top + plotHeight - (score / 50000) * plotHeight,
  })

  return (
    <div className="chart-wrap">
      <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolução de pontuação dos melhores jogadores">
        {[0, 10000, 20000, 30000, 40000, 50000].map((tick) => {
          const y = point(0, tick).y
          return <g key={tick}><line x1={padding.left} x2={width - padding.right} y1={y} y2={y} /><text x={padding.left - 8} y={y + 4}>{tick / 1000}k</text></g>
        })}
        {players.map((player) => {
          const points = matches
            .map((match, index) => {
              const score = snapshot.scores.find((item) => item.match_id === match.id && item.player_id === player.id)
              return score ? point(index, score.score) : null
            })
            .filter((item): item is { x: number; y: number } => item !== null)
          return (
            <g key={player.id} className="chart-series">
              <polyline points={points.map((item) => `${item.x},${item.y}`).join(' ')} style={{ stroke: player.color }} />
              {points.map((item, index) => <circle key={index} cx={item.x} cy={item.y} r="5" style={{ fill: player.color }} />)}
            </g>
          )
        })}
        {matches.map((match, index) => <text className="x-label" key={match.id} x={point(index, 0).x} y={height - 8}>{formatShortDate(match.played_at)}</text>)}
      </svg>
      <div className="chart-legend">{players.map((player) => <span key={player.id}><i style={{ background: player.color }} />{player.nickname}</span>)}</div>
    </div>
  )
}
