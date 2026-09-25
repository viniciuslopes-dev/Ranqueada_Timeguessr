import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, Globe2, Trophy } from 'lucide-react'
import { TIMEGUESSR_DAILY_URL } from '../lib/timeguessr'
import type { Player } from '../types'

export const PLAYER_COLORS = ['#ff7043', '#4f7cff', '#8b5cf6', '#23a982', '#e8a317', '#e75480', '#197f91', '#6f7d3c']

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`}>
      <img src="/brand-mark.svg" alt="" />
      <span>CronoRank</span>
    </div>
  )
}

// Atalho para a partida do dia no TimeGuessr. Abre sempre em outra aba para
// que o app instalado continue aberto com o ranking do jeito que estava.
export function DailyLink({ variant = 'button', label = 'Jogar a daily de hoje' }: { variant?: 'button' | 'quiet' | 'icon'; label?: string }) {
  const target = { href: TIMEGUESSR_DAILY_URL, target: '_blank', rel: 'noopener noreferrer' }
  if (variant === 'icon') {
    return <a className="daily-link daily-link--icon" {...target} title={label} aria-label={label}><Globe2 size={17} /></a>
  }
  return (
    <a className={`daily-link daily-link--${variant}`} {...target}>
      <Globe2 size={15} /> {label} <ExternalLink className="daily-link__out" size={13} />
    </a>
  )
}

export function PlayerAvatar({ player, size = 'md', rank }: { player: Pick<Player, 'nickname' | 'color' | 'cosmetic' | 'weeklyChampion'>; size?: 'sm' | 'md' | 'lg' | 'xl'; rank?: number }) {
  const initials = player.nickname
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  return (
    <span className={`avatar avatar--${size} avatar-frame--${player.cosmetic?.frame ?? 'none'}`} style={{ '--avatar-color': player.color } as React.CSSProperties} aria-label={`${player.nickname}${player.weeklyChampion ? ', campeão da última semana' : ''}`}>
      {player.cosmetic?.avatar && player.cosmetic.avatar !== 'initials' ? player.cosmetic.avatar : initials}
      {player.weeklyChampion ? <span className="avatar__crown weekly-champion-badge" title="Campeão da última semana">🏆</span> : rank === 1 && <span className="avatar__crown" title="Liderança do ranking consultado">♛</span>}
    </span>
  )
}

export function Sheet({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [])

  // A folha precisa viver diretamente no body. Se ficar dentro de uma view
  // animada com transform, position: fixed passa a usar a altura daquela view
  // como referência e, em páginas longas, o conteúdo aparece só no final.
  return createPortal(
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div className="sheet__handle" />
        <header className="sheet__header">
          <div>
            <h2 id="sheet-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar">×</button>
        </header>
        {children}
      </section>
    </div>,
    document.body,
  )
}

export function EmptyState({ title, text, action, icon }: { title: string; text: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon">{icon ?? <Trophy size={27} />}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  )
}

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="loading-screen">
      <img src="/brand-mark.svg" alt="" />
      <span className="spinner" />
      <p>{label}</p>
    </div>
  )
}
