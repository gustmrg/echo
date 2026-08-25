/**
 * MOCK — AI refinement (F4).
 *
 * The API has no refinement endpoint yet, so this module simulates one:
 * realistic latency plus structured, format-specific output derived from the
 * actual transcript text. When the backend ships a real endpoint
 * (e.g. POST /recordings/{id}/refine), replace `refineTranscript`'s body with
 * an apiFetch call — every consumer goes through this one function.
 */

export type OutputFormat = 'blog' | 'interview' | 'notes' | 'news'

export interface FormatInfo {
  id: OutputFormat
  name: string
  description: string
}

export const FORMATS: FormatInfo[] = [
  {
    id: 'blog',
    name: 'Blog Post',
    description: 'A publishable article with intro, body, and conclusion — your voice, polished.',
  },
  {
    id: 'interview',
    name: 'Interview',
    description: 'Dialog format that preserves each speaker\u2019s personality.',
  },
  {
    id: 'notes',
    name: 'Notes',
    description: 'Clean, organized capture of key points with minimal structure.',
  },
  {
    id: 'news',
    name: 'News Brief',
    description: 'Factual summary with clear highlights and bullet points.',
  },
]

export const FORMAT_LABELS: Record<OutputFormat, string> = {
  blog: 'Blog Post',
  interview: 'Interview',
  notes: 'Notes',
  news: 'News Brief',
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
}

function titleFrom(first: string): string {
  const words = first.replace(/[.!?]+$/, '').split(' ').slice(0, 8).join(' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function group<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function asBlog(parts: string[]): string {
  const title = titleFrom(parts[0] ?? 'Untitled')
  const sections = group(parts.slice(1), 3)
  const body = sections
    .map((s, i) => `## ${titleFrom(s[0] ?? `Part ${i + 1}`)}\n\n${s.join(' ')}`)
    .join('\n\n')
  return [
    `# ${title}`,
    parts[0] ?? '',
    body,
    `## Wrapping up\n\n${parts[parts.length - 1] ?? ''}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

function asInterview(parts: string[]): string {
  const speakers = ['Interviewer', 'Guest']
  const lines = parts.map((s, i) => `**${speakers[i % 2]}:** ${s}`)
  return ['# Interview Transcript', '', ...lines].join('\n\n')
}

function asNotes(parts: string[]): string {
  const sections = group(parts, 3)
  return sections
    .map((s, i) => {
      const heading = i === 0 ? '## Key points' : `## ${titleFrom(s[0] ?? 'More')}`
      const bullets = s.map((x) => `- ${x.replace(/[.!?]+$/, '')}`).join('\n')
      return `${heading}\n\n${bullets}`
    })
    .join('\n\n')
    .replace(/^/, '# Notes\n\n')
}

function asNews(parts: string[]): string {
  const headline = titleFrom(parts[0] ?? 'Untitled')
  const highlights = parts
    .slice(0, 4)
    .map((s) => `- ${s.replace(/[.!?]+$/, '')}`)
    .join('\n')
  const body = group(parts.slice(4), 3)
    .map((s) => s.join(' '))
    .join('\n\n')
  return [`# ${headline}`, '## At a glance', highlights, body]
    .filter(Boolean)
    .join('\n\n')
}

const builders: Record<OutputFormat, (parts: string[]) => string> = {
  blog: asBlog,
  interview: asInterview,
  notes: asNotes,
  news: asNews,
}

export async function refineTranscript(transcript: string, format: OutputFormat): Promise<string> {
  // Simulated API latency
  await delay(1800 + Math.random() * 1400)

  const parts = sentences(transcript)
  if (parts.length === 0) {
    throw new Error('The transcript is empty — nothing to refine.')
  }
  return builders[format](parts)
}
