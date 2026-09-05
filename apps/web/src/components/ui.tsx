import type { ButtonHTMLAttributes, ReactNode } from 'react'

/* ---------- Button ---------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return <button className={`echo-button ${variant} ${className}`} {...props} />
}

/* ---------- PageHeader ---------- */

interface PageHeaderProps {
  title: string
  onBack?: () => void
  action?: ReactNode
}

export function PageHeader({ title, onBack, action }: PageHeaderProps) {
  return (
    <div className="flex justify-between items-center px-5 md:px-8 py-3.5 flex-shrink-0 border-b border-border/60">
      <div className="w-20 flex justify-start">
        {onBack && (
          <button
            aria-label="Back"
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors -ml-1"
          >
            <IconBack />
            <span className="hidden sm:inline">Back</span>
          </button>
        )}
      </div>
      <span className="font-display text-lg text-text-primary truncate">{title}</span>
      <div className="w-20 flex justify-end">{action}</div>
    </div>
  )
}

/* ---------- Spinner ---------- */

export function Spinner({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <div
      className={`border-2 border-text-tertiary border-t-text-primary rounded-full animate-spin ${className}`}
      role="status"
      aria-label="Loading"
    />
  )
}

/* ---------- ConfirmDialog ---------- */

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-fade-in-up"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm bg-surface-raised border border-border rounded-lg p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-xl text-text-primary mb-2">{title}</h2>
        <p className="text-sm text-text-secondary leading-relaxed mb-6">{message}</p>
        <div className="flex gap-2.5 justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={loading} className="px-4 py-2.5 text-sm">
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={loading} className="px-4 py-2.5 text-sm">
            {loading ? <Spinner className="w-4 h-4" /> : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ---------- Shared icons ---------- */

interface IconProps {
  size?: number
  className?: string
  strokeWidth?: number
}

function base(size: number, className: string | undefined, strokeWidth: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
  }
}

export function IconBack({ size = 20, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

export function IconMic({ size = 24, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)}>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  )
}

export function IconHome({ size = 22, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

export function IconSettings({ size = 22, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

export function IconTrash({ size = 20, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}

export function IconClose({ size = 20, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export function IconCheck({ size = 20, className, strokeWidth = 2.5 }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export function IconCopy({ size = 18, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

export function IconDownload({ size = 18, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

export function IconUndo({ size = 18, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)}>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  )
}

export function IconRedo({ size = 18, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)}>
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
    </svg>
  )
}

export function IconSparkle({ size = 18, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)}>
      <path d="M12 3l1.9 5.8 5.8 1.9-5.8 1.9L12 18.4l-1.9-5.8-5.8-1.9 5.8-1.9L12 3z" />
      <path d="M19 15l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z" />
    </svg>
  )
}

export function IconUpload({ size = 20, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)}>
      <path d="M16 16l-4-4-4 4" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  )
}

export function IconAlert({ size = 40, className, strokeWidth = 1.5 }: IconProps) {
  return (
    <svg {...base(size, className, strokeWidth)}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}
