import { setTimeout as delay } from 'node:timers/promises'
import type { Logger } from '../logging/logger.js'
import type { Refiner } from './refiner.js'
import type { RefinementStore } from './store.js'

export async function runRefinements(store: RefinementStore, refiner: Refiner, logger: Logger,
  signal: AbortSignal, pollMs: number, timeoutMs: number): Promise<void> {
  while (!signal.aborted) {
    try {
      const job = store.claim()
      if (job) {
        const jobSignal = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
        try {
          const result = await refiner.refine(job.sourceText, job.format, jobSignal)
          jobSignal.throwIfAborted()
          store.complete(job, result)
        } catch (error) {
          if (signal.aborted) return
          logger.error('Refinement attempt failed', error, { jobId: job.id })
          store.fail(job, jobSignal.aborted ? 'Refinement timed out. Generate again.' :
            'Refinement could not be completed. Check provider configuration or generate again.')
        }
        continue
      }
    } catch (error) {
      logger.error('Could not poll refinement jobs', error)
    }
    try { await delay(pollMs, undefined, { signal }) }
    catch (error) { if (!signal.aborted) throw error }
  }
}
