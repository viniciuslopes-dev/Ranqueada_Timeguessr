import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, CloudOff, Download, Gamepad2, Medal, RefreshCw, Share2, Trophy, Users } from 'lucide-react'
import { Onboarding, Reconnect } from './components/Onboarding'
import { MatchDetailSheet, MatchEditSheet, MatchSheet, PeriodSheet, PlayerSheet, ShareSheet } from './components/Sheets'
import { InsightsView, MatchesView, PeriodBar, PlayersView, RankingView } from './components/Views'
import { getDailyStatus } from './lib/ranking'
import { CompetitionView } from './components/Competition'
import { leagueToday, weekClosed, weekOf } from './lib/progression'
import { Brand, Spinner } from './components/ui'
import { filterSnapshotByPeriod, formatPeriodLabel, isWithinRange, resolvePeriod, type Period, type PeriodPreset } from './lib/period'
import { readProfileIdentity, repository } from './lib/neonRepository'
import { isAccessRevoked, isTemporaryFailure } from './lib/api'
import { clearActiveRoom, describeSavedAt, forgetRoom, readActiveRoomId, saveActiveRoomId } from './lib/roomAccess'
import type { GameMatch, ImportResultInput, MatchInput, MatchUpdateInput, Player, RankingMetric, RoomSnapshot } from './types'

const PERIOD_KEY = 'cronorank:period'
const METRIC_KEY = 'cronorank:metric'
type ViewName = 'arena' | 'collection' | 'ranking' | 'matches' | 'players' | 'insights'
type ModalName = 'match' | 'match-edit' | 'match-detail' | 'period' | 'player' | 'share' | null

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// guardamos o preset, nunca o intervalo ja resolvido: "semana atual" precisa
// virar junto com a semana em vez de congelar na que foi escolhida.
function readStoredPeriod(): Period {
  try {
    const raw = localStorage.getItem(PERIOD_KEY)
    if (!raw) return { preset: 'week' }
    const saved = JSON.parse(raw) as Period
    if (saved.preset === 'custom' && saved.from && saved.to) return saved
    if (saved.preset === 'all') return { preset: 'all' }
    if (saved.preset === 'today' || saved.preset === 'week' || saved.preset === 'month') return { preset: saved.preset }
  } catch { /* preferencia corrompida volta para o padrao */ }
  return { preset: 'week' }
}

// o criterio do ranking fica salvo: quem joga no modo liga nao quer reescolher
// a cada abertura do app
function readStoredMetric(): RankingMetric {
  const saved = localStorage.getItem(METRIC_KEY)
  return saved === 'average' || saved === 'wins' || saved === 'total' ? saved : 'league'
}

function readableError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/sem internet/i.test(message)) return message
  if (/duplicate|unique/i.test(message)) return 'Esse nick já está na liga. Escolha outro.'
  if (/not found|não encontr|P0002/i.test(message)) return 'Não encontramos essa liga. Confira o código.'
  if (/row-level|policy|permission/i.test(message)) return 'Seu acesso à liga expirou. Entre novamente pelo código.'
  if (/DATABASE_URL/i.test(message)) return 'Configure a DATABASE_URL do Neon na Netlify.'
  if (/fetch|network/i.test(message)) return 'Sem conexão com o banco. Confira sua internet e tente de novo.'
  return message || 'Algo saiu do mapa. Tente novamente.'
}

export default function App() {
  const queryCode = useMemo(() => new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '', [])
  // texto recebido pela folha de compartilhamento do sistema (share_target)
  const sharedResult = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return [params.get('text'), params.get('title')].filter(Boolean).join('\n').trim()
  }, [])
  const [pendingShare, setPendingShare] = useState(sharedResult)
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null)
  const [activeRoomId, setActiveRoomId] = useState(readActiveRoomId)
  // quando preenchido, a tela mostra a copia salva no aparelho em vez dos dados vivos
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  const [view, setView] = useState<ViewName>('arena')
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [view])
  const [metric, setMetric] = useState<RankingMetric>(readStoredMetric)
  const [modal, setModal] = useState<ModalName>(null)
  const [editingPlayer, setEditingPlayer] = useState<Player | undefined>()
  const [editingMatch, setEditingMatch] = useState<GameMatch | undefined>()
  const [detailMatch, setDetailMatch] = useState<GameMatch | undefined>()
  const [booting, setBooting] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [online, setOnline] = useState(navigator.onLine)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [period, setPeriod] = useState<Period>(readStoredPeriod)
  const seenScores = useRef<Set<string>>(new Set())

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2800)
  }, [])

  const [leagueDay, setLeagueDay] = useState(leagueToday)
  useEffect(() => { const timer = window.setInterval(() => setLeagueDay(leagueToday()), 30000); return () => window.clearInterval(timer) }, [])
  const range = useMemo(() => resolvePeriod(period, leagueDay), [period, leagueDay])
  const visible = useMemo(() => snapshot ? filterSnapshotByPeriod(snapshot, range) : null, [snapshot, range])
  // o quadro de hoje ignora o filtro: ele responde "quem ja lancou o de hoje?"
  const today = useMemo(() => snapshot ? getDailyStatus(snapshot.players, snapshot.matches, snapshot.scores, leagueDay) : null, [snapshot, leagueDay])

  useEffect(() => {
    localStorage.setItem(PERIOD_KEY, JSON.stringify(period))
  }, [period])

  useEffect(() => {
    localStorage.setItem(METRIC_KEY, metric)
  }, [metric])

  const clearModal = useCallback(() => {
    setModal(null)
    setEditingPlayer(undefined)
    setEditingMatch(undefined)
    setDetailMatch(undefined)
    setPendingShare('')
  }, [])

  // Cada folha aberta vira uma entrada no historico para que o botao "voltar" do
  // aparelho feche a folha em vez de minimizar o aplicativo.
  const openModal = useCallback((name: Exclude<ModalName, null>) => {
    window.history.pushState({ cronorankSheet: true }, '')
    setModal(name)
  }, [])

  const closeModal = useCallback(() => {
    clearModal()
    if (window.history.state?.cronorankSheet) window.history.back()
  }, [clearModal])

  const loadRoom = useCallback(async (roomId: string, quiet = false) => {
    try {
      const data = await repository.loadRoom(roomId)
      // numa recarga automatica, avisa os placares que chegaram de outro aparelho
      if (quiet) {
        const arrivals = data.scores.filter((score) => !seenScores.current.has(score.id))
        const names = [...new Set(arrivals.map((score) => data.players.find((player) => player.id === score.player_id)?.nickname).filter(Boolean))]
        if (names.length === 1) showToast(`${names[0]} lançou um resultado!`)
        else if (names.length > 1) showToast(`${names.length} resultados novos chegaram!`)
      }
      seenScores.current = new Set(data.scores.map((score) => score.id))
      setSnapshot(data)
      setCachedAt(null)
      setError('')
    } catch (loadError) {
      if (!quiet) setError(readableError(loadError))
      throw loadError
    }
  }, [showToast])

  // Sai da liga de verdade: apaga token e copia local. So acontece quando o
  // servidor recusa o acesso ou quando o usuario pede para sair.
  const forgetAccess = useCallback((roomId: string | null) => {
    if (roomId) forgetRoom(roomId)
    else clearActiveRoom()
    setActiveRoomId(null)
    setSnapshot(null)
    setCachedAt(null)
    setView('arena')
  }, [])

  // Abertura sem internet: em vez de pedir o codigo de novo, mostra o ultimo
  // ranking sincronizado e segue tentando reconectar em segundo plano.
  const showCachedRoom = useCallback((roomId: string) => {
    const cached = repository.readCachedRoom(roomId)
    if (!cached) return false
    seenScores.current = new Set(cached.snapshot.scores.map((score) => score.id))
    setSnapshot(cached.snapshot)
    setCachedAt(cached.savedAt)
    setError('')
    return true
  }, [])

  const reconnect = useCallback(async () => {
    if (!activeRoomId) return
    setBusy(true)
    try {
      await loadRoom(activeRoomId)
    } catch (retryError) {
      if (isTemporaryFailure(retryError)) return
      forgetAccess(activeRoomId)
      setError(readableError(retryError))
    } finally {
      setBusy(false)
    }
  }, [activeRoomId, loadRoom, forgetAccess])

  useEffect(() => {
    let active = true
    const boot = async () => {
      try {
        await repository.initialize()
        if (activeRoomId) await loadRoom(activeRoomId)
      } catch (bootError) {
        if (!active) return
        // falha temporaria nunca custa o acesso: o token continua guardado, a
        // tela mostra o ultimo ranking salvo e o app volta sozinho depois
        if (activeRoomId && isTemporaryFailure(bootError)) showCachedRoom(activeRoomId)
        else {
          forgetAccess(activeRoomId)
          setError(readableError(bootError))
        }
      } finally {
        if (active) setBooting(false)
      }
    }
    void boot()
    return () => { active = false }
  }, []) // a inicialização acontece apenas na abertura

  // sem copia salva a tela de reconexao fica esperando; quando a internet volta,
  // tenta de novo sozinha
  useEffect(() => {
    if (booting || snapshot || !activeRoomId || !online) return
    void reconnect()
  }, [booting, snapshot, activeRoomId, online, reconnect])

  useEffect(() => {
    if (!activeRoomId || !snapshot) return
    return repository.subscribe(activeRoomId, () => {
      void loadRoom(activeRoomId, true).catch((refreshError: unknown) => {
        if (!isAccessRevoked(refreshError)) return
        forgetAccess(activeRoomId)
        setError(readableError(refreshError))
      })
    })
  }, [activeRoomId, snapshot?.room.id, loadRoom])

  useEffect(() => {
    const closeOnBack = () => clearModal()
    window.addEventListener('popstate', closeOnBack)
    return () => window.removeEventListener('popstate', closeOnBack)
  }, [clearModal])

  useEffect(() => {
    const connected = () => setOnline(true)
    const disconnected = () => setOnline(false)
    const beforeInstall = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    window.addEventListener('online', connected)
    window.addEventListener('offline', disconnected)
    window.addEventListener('beforeinstallprompt', beforeInstall)
    return () => {
      window.removeEventListener('online', connected)
      window.removeEventListener('offline', disconnected)
      window.removeEventListener('beforeinstallprompt', beforeInstall)
    }
  }, [])

  const enterRoom = async (roomId: string) => {
    saveActiveRoomId(roomId)
    setActiveRoomId(roomId)
    await loadRoom(roomId)
    window.history.replaceState({}, '', window.location.pathname)
  }

  const createRoom = async (name: string, nickname: string) => {
    setBusy(true)
    setError('')
    try {
      const result = await repository.createRoom(name, nickname)
      await enterRoom(result.roomId)
      showToast(`Liga criada! Código ${result.code}`)
    } catch (createError) {
      setError(readableError(createError))
    } finally {
      setBusy(false)
    }
  }

  const joinRoom = async (code: string, nickname: string) => {
    setBusy(true)
    setError('')
    try {
      const result = await repository.joinRoom(code, nickname)
      await enterRoom(result.roomId)
      showToast('Você entrou na liga!')
    } catch (joinError) {
      setError(readableError(joinError))
    } finally {
      setBusy(false)
    }
  }

  const openDemo = async () => {
    setBusy(true)
    try {
      await enterRoom(repository.demoRoomId)
    } finally {
      setBusy(false)
    }
  }

  const mutate = async (action: () => Promise<void>, success: string) => {
    if (!activeRoomId) return
    setBusy(true)
    try {
      await action()
      await loadRoom(activeRoomId)
      closeModal()
      showToast(success)
    } catch (mutationError) {
      showToast(readableError(mutationError))
    } finally {
      setBusy(false)
    }
  }

  const clearPeriod = useCallback(() => setPeriod({ preset: 'all' }), [])

  const openMatchDetail = useCallback((match: GameMatch) => {
    setDetailMatch(match)
    openModal('match-detail')
  }, [openModal])

  useEffect(() => {
    if (!pendingShare || !snapshot?.players.length) return
    // tira o texto da URL antes de empilhar a entrada da folha no historico
    window.history.replaceState({}, '', window.location.pathname)
    openModal('match')
  }, [pendingShare, snapshot?.players.length, openModal])

  const openNewMatch = () => {
    if (!snapshot?.players.some(p => !p.archived)) {
      setView('players')
      showToast('Adicione pelo menos um jogador primeiro.')
      return
    }
    openModal('match')
  }

  // uma partida lancada fora do periodo filtrado some da tela; avisamos em vez
  // de deixar parecer que o salvamento falhou
  const savedMessage = (playedAt: string, success: string) =>
    isWithinRange(playedAt, range) ? success : 'Salvo, mas fora do período filtrado.'

  const saveMatch = (input: MatchInput) => mutate(
    () => repository.addMatch(snapshot!.room.id, input),
    savedMessage(input.playedAt, 'Partida salva. Ranking atualizado!'),
  )
  const importResult = (inputs: ImportResultInput[]) => mutate(
    async () => { for (const input of inputs) await repository.importResult(snapshot!.room.id, input) },
    savedMessage(inputs[0].playedAt, inputs.length > 1 ? `${inputs.length} resultados importados!` : 'Resultado importado com as 5 rodadas!'),
  )
  const savePlayer = (nickname: string, color: string) => mutate(
    () => editingPlayer ? repository.updatePlayer(editingPlayer, nickname, color) : repository.addPlayer(snapshot!.room.id, nickname, color),
    editingPlayer ? 'Jogador atualizado!' : `${nickname} entrou na disputa!`,
  )
  const deletePlayer = async () => {
    if (!editingPlayer) return
    await mutate(() => repository.deletePlayer(editingPlayer), 'Jogador arquivado. Histórico e conquistas preservados.')
  }
  const updateMatch = async (input: MatchUpdateInput) => {
    if (!editingMatch) return
    await mutate(() => repository.updateMatch(editingMatch, input), savedMessage(input.playedAt, 'Partida atualizada!'))
  }
  const deleteMatch = async (match: GameMatch) => {
    if (!window.confirm(`Apagar “${match.title}” e todos os placares?`)) return
    const correctionReason = weekClosed(weekOf(match.played_at).from) ? window.prompt('Essa semana já encerrou. Informe o motivo da exclusão; os prêmios serão revisados:') : undefined
    if (correctionReason === null) return
    await mutate(() => repository.deleteMatch(match.room_id, match.id, correctionReason), 'Partida removida. Premiações atualizadas.')
  }

  const leaveRoom = () => {
    forgetAccess(activeRoomId)
    setError('')
    closeModal()
  }

  const install = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') showToast('CronoRank instalado!')
    setInstallPrompt(null)
  }

  if (booting) return <Spinner label="Ajustando as coordenadas…" />

  // o acesso continua guardado: so falta conexao para trazer o ranking. A falta
  // de internet ja e o assunto da tela, entao so erros que dizem outra coisa
  // (banco fora do ar, configuracao faltando) aparecem em destaque.
  if (!snapshot && activeRoomId) {
    const detail = /sem internet/i.test(error) ? '' : error
    return <Reconnect busy={busy} error={detail} onRetry={reconnect} onLeave={leaveRoom} />
  }

  if (!snapshot) {
    return (
      <Onboarding
        isDemo={repository.isDemo}
        initialCode={queryCode}
        busy={busy}
        error={error}
        onCreate={createRoom}
        onJoin={joinRoom}
        onDemo={openDemo}
      />
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand compact />
        <div className="topbar__room">
          <span>{snapshot.room.name}</span>
          <small className={cachedAt || !online ? 'offline' : ''}><i /> {repository.isDemo ? 'modo local' : cachedAt ? 'dados salvos' : online ? 'sincronizado' : 'sem conexão'}</small>
        </div>
        {installPrompt && <button className="topbar__action install-action" type="button" onClick={install} aria-label="Instalar aplicativo"><Download size={18} /></button>}
        <button className="topbar__action" type="button" onClick={() => openModal('share')} aria-label="Compartilhar liga"><Share2 size={18} /></button>
      </header>

      {cachedAt && (
        <div className="offline-banner">
          <CloudOff size={15} />
          <p>Sem conexão. Mostrando o ranking {describeSavedAt(cachedAt)}; seu acesso continua guardado.</p>
          <button type="button" onClick={reconnect} disabled={busy}>{busy ? 'Tentando…' : 'Tentar de novo'}</button>
        </div>
      )}

      {repository.isDemo && (
        <div className="demo-banner"><span>Prévia local</span><p>Os dados deste modo ficam somente neste aparelho.</p><button type="button" onClick={leaveRoom}>Conectar banco</button></div>
      )}

      {view !== 'arena' && view !== 'collection' && <PeriodBar
        period={period}
        range={range}
        matchCount={visible!.matches.length}
        onPreset={(preset: PeriodPreset) => preset === 'custom' ? openModal('period') : setPeriod({ preset })}
        onCustom={() => openModal('period')}
      />}

      <main className="app-content">
        {(view === 'arena' || view === 'collection') && <CompetitionView key={snapshot.room.id} snapshot={snapshot} mode={view === 'arena' ? 'week' : 'collection'} onChanged={() => loadRoom(snapshot.room.id)} onLegacy={() => setView('ranking')} onNew={openNewMatch} onToast={showToast} />}
        {view === 'ranking' && <RankingView snapshot={visible!} metric={metric} onMetric={setMetric} onNewMatch={openNewMatch} filtered={!!range} onClearPeriod={clearPeriod} today={today} periodLabel={formatPeriodLabel(range)} onToast={showToast} onOpenMatch={openMatchDetail} stale={!!cachedAt} />}
        {view === 'matches' && <MatchesView snapshot={visible!} onNew={openNewMatch} onEdit={(match) => { setEditingMatch(match); openModal('match-edit') }} onDelete={deleteMatch} onOpen={openMatchDetail} filtered={!!range} onClearPeriod={clearPeriod} />}
        {view === 'players' && <PlayersView snapshot={visible!} onAdd={() => { setEditingPlayer(undefined); openModal('player') }} onEdit={(player) => { setEditingPlayer(player); openModal('player') }} onRestore={player => { void mutate(() => repository.restorePlayer(player), 'Jogador de volta à disputa!') }} />}
        {view === 'insights' && <InsightsView snapshot={visible!} history={snapshot} filtered={!!range} onClearPeriod={clearPeriod} />}
      </main>

      <nav className="bottom-nav" aria-label="Navegação principal">
        <NavButton active={view === 'arena' || view === 'ranking'} icon={<Trophy />} label="Semana" onClick={() => setView('arena')} />
        <NavButton active={view === 'matches'} icon={<Gamepad2 />} label="Partidas" onClick={() => setView('matches')} />
        <NavButton active={view === 'collection'} icon={<Medal />} label="Conquistas" onClick={() => setView('collection')} />
        <NavButton active={view === 'players'} icon={<Users />} label="Jogadores" onClick={() => setView('players')} />
        <NavButton active={view === 'insights'} icon={<BarChart3 />} label="Estatísticas" onClick={() => setView('insights')} />
      </nav>

      {modal === 'match' && <MatchSheet players={snapshot.players.filter(p => !p.archived)} initialPlayerId={readProfileIdentity(snapshot.room.id)?.playerId} matchNumber={snapshot.matches.length + 1} busy={busy} initialShareText={pendingShare} onClose={closeModal} onSave={saveMatch} onImport={importResult} />}
      {modal === 'match-edit' && editingMatch && <MatchEditSheet match={editingMatch} busy={busy} onClose={closeModal} onSave={updateMatch} />}
      {modal === 'player' && <PlayerSheet player={editingPlayer} busy={busy} onClose={closeModal} onSave={savePlayer} onDelete={editingPlayer ? deletePlayer : undefined} />}
      {modal === 'share' && <ShareSheet room={snapshot.room} onClose={closeModal} onToast={showToast} onLeave={leaveRoom} />}
      {modal === 'match-detail' && detailMatch && (
        <MatchDetailSheet match={detailMatch} players={snapshot.players} scores={snapshot.scores} rounds={snapshot.rounds ?? []} onClose={closeModal} />
      )}
      {modal === 'period' && <PeriodSheet period={period} onClose={closeModal} onSave={(chosen) => { setPeriod(chosen); closeModal() }} />}
      {toast && <div className="toast" role="status"><RefreshCw size={16} /> {toast}</div>}
    </div>
  )
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className={active ? 'active' : ''} type="button" onClick={onClick}>{icon}<span>{label}</span></button>
}
