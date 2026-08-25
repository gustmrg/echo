/**
 * Lightweight renderer for the structured (Markdown-ish) text produced by
 * refinement. Supports `#`/`##` headings, `- ` bullet lists, `**bold**`,
 * and paragraphs. Deliberately not a full Markdown parser — the refinement
 * output format is controlled, so this stays small.
 */

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const key = `${keyPrefix}-${i}`
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={key} className="text-text-primary font-semibold">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return <span key={key}>{part}</span>
  })
}

export default function OutputRenderer({ content }: { content: string }) {
  const blocks = content.split(/\n\n+/).filter((b) => b.trim().length > 0)

  return (
    <div className="space-y-4">
      {blocks.map((block, i) => {
        const key = `block-${i}`

        if (block.startsWith('# ')) {
          return (
            <h1 key={key} className="font-display text-2xl text-text-primary leading-tight pt-2">
              {block.slice(2)}
            </h1>
          )
        }

        if (block.startsWith('## ')) {
          return (
            <h2 key={key} className="font-display text-lg text-text-primary leading-tight pt-3">
              {block.slice(3)}
            </h2>
          )
        }

        const lines = block.split('\n')
        if (lines.every((l) => l.startsWith('- '))) {
          return (
            <ul key={key} className="space-y-1.5 pl-1">
              {lines.map((l, j) => (
                <li key={j} className="flex gap-2.5 text-[15px] leading-[1.7] text-text-secondary">
                  <span className="text-accent flex-shrink-0 mt-[2px]" aria-hidden>
                    •
                  </span>
                  <span>{renderInline(l.slice(2), `${key}-${j}`)}</span>
                </li>
              ))}
            </ul>
          )
        }

        return (
          <p key={key} className="text-[15px] leading-[1.75] text-text-secondary">
            {renderInline(block, key)}
          </p>
        )
      })}
    </div>
  )
}
