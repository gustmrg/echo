interface SearchBarProps {
  value: string
  onChange: (value: string) => void
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="mx-6 mb-4 bg-surface border border-border rounded-md px-4 py-3 flex items-center gap-2.5 flex-shrink-0">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="flex-shrink-0 text-text-tertiary"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search recordings…"
        className="flex-1 bg-transparent border-none outline-none text-text-primary text-sm placeholder:text-text-tertiary"
      />
    </div>
  )
}
