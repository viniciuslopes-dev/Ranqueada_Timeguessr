import type { ReactNode } from 'react'
import { Trophy } from 'lucide-react'
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

export function PlayerAvatar({ player, size = 'md', rank }: { player: Pick<Player, 'nickname' | 'color'>; size?: 'sm' | 'md' | 'lg' | 'xl'; rank?: number }) {
  const initials = player.nickname
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  return (
    <span className={`avatar avatar--${size}`} style={{ '--avatar-color': player.color } as React.CSSProperties} aria-label={player.nickname}>
      {initials}
      {rank === 1 && <span className="avatar__crown">♛</span>}
    </span>
  )
}

export function Sheet({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  return (
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
    </div>
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
