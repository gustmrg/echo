/** Decorative brand motif, never presented as the recording's actual waveform. */
export default function Waveform() {
  return (
    <div className="waveform" aria-hidden="true">
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          style={{
            height: `${Math.round(15 + Math.abs(Math.sin(i * 1.83) * Math.cos(i * 0.38)) * 80)}%`,
          }}
        />
      ))}
    </div>
  )
}
