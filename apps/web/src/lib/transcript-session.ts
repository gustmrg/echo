/** Serializes saves, including edits made while a request is in flight. */
export class TranscriptSession {
  text: string
  savedText: string
  revision: number
  private inFlight: Promise<void> | null = null
  private readonly save: (text: string, revision: number) => Promise<number>
  constructor(text: string, revision: number,
    save: (text: string, revision: number) => Promise<number>, draft?: string | null) {
    this.save = save
    this.text = draft ?? text
    this.savedText = text
    this.revision = revision
  }
  edit(text: string) { this.text = text }
  get dirty() { return this.text !== this.savedText }
  flush(): Promise<void> {
    if (this.inFlight) return this.inFlight
    this.inFlight = this.run().finally(() => { this.inFlight = null })
    return this.inFlight
  }
  private async run() {
    while (this.dirty) {
      const text = this.text
      this.revision = await this.save(text, this.revision)
      this.savedText = text
    }
  }
}
