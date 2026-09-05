import type { FormatInfo, OutputFormat } from '../lib/formats'

const icons: Record<OutputFormat, React.ReactNode> = {
  blog: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  ),
  interview: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  notes: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  news: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0V9" />
      <path d="M18 14h-8" />
      <path d="M15 18h-5" />
      <path d="M10 6h8v4h-8V6z" />
    </svg>
  ),
}

interface FormatCardProps {
  format: FormatInfo
  cached: boolean
  onSelect: () => void
}

export default function FormatCard({ format, cached, onSelect }: FormatCardProps) {
  return (
    <button
      onClick={onSelect}
      className="group flex items-start gap-4 w-full text-left bg-surface border border-border rounded-md p-4 hover:bg-surface-raised hover:border-text-tertiary active:scale-[0.99] transition-all duration-200"
    >
      <div className="flex-shrink-0 w-11 h-11 rounded-md bg-accent-glow text-accent flex items-center justify-center">
        {icons[format.id]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[15px] font-semibold text-text-primary">{format.name}</span>
          {cached && (
            <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-success">
              Generated
            </span>
          )}
        </div>
        <p className="text-[13px] text-text-secondary leading-relaxed">{format.description}</p>
      </div>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="flex-shrink-0 mt-1 text-text-tertiary group-hover:text-text-secondary group-hover:translate-x-0.5 transition-all"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  )
}
