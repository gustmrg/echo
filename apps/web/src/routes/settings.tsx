const pipeline = [
  { stage: 'Record or import audio', live: true },
  { stage: 'Audio transcription', live: true },
  { stage: 'Transcript editing — saved across sessions', live: true },
  { stage: 'AI refinement (Blog, Interview, Notes, News)', live: true },
  { stage: 'Copy & download output', live: true },
]

export default function SettingsPage() {
  return (
    <div className="studio-page">
      <div className="document-heading">
        <h1 className="font-display text-[32px] leading-none tracking-[-0.02em] text-text-primary mb-1.5">
          About Echo
        </h1>
        <p className="text-sm text-text-tertiary">About this build</p>
      </div>

      <div className="about-section">
        <div className="bg-surface border border-border rounded-md p-5 mb-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-4">
            Pipeline status
          </h2>
          <ul className="space-y-3">
            {pipeline.map(({ stage, live }) => (
              <li key={stage} className="flex items-start gap-2.5 text-sm">
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-[7px] ${
                    live ? 'bg-success' : 'bg-warning'
                  }`}
                />
                <span className="text-text-secondary leading-relaxed">
                  {stage}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-text-tertiary mt-4 leading-relaxed">
            Recordings, transcript edits, and generated outputs are saved on the
            server.
          </p>
        </div>

        <div className="bg-surface border border-border rounded-md p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-3">
            About
          </h2>
          <p className="text-sm text-text-secondary leading-relaxed">
            Echo turns spoken audio into polished, structured text. Record,
            transcribe, review, and refine into a blog post, interview, notes,
            or news brief.
          </p>
        </div>
      </div>
    </div>
  )
}
