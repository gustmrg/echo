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

