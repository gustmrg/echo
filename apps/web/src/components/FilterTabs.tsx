export type FilterTab = 'all' | 'completed' | 'processing' | 'pending' | 'failed'

const tabs: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'completed', label: 'Completed' },
  { id: 'processing', label: 'Processing' },
  { id: 'pending', label: 'Pending' },
  { id: 'failed', label: 'Failed' },
]

interface FilterTabsProps {
  active: FilterTab
  onChange: (tab: FilterTab) => void
}

export default function FilterTabs({ active, onChange }: FilterTabsProps) {
  return (
    <div className="flex gap-2 px-6 pb-4 flex-shrink-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`px-4 py-[7px] rounded-full text-[13px] font-medium border whitespace-nowrap transition-all active:scale-[0.96] touch-manipulation ${
            active === id
              ? 'bg-text-primary text-bg border-text-primary'
              : 'border-border text-text-secondary bg-transparent'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
