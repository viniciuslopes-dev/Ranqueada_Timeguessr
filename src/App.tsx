import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, Download, Gamepad2, Home, LogOut, Plus, RefreshCw, Share2, Trophy, Users } from 'lucide-react'
import { Onboarding } from './components/Onboarding'
import { MatchEditSheet, MatchSheet, PeriodSheet, PlayerSheet, ShareSheet } from './components/Sheets'
import { InsightsView, MatchesView, PeriodBar, PlayersView, RankingView } from './components/Views'
import { Brand, Spinner } from './components/ui'
import { filterSnapshotByPeriod, isWithinRange, resolvePeriod, type Period, type PeriodPreset } from './lib/period'
import { repository } from './lib/neonRepository'
import type { GameMatch, ImportResultInput, MatchInput, MatchUpdateInput, Player, RankingMetric, RoomSnapshot } from './types'

const ACTIVE_ROOM_KEY = 'cronorank:active-room'
const PERIOD_KEY = 'cronorank:period'
type ViewName = 'ranking' | 'matches' | 'players' | 'insights'
type ModalName = 'match' | 'match-edit' | 'period' | 'player' | 'share' | null

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// guardamos o preset, nunca o intervalo ja resolvido: "semana atual" precisa
// virar junto com a semana em vez de congelar na que foi escolhida.
function readStoredPeriod(): Period {
  try {
    const raw = localStorage.getItem(PERIOD_KEY)
    if (!raw) return { preset: 'all' }
    const saved = JSON.parse(raw) as Period
    if (saved.preset === 'custom' && saved.from && saved.to) return saved
    if (saved.preset === 'week' || saved.preset === 'month') return { preset: saved.preset }
  } catch { /* preferencia corrompida volta para o padrao */ }
  return { preset: 'all' }
}

function readableError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/duplicate|unique/i.test(message)) return 'Esse nick já está na liga. Escolha outro.'
  if (/not found|não encontr|P0002/i.test(message)) return 'Não encontramos essa liga. Confira o código.'
  if (/row-level|policy|permission/i.test(message)) return 'Seu acesso à liga expirou. Entre novamente pelo código.'
  if (/DATABASE_URL/i.test(message)) return 'Configure a DATABASE_URL do Neon na Netlify.'
  if (/fetch|network/i.test(message)) return 'Sem conexão com o banco. Confira sua internet e tente de novo.'
  return message || 'Algo saiu do mapa. Tente novamente.'
}

export default function App() {
  const queryCode = useMemo(() => new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '', [])
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null)
  const [activeRoomId, setActiveRoomId] = useState(() => localStorage.getItem(ACTIVE_ROOM_KEY))
  const [view, setView] = useState<ViewName>('ranking')
  const [metric, setMetric] = useState<RankingMetric>('total')
  const [modal, setModal] = useState<ModalName>(null)
  const [editingPlayer, setEditingPlayer] = useState<Player | undefined>()
  const [editingMatch, setEditingMatch] = useState<GameMatch | undefined>()
  const [booting, setBooting] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [online, setOnline] = useState(navigator.onLine)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [period, setPeriod] = useState<Period>(readStoredPeriod)

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2800)
  }, [])

  const range = useMemo(() => resolvePeriod(period), [period])
  const visible = useMemo(() => snapshot ? filterSnapshotByPeriod(snapshot, range) : null, [snapshot, range])

  useEffect(() => {
    if (period.preset === 'all') localStorage.removeItem(PERIOD_KEY)
    else localStorage.setItem(PERIOD_KEY, JSON.stringify(period))
  }, [period])

  const clearModal = useCallback(() => {
    setModal(null)
    setEditingPlayer(undefined)
    setEditingMatch(undefined)
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
      setSnapshot(data)
      setError('')
    } catch (loadError) {
      if (!quiet) setError(readableError(loadError))
      throw loadError
    }
  }, [])

  useEffect(() => {
    let active = true
    const boot = async () => {
      try {
        await repository.initialize()
        if (activeRoomId) await loadRoom(activeRoomId)
      } catch (bootError) {
        localStorage.removeItem(ACTIVE_ROOM_KEY)
        if (active) {
          setActiveRoomId(null)
          setSnapshot(null)
          setError(readableError(bootError))
        }
      } finally {
        if (active) setBooting(false)
      }
    }
    void boot()
    return () => { active = false }
  }, []) // a inicialização acontece apenas na abertura

  useEffect(() => {
    if (!activeRoomId || !snapshot) return
    return repository.subscribe(activeRoomId, () => {
      void loadRoom(activeRoomId, true).catch(() => undefined)
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
    localStorage.setItem(ACTIVE_ROOM_KEY, roomId)
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

  const openNewMatch = () => {
    if (!snapshot?.players.length) {
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
  const importResult = (input: ImportResultInput) => mutate(
    () => repository.importResult(snapshot!.room.id, input),
    savedMessage(input.playedAt, 'Resultado importado com as 5 rodadas!'),
  )
  const savePlayer = (nickname: string, color: string) => mutate(
    () => editingPlayer ? repository.updatePlayer(editingPlayer, nickname, color) : repository.addPlayer(snapshot!.room.id, nickname, color),
    editingPlayer ? 'Jogador atualizado!' : `${nickname} entrou na disputa!`,
  )
  const deletePlayer = async () => {
    if (!editingPlayer) return
    await mutate(() => repository.deletePlayer(editingPlayer), 'Jogador removido.')
  }
  const updateMatch = async (input: MatchUpdateInput) => {
    if (!editingMatch) return
    await mutate(() => repository.updateMatch(editingMatch, input), savedMessage(input.playedAt, 'Partida atualizada!'))
  }
  const deleteMatch = async (match: GameMatch) => {
    if (!window.confirm(`Apagar “${match.title}” e todos os placares?`)) return
    await mutate(() => repository.deleteMatch(match.room_id, match.id), 'Partida removida.')
  }

  const leaveRoom = () => {
    localStorage.removeItem(ACTIVE_ROOM_KEY)
    setActiveRoomId(null)
    setSnapshot(null)
    setView('ranking')
    setError('')
  }

  const install = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') showToast('CronoRank instalado!')
    setInstallPrompt(null)
  }

  if (booting) return <Spinner label="Ajustando as coordenadas…" />

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
          <small className={online ? '' : 'offline'}><i /> {repository.isDemo ? 'modo local' : online ? 'sincronizado' : 'sem conexão'}</small>
        </div>
        {installPrompt && <button className="topbar__action install-action" type="button" onClick={install} aria-label="Instalar aplicativo"><Download size={18} /></button>}
        <button className="topbar__action" type="button" onClick={() => openModal('share')} aria-label="Compartilhar liga"><Share2 size={18} /></button>
        <button className="topbar__action topbar__leave" type="button" onClick={leaveRoom} aria-label="Sair da liga"><LogOut size={18} /></button>
      </header>

      {repository.isDemo && (
        <div className="demo-banner"><span>Prévia local</span><p>Os dados deste modo ficam somente neste aparelho.</p><button type="button" onClick={leaveRoom}>Conectar banco</button></div>
      )}

      <PeriodBar
        period={period}
        range={range}
        matchCount={visible!.matches.length}
        onPreset={(preset: PeriodPreset) => preset === 'custom' ? openModal('period') : setPeriod({ preset })}
        onCustom={() => openModal('period')}
      />

      <main className="app-content">
        {view === 'ranking' && <RankingView snapshot={visible!} metric={metric} onMetric={setMetric} onNewMatch={openNewMatch} filtered={!!range} onClearPeriod={clearPeriod} />}
        {view === 'matches' && <MatchesView snapshot={visible!} onNew={openNewMatch} onEdit={(match) => { setEditingMatch(match); openModal('match-edit') }} onDelete={deleteMatch} filtered={!!range} onClearPeriod={clearPeriod} />}
        {view === 'players' && <PlayersView snapshot={visible!} onAdd={() => { setEditingPlayer(undefined); openModal('player') }} onEdit={(player) => { setEditingPlayer(player); openModal('player') }} />}
        {view === 'insights' && <InsightsView snapshot={visible!} filtered={!!range} onClearPeriod={clearPeriod} />}
      </main>

      {(view === 'ranking' || view === 'matches') && snapshot.players.length > 0 && (
        <button className="floating-action" type="button" onClick={openNewMatch}><Plus size={22} /><span>Nova partida</span></button>
      )}

      <nav className="bottom-nav" aria-label="Navegação principal">
        <NavButton active={view === 'ranking'} icon={<Trophy />} label="Ranking" onClick={() => setView('ranking')} />
        <NavButton active={view === 'matches'} icon={<Gamepad2 />} label="Partidas" onClick={() => setView('matches')} />
        <NavButton active={view === 'players'} icon={<Users />} label="Jogadores" onClick={() => setView('players')} />
        <NavButton active={view === 'insights'} icon={<BarChart3 />} label="Estatísticas" onClick={() => setView('insights')} />
      </nav>

      {modal === 'match' && <MatchSheet players={snapshot.players} matchNumber={snapshot.matches.length + 1} busy={busy} onClose={closeModal} onSave={saveMatch} onImport={importResult} />}
      {modal === 'match-edit' && editingMatch && <MatchEditSheet match={editingMatch} busy={busy} onClose={closeModal} onSave={updateMatch} />}
      {modal === 'player' && <PlayerSheet player={editingPlayer} busy={busy} onClose={closeModal} onSave={savePlayer} onDelete={editingPlayer ? deletePlayer : undefined} />}
      {modal === 'share' && <ShareSheet room={snapshot.room} onClose={closeModal} onToast={showToast} />}
      {modal === 'period' && <PeriodSheet period={period} onClose={closeModal} onSave={(chosen) => { setPeriod(chosen); closeModal() }} />}
      {toast && <div className="toast" role="status"><RefreshCw size={16} /> {toast}</div>}
    </div>
  )
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className={active ? 'active' : ''} type="button" onClick={onClick}>{icon}<span>{label}</span></button>
}
