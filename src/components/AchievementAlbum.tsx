import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUpRight, Check, CheckCheck, Gift, LockKeyhole, Search, Sparkles, Target, X } from 'lucide-react'
import type { RoomSnapshot } from '../types'
import { FRAMES } from '../lib/progression'
import {
  achievementCategory,
  albumEntries,
  CATEGORIES,
  progressLabel,
  rarityClass,
  type Achievement,
} from '../lib/achievementAlbum'
import { formatShortDate } from '../lib/ranking'
import { DailyLink } from './ui'
import './achievements.css'

export function AchievementDialog({
  title,
  onClose,
  children,
  className = '',
}: {
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    const dialog = ref.current!
    const previousFocus = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
      previousFocus?.focus()
    }
  }, [])
  return createPortal(
    <dialog
      ref={ref}
      className={`achievement-dialog ${className}`}
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="achievement-dialog__body">
        <h2 id={id} className="sr-only">
          {title}
        </h2>
        <button className="icon-button achievement-dialog__close" aria-label="Fechar conquista" onClick={onClose}>
          <X size={18} />
        </button>
        {children}
      </div>
    </dialog>,
    document.body,
  )
}

export function AchievementMedallion({ achievement, large = false }: { achievement: Achievement; large?: boolean }) {
  return (
    <span
      className={`achievement-medallion rarity-${rarityClass(achievement)} ${large ? 'achievement-medallion--large' : ''}`}
      aria-hidden="true"
    >
      <span>{achievement.icon}</span>
    </span>
  )
}

export function AchievementAlbum({
  snapshot,
  playerId,
  own,
  onCustomize,
  onNew,
}: {
  snapshot: RoomSnapshot
  playerId: string
  own: boolean
  onCustomize: () => void
  onNew: () => void
}) {
  const [filter, setFilter] = useState('Todas')
  const [category, setCategory] = useState('Todas')
  const [detail, setDetail] = useState<string | null>(null)
  const entries = albumEntries(snapshot, playerId)
  const earned = entries.filter((e) => e.earned)
  const pending = entries
    .filter((e) => !e.earned)
    .sort((a, b) => b.value / b.achievement.goal - a.value / a.achievement.goal)
  const nearest = pending.slice(0, 3)
  const percent = Math.round((earned.length / entries.length) * 100)
  const nextFrame = FRAMES.find((f) => f.need > earned.length)
  const shown = entries.filter(
    (e) =>
      (category === 'Todas' || achievementCategory(e.achievement.code) === category) &&
      (filter === 'Todas' || (filter === 'Conquistadas' ? !!e.earned : !e.earned)),
  )
  const selected = entries.find((e) => e.achievement.code === detail)
  const recent = [...earned].sort((a, b) => b.earned!.date.localeCompare(a.earned!.date)).slice(0, 3)
  return (
    <section className="achievement-album" aria-labelledby="album-title">
      <div className="album-intro">
        <div>
          <span className="section-kicker">PEQUENOS FEITOS. GRANDES HISTÓRIAS.</span>
          <h2 id="album-title">Álbum de conquistas</h2>
          <p>Explore, evolua e transforme suas partidas em uma coleção só sua.</p>
        </div>
        <span className="album-edition">{entries.length} selos para colecionar</span>
      </div>
      <div className="album-overview">
        <div className="album-completion" style={{ '--completion': `${percent}%` } as CSSProperties}>
          <span>
            <strong>{percent}%</strong>
            <small>do álbum</small>
          </span>
        </div>
        <div className="album-overview__copy">
          <span className="section-kicker">SUA JORNADA ATÉ AQUI</span>
          <h3>{earned.length ? `${earned.length} histórias para contar` : 'Seu primeiro selo está esperando'}</h3>
          <p>
            {pending.length
              ? `${earned.length} de ${entries.length} conquistas. Cada partida abre uma nova possibilidade.`
              : 'Álbum completo! Uma coleção de feitos para se orgulhar.'}
          </p>
        </div>
        <div className="album-reward">
          <Gift size={20} />
          <div>
            <strong>{nextFrame ? `Próxima moldura: ${nextFrame.name}` : 'Todas as molduras liberadas'}</strong>
            <p>
              {nextFrame
                ? `Faltam ${nextFrame.need - earned.length} conquista${nextFrame.need - earned.length > 1 ? 's' : ''} para desbloquear.`
                : 'Seu passaporte pode mostrar o quanto você já conquistou.'}
            </p>
            {own && (
              <button className="text-button" onClick={onCustomize}>
                Personalizar passaporte <ArrowUpRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
      {!!nearest.length && (
        <div className="album-next">
          <div className="album-subheading">
            <div>
              <Target size={17} />
              <h3>{own ? 'Qual vai ser a próxima?' : 'Próximos passos da coleção'}</h3>
            </div>
            <span>Um objetivo de cada vez, no seu ritmo.</span>
          </div>
          <div className="album-goals">
            {nearest.map(({ achievement: a, value }) => (
              <button className="album-goal" key={a.code} onClick={() => setDetail(a.code)}>
                <span aria-hidden="true">{a.icon}</span>
                <div>
                  <strong>{a.name}</strong>
                  <small>{progressLabel(a, value)}</small>
                  <progress value={value} max={a.goal} aria-label={`Progresso de ${a.name}`} />
                </div>
                <ArrowUpRight size={16} />
              </button>
            ))}
          </div>
        </div>
      )}
      {!!recent.length && (
        <div className="album-recent">
          <span>
            <Sparkles size={15} /> Últimos selos
          </span>
          {recent.map(({ achievement: a }) => (
            <button key={a.code} onClick={() => setDetail(a.code)}>
              {a.icon} {a.name}
              <ArrowUpRight size={12} />
            </button>
          ))}
        </div>
      )}
      <div className="album-toolbar">
        <div className="album-filters" role="group" aria-label="Estado das conquistas">
          {['Todas', 'Conquistadas', 'A conquistar'].map((label) => (
            <button key={label} aria-pressed={filter === label} onClick={() => setFilter(label)}>
              {label}
              <span>
                {label === 'Todas' ? entries.length : label === 'Conquistadas' ? earned.length : pending.length}
              </span>
            </button>
          ))}
        </div>
        <label className="album-category">
          <span>Categoria</span>
          <select aria-label="Categoria" value={category} onChange={(event) => setCategory(event.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="album-results" role="status">
        {shown.length} {shown.length === 1 ? 'conquista' : 'conquistas'} · toque em um selo para ver os detalhes
      </p>
      <div className="album-grid">
        {shown.map(({ achievement: a, earned: unlock, value }) => (
          <button
            key={a.code}
            className={`album-card rarity-${rarityClass(a)} ${unlock ? 'album-card--earned' : 'album-card--locked'}`}
            onClick={() => setDetail(a.code)}
            aria-label={`${a.name}, ${unlock ? 'conquistada' : 'a conquistar'}. Ver detalhes`}
          >
            <div className="album-card__top">
              <span className="album-rarity">{a.rarity}</span>
              {unlock ? (
                <CheckCheck size={17} aria-label="Conquistada" />
              ) : (
                <LockKeyhole size={14} aria-label="Bloqueada" />
              )}
            </div>
            <AchievementMedallion achievement={a} />
            <span className="album-card__category">{achievementCategory(a.code)}</span>
            <h3>{a.name}</h3>
            <p>{a.description}</p>
            <div className="album-card__footer">
              {unlock ? (
                <span className="album-earned-date">
                  <Check size={13} /> {formatShortDate(unlock.date)}
                  <span>
                    Ver conquista <ArrowUpRight size={12} />
                  </span>
                </span>
              ) : (
                <>
                  <div className="album-progress-label">
                    <span>{progressLabel(a, value)}</span>
                    {a.goal > 1 && <strong>{Math.round((value / a.goal) * 100)}%</strong>}
                  </div>
                  <progress value={value} max={a.goal} aria-label={`Progresso de ${a.name}`} />
                </>
              )}
            </div>
          </button>
        ))}
      </div>
      {!shown.length && (
        <div className="album-empty">
          <Search size={26} />
          <h3>
            {filter === 'A conquistar' ? 'Tudo conquistado por aqui!' : 'Sua coleção ainda vai crescer por aqui.'}
          </h3>
          <p>Explore as outras categorias para encontrar seu próximo objetivo.</p>
          <button
            className="secondary-button"
            onClick={() => {
              setFilter('Todas')
              setCategory('Todas')
            }}
          >
            Ver todas as conquistas
          </button>
        </div>
      )}
      <p className="album-footnote">
        Uma partida por dia conta para as conquistas. Selos de precisão precisam dos detalhes das rodadas importadas.
      </p>
      {selected && (
        <AchievementDialog title={selected.achievement.name} onClose={() => setDetail(null)}>
          <div className={`achievement-detail rarity-${rarityClass(selected.achievement)}`}>
            <span className="section-kicker">
              {selected.earned ? 'UMA HISTÓRIA QUE JÁ É SUA' : 'SEU PRÓXIMO DESAFIO'} · {selected.achievement.rarity}
            </span>
            <AchievementMedallion achievement={selected.achievement} large />
            <h3>{selected.achievement.name}</h3>
            <p>{selected.achievement.description}</p>
            {selected.earned ? (
              <div className="achievement-evidence">
                <CheckCheck size={18} />
                <div>
                  <strong>Conquistada em {formatShortDate(selected.earned.date)}</strong>
                  <p>{selected.earned.evidence}</p>
                </div>
              </div>
            ) : (
              <div className="achievement-detail__progress">
                <strong>{progressLabel(selected.achievement, selected.value)}</strong>
                <progress
                  value={selected.value}
                  max={selected.achievement.goal}
                  aria-label={`Progresso de ${selected.achievement.name}`}
                />
                {['year', 'map', 'round', 'historian', 'comeback'].includes(selected.achievement.code) && (
                  <p>Importe o resultado com as rodadas para registrar este feito.</p>
                )}
              </div>
            )}
            <div className="achievement-reward-note">
              <Gift size={19} />
              <p>
                <strong>{selected.earned ? 'Recompensa liberada' : 'O que você desbloqueia'}</strong>O título “
                {selected.achievement.name}” e este selo para sua vitrine.
                {selected.achievement.code === 'fazueli' && ' Inclui o fundo exclusivo Onda vermelha.'}
              </p>
            </div>
            {own &&
              (selected.earned ? (
                <button
                  className="primary-button"
                  onClick={() => {
                    setDetail(null)
                    onCustomize()
                  }}
                >
                  Usar no meu passaporte <ArrowUpRight size={16} />
                </button>
              ) : (
                <div className="achievement-detail__actions">
                  <DailyLink />
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setDetail(null)
                      onNew()
                    }}
                  >
                    Já joguei · registrar resultado
                  </button>
                </div>
              ))}
          </div>
        </AchievementDialog>
      )}
    </section>
  )
}
