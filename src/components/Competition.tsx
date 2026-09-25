import { useEffect, useState } from 'react'
import { Check, ChevronRight, Download, LockKeyhole, Settings2, Share2, Sparkles, Swords, Trophy } from 'lucide-react'
import type { RoomSnapshot } from '../types'
import { ACHIEVEMENTS, achievementProgress, AVATARS, challengeResult, DEFAULT_COSMETIC, EMBLEMS, emptyProgress, FRAMES, THEMES, leagueToday, playerTrophies, rulesFor, shiftDay, weeklyMissions, weeklyStandings, weekOf, type Cosmetic, type ProgressCommand, type Season } from '../lib/progression'
import { buildHeadToHead, formatShortDate } from '../lib/ranking'
import { readProfileIdentity, repository } from '../lib/neonRepository'
import { DailyLink, PlayerAvatar, Sheet } from './ui'
import { downloadSeasonCard } from '../lib/seasonCard'

export function TrophyArt({ medal = 1, small = false }: { medal?: number; small?: boolean }) {
  const gold = medal === 1 ? '#f7cc67' : medal === 2 ? '#d7e5f2' : '#e4a67d'
  return <svg className={small ? 'trophy-art trophy-art--small' : 'trophy-art'} viewBox="0 0 180 180" role="img" aria-label={medal === 1 ? 'Troféu de campeão' : `Medalha de ${medal}º lugar`}>
    <circle cx="90" cy="90" r="74" fill={gold} opacity=".09" />
    <circle cx="90" cy="90" r="61" fill="none" stroke={gold} opacity=".3" strokeDasharray="2 8" />
    <path d="M57 49H37v15c0 23 15 36 35 36M123 49h20v15c0 23-15 36-35 36" fill="none" stroke={gold} strokeWidth="8" />
    <path d="M55 37h70v34c0 29-15 44-35 44S55 100 55 71Z" fill={gold} />
    <path d="M63 44h12v36c0 14 4 23 9 29-14-4-21-19-21-38Z" fill="#fff" opacity=".25" />
    <path d="M90 108v26m-22 6h44m-49 10h54" fill="none" stroke={gold} strokeWidth="10" strokeLinecap="round" />
    <path d="m90 54 5 10 12 2-9 8 2 12-10-6-10 6 2-12-9-8 12-2Z" fill="#70552a" opacity=".7" />
    <path d="m38 119 6 5m-5-17 6 6m91 6-6 5m5-17-6 6M48 22v12m-6-6h12m77 102v10m-5-5h10" stroke={gold} strokeWidth="3" strokeLinecap="round" />
  </svg>
}

type Props = { snapshot: RoomSnapshot; mode: 'week' | 'collection'; onChanged: () => Promise<void>; onLegacy: () => void; onNew: () => void; onToast: (text: string) => void }

export function CompetitionView({ snapshot, mode, onChanged, onLegacy, onNew, onToast }: Props) {
  const state = snapshot.progress ?? emptyProgress()
  const today = leagueToday()
  const week = weekOf(today)
  const rules = rulesFor(state, week.from)
  const current = weeklyStandings(snapshot, week.from, rules)
  const [identity, setIdentity] = useState(() => readProfileIdentity(snapshot.room.id))
  const active = snapshot.players.filter(p => !p.archived)
  const me = active.find(p => p.id === identity?.playerId)
  const [selected, setSelected] = useState(me?.id ?? active[0]?.id ?? '')
  const selectedPlayer = snapshot.players.find(p => p.id === selected) ?? active[0]
  const [panel, setPanel] = useState<'profile' | 'settings' | 'identity' | null>(null)
  const [tab, setTab] = useState<'race' | 'duels' | 'history'>('race')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [restore, setRestore] = useState('')
  const [claimPlayer, setClaimPlayer] = useState(me?.id ?? active[0]?.id ?? '')
  const [celebration, setCelebration] = useState<string[]>([])

  useEffect(() => {
    if (!panel) {
      if (window.history.state?.competitionSheet) window.history.back()
      return
    }
    if (!window.history.state?.competitionSheet) window.history.pushState({ competitionSheet: true }, '')
    const closeOnBack = () => setPanel(null)
    window.addEventListener('popstate', closeOnBack)
    return () => window.removeEventListener('popstate', closeOnBack)
  }, [panel])

  useEffect(() => {
    if (!me) return
    const key = `cronorank:seen-achievements:${snapshot.room.id}:${me.id}`
    const codes = state.earned.filter(e => e.playerId === me.id).map(e => e.code)
    let seen: string[] | null = null
    try { seen = JSON.parse(localStorage.getItem(key) ?? 'null') } catch { /* lista reiniciada */ }
    if (seen) {
      const fresh = codes.filter(c => !seen!.includes(c))
      if (fresh.length) setCelebration(fresh)
    }
    localStorage.setItem(key, JSON.stringify(codes))
  }, [state.earned, me?.id, snapshot.room.id])

  const run = async (task: () => Promise<unknown>, success: string) => {
    setBusy(true); setError('')
    try { await task(); await onChanged(); onToast(success) }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar. Tente novamente.') }
    finally { setBusy(false) }
  }
  const command = (cmd: ProgressCommand, success: string) => run(() => repository.progressCommand(snapshot.room.id, cmd), success)
  const claim = () => run(async () => {
    const next = await repository.claimProfile(snapshot.room.id, claimPlayer, restore.trim() || (identity?.playerId === claimPlayer ? identity.profileToken : undefined))
    setIdentity(next); setSelected(next.playerId); setPanel(null); setRestore('')
  }, 'Seu perfil está pronto neste aparelho!')
  const shareSeason = async (season: Season) => {
    const text = [`🏆 ${snapshot.room.name}`, `${formatShortDate(season.start)} a ${formatShortDate(season.end)}`, ...season.standings.map(p => `${['', '🥇', '🥈', '🥉'][p.position] ?? `${p.position}.`} ${p.nickname} · ${p.points} pts`), 'Nova semana, nova chance. Bora jogar?'].join('\n')
    try {
      if (navigator.share) await navigator.share({ title: 'Pódio da semana', text })
      else { await navigator.clipboard.writeText(text); onToast('Resumo copiado para compartilhar.') }
    } catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) onToast('Não foi possível compartilhar neste navegador.') }
  }
  const previous = [...state.seasons].reverse().find(s => s.eligible)
  const mine = current.standings.find(s => s.playerId === me?.id)
  const above = mine && current.standings.find(s => s.position === mine.position - 1)
  const missions = me ? weeklyMissions(snapshot, me.id, today) : []
  const duels = me ? buildHeadToHead(me.id, active, snapshot.scores) : []
  const earned = state.earned.filter(e => e.playerId === selectedPlayer?.id)
  const trophies = playerTrophies(state, selectedPlayer?.id ?? '')
  const ownCollection = me?.id === selectedPlayer?.id
  const nextUnlock = ACHIEVEMENTS.filter(a => !earned.some(e => e.code === a.code)).sort((a, b) => achievementProgress(snapshot, selectedPlayer?.id ?? '', b.code) / b.goal - achievementProgress(snapshot, selectedPlayer?.id ?? '', a.code) / a.goal)[0]

  return <div className="view-stack competition">
    <div className="competition-heading"><div><span className="section-kicker">{state.emblem} {snapshot.room.name}</span><h1>{mode === 'week' ? 'Uma nova chance.' : 'Suas histórias valem ouro.'}</h1><p>{mode === 'week' ? 'Toda semana começa do zero. Suas conquistas ficam.' : 'Cada troféu guarda uma disputa. Cada conquista, um passo seu.'}</p></div><button className="icon-button" aria-label="Configurar campeonato" onClick={() => setPanel('settings')}><Settings2 size={20} /></button></div>
    <button className="identity-bar" onClick={() => setPanel('identity')}>{me ? <><PlayerAvatar player={me} size="sm" /><span>Jogando como <strong>{me.nickname}</strong></span></> : <><Sparkles size={19} /><span><strong>Qual jogador é você?</strong><small>Ative suas metas e personalize seu perfil.</small></span></>}<ChevronRight size={17} /></button>
    {error && <p className="form-error" role="alert">{error}</p>}
    {celebration.length > 0 && <div className="unlock-banner" role="status"><Sparkles /><div><strong>Olha o que você conquistou!</strong><p>{celebration.map(code => ACHIEVEMENTS.find(a => a.code === code)?.name).join(' · ')}</p></div><button onClick={() => setCelebration([])} aria-label="Fechar celebração">×</button></div>}

    {mode === 'week' ? <>
      <section className="season-hero"><div className="season-hero__copy"><span className="eyebrow eyebrow--light">TEMPORADA SEMANAL</span><h2>{formatShortDate(week.from)} <span>—</span> {formatShortDate(week.to)}</h2><p>{current.standings.length ? <><strong>{current.standings.filter(p => p.position === 1).map(p => p.nickname).join(' e ')}</strong> na liderança provisória</> : 'O primeiro capítulo ainda está por jogar.'}</p><div className="season-pills"><span>{current.days}/7 dias disputados</span><span>{rules.bestDays === 5 ? 'Seus 5 melhores dias' : 'Todos os 7 dias'}</span></div><DailyLink label="Jogar a daily" /></div><TrophyArt /><div className="season-hero__footer"><span>Segunda a domingo · horário de Brasília</span><span>Resultados atrasados até segunda, 23h59</span></div></section>
      <div className="segmented arena-tabs" role="tablist" aria-label="Campeonato"><button role="tab" aria-selected={tab === 'race'} className={tab === 'race' ? 'active' : ''} onClick={() => setTab('race')}>A semana</button><button role="tab" aria-selected={tab === 'duels'} className={tab === 'duels' ? 'active' : ''} onClick={() => setTab('duels')}>Rivalidades</button><button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Galeria de campeões</button></div>

      {tab === 'race' && <>
        {me && <section className="personal-nudge"><span>SEU PRÓXIMO PASSO</span><strong>{mine ? above ? `${Math.max(0, above.points - mine.points)} pontos separam você de ${above.nickname}.` : mine.position === 1 ? 'Você está no topo. A semana ainda está em jogo!' : 'Mais uma partida pode mudar sua semana.' : 'Sua disputa começa com a próxima partida.'}</strong><p>Jogue no seu ritmo. Recordes pessoais e conquistas também contam sua história.</p></section>}
        <section><div className="section-heading"><div><span className="section-kicker">A CORRIDA RECOMEÇA TODA SEGUNDA</span><h2>Pódio em disputa</h2></div><button className="text-button" onClick={onNew}>+ Resultado</button></div>
          <div className="weekly-table">{current.standings.length ? current.standings.map(row => { const player = snapshot.players.find(p => p.id === row.playerId)!; return <div key={row.playerId} className={`weekly-row ${row.playerId === me?.id ? 'weekly-row--me' : ''}`}><span className="weekly-position">{row.position <= 3 ? ['🥇', '🥈', '🥉'][row.position - 1] : row.position}</span><PlayerAvatar player={player} size="sm" /><div className="weekly-name"><strong>{row.nickname}{row.playerId === me?.id && <small>você</small>}</strong><span>{row.days} dias · {row.wins} vitórias{rules.bestDays === 5 ? ` · ${row.counted} contam` : ''}</span></div><strong className="weekly-points">{row.points}<small>pts</small></strong></div> }) : <div className="competition-empty"><Trophy size={28} /><strong>O pódio está aberto.</strong><p>Registre a mesma daily com um amigo para abrir a disputa.</p><button className="primary-button" onClick={onNew}>Registrar resultado</button></div>}</div>
          <p className="section-note">{rules.scoring === 'podium' ? '1º: 5 · 2º: 3 · 3º: 1 ponto.' : '1º: 7 · 2º: 5 · 3º: 3 · 4º: 2 · demais: 1 ponto.'} Desempate: vitórias e placar somado. Igualdade completa divide o lugar.</p>
          {!current.eligible && <p className="qualification-note">Para entregar troféus: pelo menos 2 dias disputados e 2 jogadores com participação em 2 dias.</p>}
          <button className="text-button" onClick={onLegacy}>Consultar rankings e outros períodos <ChevronRight size={15} /></button>
        </section>
        {me && <section><div className="section-heading"><div><span className="section-kicker">PEQUENOS PASSOS, NOVAS HISTÓRIAS</span><h2>Missões da semana</h2></div><span className="mission-count">{missions.filter(m => m.current >= m.goal).length}/3</span></div><div className="mission-grid">{missions.map(m => <article className={`mission-card ${m.current >= m.goal ? 'mission-card--done' : ''}`} key={m.name}><span className="mission-icon">{m.current >= m.goal ? '✓' : m.icon}</span><strong>{m.name}</strong><p>{m.description}</p><progress value={Math.min(m.current, m.goal)} max={m.goal} aria-label={m.name} /><small>{Math.min(m.current, m.goal)}/{m.goal} {m.current >= m.goal ? '· missão concluída' : '· no seu ritmo'}</small></article>)}</div><p className="section-note">As missões renovam na segunda e não alteram o placar. Uma pausa não apaga suas conquistas.</p></section>}
        {previous && <section className="last-champion"><TrophyArt small /><div><span className="section-kicker">ÚLTIMA SEMANA PREMIADA</span><h3>{previous.standings.filter(p => p.position === 1).map(p => p.nickname).join(' e ')}</h3><p>{formatShortDate(previous.start)} a {formatShortDate(previous.end)} · história guardada</p></div><button className="icon-button" aria-label="Ver campeões" onClick={() => setTab('history')}><ChevronRight /></button></section>}
        <details className="competition-rules"><summary>Como funciona o campeonato?</summary><p>Vale uma partida por dia: a importada com menor número oficial; sem importação, a primeira cadastrada. Extras ficam no histórico. Uma partida só pontua com pelo menos dois jogadores.</p><p>A semana termina domingo. Segunda é o prazo para lançamentos atrasados; terça os prêmios são confirmados no próximo acesso à liga. Correções posteriores ficam registradas e revisam os prêmios.</p><p>Partidas antigas usam a data em que foram jogadas. Empates dividem a colocação (dois primeiros deixam o próximo em terceiro). As regras de pontuação só mudam na próxima semana.</p></details>
      </>}
      {tab === 'duels' && <>
        <section className="duel-intro"><Swords /><div><h2>Uma boa rivalidade tem volta.</h2><p>Desafie um amigo para as próximas 5 partidas em comum. Ele precisa aceitar. Vocês têm 14 dias, sem vitória por ausência.</p></div></section>
        {!me ? <button className="primary-button" onClick={() => setPanel('identity')}>Escolher meu perfil</button> : <>
          <div className="rival-grid">{active.filter(p => p.id !== me.id).map(opponent => { const duel = duels.find(d => d.opponent.id === opponent.id); const weekly = buildHeadToHead(me.id, active, snapshot.scores.filter(s => snapshot.matches.some(m => m.id === s.match_id && m.played_at >= week.from && m.played_at <= week.to))).find(d => d.opponent.id === opponent.id); return <article className="rival-card" key={opponent.id}><PlayerAvatar player={opponent} size="lg" /><h3>{opponent.nickname}</h3><strong>{duel?.wins ?? 0} <span>×</span> {duel?.losses ?? 0}</strong><p>Seu retrospecto · {duel?.draws ?? 0} empates</p><small>Na semana: {weekly?.wins ?? 0} × {weekly?.losses ?? 0}</small><button className="secondary-button" disabled={busy} onClick={() => command({ type: 'challenge', opponentId: opponent.id }, 'Convite criado. Seu amigo pode aceitar em Rivalidades.')}><Swords size={15} /> Chamar para revanche</button></article> })}</div>
          {active.length < 2 && <p className="section-note">Adicione mais um jogador para começar os confrontos.</p>}
        </>}
        <section><div className="section-heading"><h2>Desafios da liga</h2></div><div className="challenge-list">{[...state.challenges].reverse().map(c => { const result = challengeResult(snapshot, c, today); const name = (id: string) => snapshot.players.find(p => p.id === id)?.nickname ?? 'Jogador'; return <article className="challenge-card" key={c.id}><span className="section-kicker">{c.status === 'declined' ? 'CONVITE RECUSADO' : c.status === 'cancelled' ? 'CONVITE CANCELADO' : result.finished ? result.games ? 'CONFRONTO ENCERRADO' : 'ENCERRADO SEM PARTIDAS' : result.expired ? 'CONVITE EXPIRADO' : c.status === 'pending' ? 'AGUARDANDO ACEITE' : 'DESAFIO EM JOGO'}</span><h3>{name(c.from)} <span>×</span> {name(c.to)}</h3>{c.status === 'active' && <><strong className="challenge-score">{result.wins} <span>—</span> {result.losses}</strong><p>{result.games}/5 partidas · {result.draws} empates · até {formatShortDate(c.end)}</p>{result.finished && <strong>{result.winner ? `${name(result.winner)} venceu!` : result.games ? 'Disputa empatada. Cabe uma revanche!' : 'A próxima oportunidade está aberta.'}</strong>}</>}{c.status === 'pending' && !result.expired && <><p>Convite válido até {formatShortDate(c.end)}.</p>{me?.id === c.to && <div className="button-row"><button className="primary-button" disabled={busy} onClick={() => command({ type: 'respond', challengeId: c.id, response: 'accept' }, 'Desafio aceito! Valem novas partidas a partir de agora.')}>Aceitar desafio</button><button className="text-button" disabled={busy} onClick={() => command({ type: 'respond', challengeId: c.id, response: 'decline' }, 'Convite recusado.')}>Agora não</button></div>}{me?.id === c.from && <button className="text-button" disabled={busy} onClick={() => command({ type: 'respond', challengeId: c.id, response: 'cancel' }, 'Convite cancelado.')}>Cancelar convite</button>}</>}</article> })}{!state.challenges.length && <p className="competition-empty">O primeiro desafio pode ser seu. Escolha um amigo acima.</p>}</div></section>
        <ActivityFeed snapshot={snapshot} />
      </>}
      {tab === 'history' && <section><div className="section-heading"><div><span className="section-kicker">A MEMÓRIA DA LIGA</span><h2>Semanas que viraram história</h2></div></div><div className="season-history">{[...state.seasons].reverse().map(season => <article className="season-history-card" key={season.start}><div className="season-history-title"><TrophyArt small /><div><h3>{formatShortDate(season.start)} — {formatShortDate(season.end)}</h3><span>{season.eligible ? 'Premiação confirmada' : 'Sem premiação · participação insuficiente'}</span>{season.revision > 1 && <small>Resultado revisado · versão {season.revision}</small>}</div></div>{season.standings.slice(0, 6).map(p => <div className="season-history-row" key={p.playerId}><span>{season.eligible && p.position <= 3 ? ['🥇', '🥈', '🥉'][p.position - 1] : `${p.position}º`}</span><strong>{p.nickname}</strong><span>{p.points} pts</span></div>)}{season.eligible && <div className="button-row"><button className="text-button" onClick={() => shareSeason(season)}><Share2 size={15} /> Compartilhar</button><button className="text-button" onClick={() => run(() => downloadSeasonCard(snapshot.room.name, season), 'Cartão da semana pronto.')} disabled={busy}><Download size={15} /> Salvar cartão</button></div>}</article>)}{!state.seasons.length && <div className="competition-empty"><TrophyArt small /><strong>A primeira taça está em disputa.</strong><p>As semanas encerradas aparecem aqui após o prazo de lançamentos.</p></div>}</div></section>}
    </> : <>
      <label className="field"><span>Coleção do jogador</span><select aria-label="Coleção do jogador" value={selectedPlayer?.id ?? ''} onChange={e => setSelected(e.target.value)}>{snapshot.players.map(p => <option key={p.id} value={p.id}>{p.nickname}{p.archived ? ' · arquivado' : ''}</option>)}</select></label>
      {selectedPlayer && <>
        <section className={`collection-hero card-theme--${selectedPlayer.cosmetic?.theme ?? 'navy'} frame-theme--${selectedPlayer.cosmetic?.frame ?? 'none'}`}><PlayerAvatar player={selectedPlayer} size="xl" /><div><span className="eyebrow eyebrow--light">PASSAPORTE DO CRONONAUTA</span><h2>{selectedPlayer.nickname}</h2><p>{ACHIEVEMENTS.find(a => a.code === selectedPlayer.cosmetic?.title)?.name ?? 'Toda jornada merece ser lembrada.'}</p><div className="featured-badges">{selectedPlayer.cosmetic?.featured.map(code => { const a = ACHIEVEMENTS.find(a => a.code === code); return a && <span key={code} title={a.name}>{a.icon} {a.name}</span> })}</div></div>{ownCollection && <button className="secondary-button" onClick={() => setPanel('profile')}>Personalizar</button>}</section>
        <div className="collection-stats"><div><strong>{trophies.filter(t => t.position === 1).length}</strong><span>🏆 títulos semanais</span></div><div><strong>{trophies.length}</strong><span>🥇 pódios semanais</span></div><div><strong>{earned.length}<small>/{ACHIEVEMENTS.length}</small></strong><span>✨ conquistas</span></div></div>
        <section><div className="section-heading"><div><span className="section-kicker">CADA TAÇA TEM UMA DATA</span><h2>Estante de troféus</h2></div></div><div className="trophy-shelf">{trophies.slice().reverse().map(t => <article className="shelf-trophy" key={t.start}><TrophyArt medal={t.position} small /><strong>{t.position === 1 ? 'Campeão' : t.position === 2 ? 'Prata' : 'Bronze'}</strong><span>{formatShortDate(t.start)} — {formatShortDate(t.end)}</span><small>{t.points} pontos · {t.days} dias</small></article>)}{!trophies.length && <div className="empty-shelf"><TrophyArt small /><div><strong>Tem espaço para sua próxima história.</strong><p>Os pódios de semanas encerradas ficam aqui para sempre, sujeitos apenas a correções de resultados.</p></div></div>}</div></section>
        {nextUnlock && <section className="personal-nudge"><span>UMA CONQUISTA AO SEU ALCANCE</span><strong>{nextUnlock.icon} {nextUnlock.name}</strong><p>{nextUnlock.description}</p><progress value={achievementProgress(snapshot, selectedPlayer.id, nextUnlock.code)} max={nextUnlock.goal} aria-label={`Progresso de ${nextUnlock.name}`} /></section>}
        <section><div className="section-heading"><div><span className="section-kicker">PARTICIPAÇÃO · PRECISÃO · AMIZADE</span><h2>Álbum de conquistas</h2></div></div><div className="badge-grid">{ACHIEVEMENTS.map(a => { const unlocked = earned.find(e => e.code === a.code); const progress = achievementProgress(snapshot, selectedPlayer.id, a.code); return <article className={`badge-card badge-card--${a.rarity === 'épica' ? 'epic' : a.rarity === 'rara' ? 'rare' : 'common'} ${unlocked ? 'badge-card--earned' : ''}`} key={a.code}><div className="badge-card__top"><span className="badge-icon">{a.icon}</span><span className="badge-rarity">{unlocked ? <Check size={12} /> : <LockKeyhole size={12} />}{a.rarity}</span></div><h3>{a.name}</h3><p>{a.description}</p>{unlocked ? <div className="badge-proof"><strong>Conquistada em {formatShortDate(unlocked.date)}</strong><span>{unlocked.evidence}</span></div> : <><progress value={Math.min(progress, a.goal)} max={a.goal} aria-label={`Progresso de ${a.name}`} /><small>{Math.min(progress, a.goal)}/{a.goal} · ainda há história pela frente</small></>}</article> })}</div></section>
      </>}
    </>}

    {panel === 'identity' && <Sheet title="Seu lugar na liga" subtitle="Um perfil para guardar seu estilo e aceitar seus desafios." onClose={() => setPanel(null)}><div className="sheet-form"><label className="field"><span>Eu sou</span><select aria-label="Eu sou" value={claimPlayer} onChange={e => setClaimPlayer(e.target.value)}>{active.map(p => <option key={p.id} value={p.id}>{p.nickname}{snapshot.claimedPlayers?.includes(p.id) ? ' · perfil vinculado' : ''}</option>)}</select></label><p className="section-note">Escolha apenas seu próprio perfil. O primeiro vínculo protege a personalização e o aceite de desafios com uma chave privada.</p><label className="field"><span>Chave de um perfil já vinculado (opcional)</span><input type="password" autoComplete="off" value={restore} onChange={e => setRestore(e.target.value)} placeholder="Cole a chave do seu outro aparelho" /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" disabled={busy || !claimPlayer} onClick={claim}>{busy ? 'Vinculando…' : 'Usar este perfil'}</button>{identity && <details className="competition-rules"><summary>Levar meu perfil para outro aparelho</summary><p>Guarde esta chave em um local privado. Ela permite recuperar seu perfil; o código da liga continua necessário.</p><button className="secondary-button" onClick={async () => { try { await navigator.clipboard.writeText(identity.profileToken); onToast('Chave do perfil copiada. Guarde em local privado.') } catch { setError('O navegador não permitiu copiar a chave.') } }}>Copiar minha chave privada</button></details>}</div></Sheet>}
    {panel === 'profile' && me && <Customization playerId={me.id} snapshot={snapshot} busy={busy} error={error} onClose={() => setPanel(null)} onSave={async profile => { await command({ type: 'profile', ...profile }, 'Seu estilo foi salvo!') }} />}
    {panel === 'settings' && <LeagueSettings snapshot={snapshot} busy={busy} error={error} canEdit={!!me} onIdentity={() => setPanel('identity')} onClose={() => setPanel(null)} onSave={cmd => command(cmd, 'Preferências salvas. Novas regras valem na próxima semana.')} />}
  </div>
}

function ActivityFeed({ snapshot }: { snapshot: RoomSnapshot }) {
  const state = snapshot.progress ?? emptyProgress()
  const events = state.earned.filter(e => state.playful || !['revenge', 'close'].includes(e.code)).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8)
  return <section><div className="section-heading"><div><span className="section-kicker">ACONTECEU NA TURMA</span><h2>Feitos para lembrar</h2></div></div><div className="activity-feed">{events.map(e => { const a = ACHIEVEMENTS.find(a => a.code === e.code)!; return <article key={e.id}><span>{a.icon}</span><div><strong>{snapshot.players.find(p => p.id === e.playerId)?.nickname} conquistou {a.name}</strong><p>{e.evidence}</p></div></article> })}{!events.length && <p className="section-note">Os próximos feitos da turma aparecem aqui.</p>}</div></section>
}

function Customization({ playerId, snapshot, busy, error, onClose, onSave }: { playerId: string; snapshot: RoomSnapshot; busy: boolean; error: string; onClose: () => void; onSave: (profile: Cosmetic) => Promise<void> }) {
  const [profile, setProfile] = useState(snapshot.progress?.profiles[playerId] ?? DEFAULT_COSMETIC)
  const earned = snapshot.progress?.earned.filter(e => e.playerId === playerId) ?? []
  const player = snapshot.players.find(p => p.id === playerId)!
  return <Sheet title="Seu jeito de viajar" subtitle="Seu estilo evolui com suas conquistas. Nenhum item altera seus pontos." onClose={onClose}><form className="sheet-form" onSubmit={e => { e.preventDefault(); void onSave(profile) }}><div className="cosmetic-preview"><PlayerAvatar player={{ ...player, cosmetic: profile }} size="xl" /><strong>{player.nickname}</strong><span>{ACHIEVEMENTS.find(a => a.code === profile.title)?.name ?? 'Crononauta'}</span></div><fieldset className="cosmetic-picker"><legend>Seu avatar</legend><div>{AVATARS.map(avatar => <button type="button" key={avatar} aria-pressed={profile.avatar === avatar} aria-label={avatar === 'initials' ? 'Usar minhas iniciais' : `Avatar ${avatar}`} onClick={() => setProfile({ ...profile, avatar })}>{avatar === 'initials' ? 'Ab' : avatar}</button>)}</div></fieldset><fieldset className="cosmetic-picker"><legend>Moldura · conquiste para desbloquear</legend><div>{FRAMES.map(frame => <button type="button" className={`frame-option frame-theme--${frame.id}`} key={frame.id} disabled={earned.length < frame.need} aria-pressed={profile.frame === frame.id} onClick={() => setProfile({ ...profile, frame: frame.id })}>{frame.name}<small>{frame.need ? `${frame.need} conquistas` : 'Livre'}</small></button>)}</div></fieldset><label className="field"><span>Fundo do cartão</span><select aria-label="Fundo do cartão" value={profile.theme ?? 'navy'} onChange={e => setProfile({ ...profile, theme: e.target.value })}>{THEMES.map(theme => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></label><label className="field"><span>Título abaixo do nick</span><select aria-label="Título abaixo do nick" value={profile.title} onChange={e => setProfile({ ...profile, title: e.target.value })}><option value="">Crononauta</option>{earned.map(e => <option value={e.code} key={e.code}>{ACHIEVEMENTS.find(a => a.code === e.code)?.name}</option>)}</select></label><fieldset className="featured-picker"><legend>Sua vitrine · até 3 conquistas</legend>{earned.map(e => { const a = ACHIEVEMENTS.find(a => a.code === e.code)!; return <label key={e.code}><input type="checkbox" checked={profile.featured.includes(e.code)} disabled={!profile.featured.includes(e.code) && profile.featured.length >= 3} onChange={event => setProfile({ ...profile, featured: event.target.checked ? [...profile.featured, e.code] : profile.featured.filter(c => c !== e.code) })} />{a.icon} {a.name}</label> })}{!earned.length && <p className="section-note">Sua primeira partida já abre uma conquista.</p>}</fieldset>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? 'Salvando…' : 'Salvar meu estilo'}</button></form></Sheet>
}

function LeagueSettings({ snapshot, busy, error, canEdit, onIdentity, onClose, onSave }: { snapshot: RoomSnapshot; busy: boolean; error: string; canEdit: boolean; onIdentity: () => void; onClose: () => void; onSave: (cmd: ProgressCommand) => Promise<void> }) {
  const state = snapshot.progress ?? emptyProgress()
  const effective = shiftDay(weekOf(leagueToday()).from, 7)
  const next = rulesFor(state, effective)
  const [bestDays, setBestDays] = useState<5 | 7>(next.bestDays)
  const [scoring, setScoring] = useState(next.scoring)
  const [emblem, setEmblem] = useState(state.emblem)
  const [playful, setPlayful] = useState(state.playful)
  const [name, setName] = useState(snapshot.room.name)
  return <Sheet title="Do jeito da turma" subtitle="Combinem as regras juntos. Qualquer perfil vinculado pode ajustar a liga." onClose={onClose}><form className="sheet-form" onSubmit={e => { e.preventDefault(); void onSave({ type: 'settings', bestDays, scoring, emblem, playful, name }) }}><label className="field"><span>Nome da liga</span><input required minLength={2} maxLength={40} value={name} onChange={e => setName(e.target.value)} /></label><label className="field"><span>Dias que contam no campeonato</span><select aria-label="Dias que contam no campeonato" value={bestDays} onChange={e => setBestDays(Number(e.target.value) as 5 | 7)}><option value={7}>Todos os 7 dias</option><option value={5}>Os 5 melhores dias · espaço para uma pausa</option></select></label><label className="field"><span>Pontuação por colocação</span><select aria-label="Pontuação por colocação" value={scoring} onChange={e => setScoring(e.target.value as typeof scoring)}><option value="podium">Pódio: 5 / 3 / 1 / 0</option><option value="everyone">Todos pontuam: 7 / 5 / 3 / 2 / 1</option></select></label><p className="qualification-note">Essas regras entram em vigor em {formatShortDate(effective)}. A semana atual e o histórico mantêm as próprias regras.</p><fieldset className="cosmetic-picker"><legend>Emblema da liga</legend><div>{EMBLEMS.map(value => <button type="button" key={value} aria-pressed={emblem === value} onClick={() => setEmblem(value)}>{value}</button>)}</div></fieldset><label className="toggle-label"><input type="checkbox" checked={playful} onChange={e => setPlayful(e.target.checked)} /> Mostrar provocações leves no mural</label><p className="section-note">Emblema e tom do mural mudam imediatamente. Conquistas continuam disponíveis para todos.</p>{error && <p className="form-error" role="alert">{error}</p>}{canEdit ? <button className="primary-button" disabled={busy}>{busy ? 'Salvando…' : 'Salvar preferências da liga'}</button> : <button type="button" className="primary-button" onClick={onIdentity}>Vincular meu perfil para configurar</button>}</form></Sheet>
}
