import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowRight, Gift, Sparkles } from 'lucide-react'
import type { RoomSnapshot } from '../types'
import { ACHIEVEMENTS, FRAMES } from '../lib/progression'
import { CELEBRATION_MESSAGES, parseSeenAchievements, rarityClass, unseenAchievements } from '../lib/achievementAlbum'
import { readProfileIdentity } from '../lib/neonRepository'
import { AchievementDialog, AchievementMedallion } from './AchievementAlbum'
import { FazueliBanner } from './Competition'

// O acompanhamento vive acima das abas. Só marcamos como visto ao dispensar;
// uma atualização silenciosa ou uma folha de resultado não engole o desbloqueio.
export function AchievementCelebration({
  snapshot,
  paused,
  onAlbum,
}: {
  snapshot: RoomSnapshot
  paused: boolean
  onAlbum: () => void
}) {
  const identity = readProfileIdentity(snapshot.room.id)
  const playerId = snapshot.players.find((p) => p.id === identity?.playerId && !p.archived)?.id
  const key = playerId ? `cronorank:seen-achievements:${snapshot.room.id}:${playerId}` : ''
  const memory = useRef<{ key: string; seen: string[] }>({ key: '', seen: [] })
  const [pending, setPending] = useState<{ key: string; codes: string[] }>({ key: '', codes: [] })
  const earned = snapshot.progress?.earned
  useEffect(() => {
    if (!playerId || !key) {
      memory.current = { key: '', seen: [] }
      setPending({ key: '', codes: [] })
      return
    }
    if (memory.current.key !== key) {
      let seen: string[] | null = null
      try {
        seen = parseSeenAchievements(localStorage.getItem(key))
      } catch {
        /* armazenamento indisponível */
      }
      // O primeiro vínculo começa com o histórico conhecido, sem uma avalanche de avisos.
      memory.current = { key, seen: seen ?? (earned ?? []).filter((e) => e.playerId === playerId).map((e) => e.code) }
      try {
        localStorage.setItem(key, JSON.stringify(memory.current.seen))
      } catch {
        /* mantém na sessão */
      }
    }
    setPending({ key, codes: unseenAchievements(earned ?? [], playerId, memory.current.seen).map((e) => e.code) })
  }, [key, playerId, earned])
  const codes = pending.key === key ? pending.codes : []
  const achievement = ACHIEVEMENTS.find((a) => a.code === codes[0])
  const acknowledge = (all = false) => {
    const dismissed = all ? codes : codes.slice(0, 1)
    memory.current.seen = [...new Set([...memory.current.seen, ...dismissed])]
    try {
      localStorage.setItem(key, JSON.stringify(memory.current.seen))
    } catch {
      /* mantém na sessão */
    }
    setPending({ key, codes: codes.filter((c) => !dismissed.includes(c)) })
  }
  if (!achievement || paused) return null
  const total = (earned ?? []).filter((e) => e.playerId === playerId).length
  const frame = FRAMES.find((f) => f.need > 0 && f.need === total - codes.length + 1)
  return (
    <AchievementDialog
      title="Nova conquista desbloqueada"
      onClose={() => acknowledge(true)}
      className={`achievement-celebration rarity-${rarityClass(achievement)}`}
    >
      <div className="celebration-content" key={achievement.code}>
        <div className="achievement-confetti" aria-hidden="true">
          {Array.from({ length: 20 }, (_, i) => (
            <i
              key={i}
              style={
                {
                  '--x': `${(i * 37) % 100}%`,
                  '--delay': `${(i % 5) * 0.09}s`,
                  '--turn': `${i * 47}deg`,
                  '--color': ['#f5c769', '#75cfaf', '#ac97ef', '#ef987d'][i % 4],
                } as CSSProperties
              }
            />
          ))}
        </div>
        <span className="celebration-kicker">
          <Sparkles size={16} /> NOVA CONQUISTA
        </span>
        <AchievementMedallion achievement={achievement} large />
        <span className="album-rarity">
          {achievement.rarity} · {total} selos na coleção
        </span>
        <h3>{achievement.name}</h3>
        <p>{CELEBRATION_MESSAGES[achievement.code]}</p>
        <div className="celebration-reward">
          <Gift size={19} />
          <div>
            <strong>
              {frame ? `Moldura ${frame.name} desbloqueada!` : 'Seu passaporte ganhou uma nova história.'}
            </strong>
            <p>O selo e o título já estão disponíveis para personalizar seu perfil.</p>
          </div>
        </div>
        {achievement.code === 'fazueli' && <FazueliBanner others={[]} onClose={() => acknowledge()} />}
        <div className="celebration-actions">
          <button className="primary-button" autoFocus onClick={() => acknowledge()}>
            {codes.length > 1 ? `Revelar próxima (${codes.length - 1})` : 'Boa! Continuar'} <ArrowRight size={16} />
          </button>
          <button
            className="secondary-button"
            onClick={() => {
              acknowledge(true)
              onAlbum()
            }}
          >
            Ver meu álbum
          </button>
        </div>
        <small className="celebration-note">
          {codes.length > 1
            ? `${codes.length} conquistas esperando sua comemoração`
            : 'Cada passo conta. Aproveite essa conquista!'}
        </small>
      </div>
    </AchievementDialog>
  )
}
