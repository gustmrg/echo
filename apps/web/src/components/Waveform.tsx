import { useMemo } from 'react'

export default function Waveform() {
  const heights = useMemo(
    () => Array.from({ length: 20 }, () => Math.floor(Math.random() * 16) + 4),
    []
  )
  return (
    <div className="flex items-center gap-0.5 h-6 mt-2.5">
      {heights.map((h, i) => (
        <div
          key={i}
          className="w-[3px] rounded-sm bg-accent opacity-30 transition-opacity group-hover:opacity-50"
          style={{ height: `${h}px` }}
        />
      ))}
    </div>
  )
}
