const pipeline = [
  { stage: 'Record or import audio', live: true },
  { stage: 'Transcription (Whisper via worker)', live: true },
  { stage: 'Transcript editing — saved locally in your browser', live: false },
  { stage: 'AI refinement (Blog, Interview, Notes, News) — mocked responses', live: false },
  { stage: 'Copy & download output', live: true },
]

export default function SettingsPage() {
  return (
    <div className="flex flex-col h-full animate-fade-in-up">
      <div className="px-5 md:px-8 pt-6 pb-5 flex-shrink-0">
        <h1 className="font-display text-[32px] leading-none tracking-[-0.02em] text-text-primary mb-1.5">
          Settings
        </h1>
        <p className="text-sm text-text-tertiary">About this build</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 md:px-8 pb-6">
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
                <span className="text-text-secondary leading-relaxed">{stage}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-text-tertiary mt-4 leading-relaxed">
            Stages marked in amber run entirely in the browser as placeholders until the API grows
            the matching endpoints.
          </p>
        </div>

        <div className="bg-surface border border-border rounded-md p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-3">
            About
          </h2>
          <p className="text-sm text-text-secondary leading-relaxed">
            Echo turns spoken audio into polished, structured text. Record, transcribe, review, and
            refine into a blog post, interview, notes, or news brief.
          </p>
        </div>
      </div>
    </div>
  )
}
