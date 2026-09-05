import { expect, test } from '@playwright/test'

test('upload recovery, real worker, durable review, refinement, and deletion', async ({ page, browser }) => {
  await page.goto('/record')
  // Simulate a lost upload response AFTER the real API has committed the recording.
  await page.route('**/api/recordings', async route => {
    if (route.request().method() !== 'POST') return route.continue()
    await route.fetch()
    await route.abort()
    await page.unroute('**/api/recordings')
  })
  await page.locator('input[type=file]').setInputFiles({ name: 'test.webm', mimeType: 'audio/webm', buffer: Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1]) })
  await expect(page.getByRole('button', { name: 'Download audio' })).toBeVisible()
  await page.getByRole('button', { name: 'Retry upload' }).click()
  await expect(page.getByRole('textbox', { name: 'Transcript' })).toHaveValue('A useful original transcript.', { timeout: 20000 })
  const detailUrl = page.url()
  const id = detailUrl.split('/').pop()!
  expect((await (await page.request.get('/api/recordings')).json()).length).toBe(1)
  await page.getByRole('textbox', { name: 'Transcript' }).fill('Reviewed text saved immediately before navigation.')
  await page.getByRole('button', { name: 'Refine with AI' }).click()
  await page.getByRole('button', { name: /^Notes/ }).click()
  await expect(page.getByText('Reviewed text saved immediately before navigation.', { exact: true })).toBeVisible({ timeout: 15000 })
  const fresh = await browser.newContext()
  const other = await fresh.newPage()
  await other.goto(detailUrl)
  await expect(other.getByRole('textbox', { name: 'Transcript' })).toHaveValue('Reviewed text saved immediately before navigation.')
  await other.getByRole('textbox', { name: 'Transcript' }).fill('A newer revision.')
  await other.getByRole('button', { name: 'Refine with AI' }).click()
  await expect(other.getByText('Generated', { exact: true })).toHaveCount(0)
  await other.getByRole('button', { name: /^Notes/ }).click()
  await expect(other.getByText('A newer revision.', { exact: true })).toBeVisible({ timeout: 15000 })
  await page.goto(detailUrl)
  await page.evaluate(id => localStorage.setItem(`echo:output:${id}:notes`, 'legacy output'), id)
  await page.getByRole('button', { name: 'Delete recording', exact: true }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page).toHaveURL('http://127.0.0.1:5190/')
  expect(await page.evaluate(id => localStorage.getItem(`echo:output:${id}:notes`), id)).toBeNull()
  expect((await page.request.get(`/api/recordings/${id}/refinements`)).status()).toBe(404)
  await fresh.close()
})


test('failed transcription retries the same stored audio after bounded provider attempts', async ({ page }) => {
  await page.goto('/record')
  await page.locator('input[type=file]').setInputFiles({ name: 'retry.webm', mimeType: 'audio/webm', buffer: Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 2]) })
  await expect(page.getByRole('button', { name: 'Retry transcription' })).toBeVisible({ timeout: 25000 })
  const url = page.url()
  const id = url.split('/').pop()!
  const failed = await (await page.request.get(`/api/recordings/${id}`)).json()
  expect(failed.retryCount).toBe(3)
  expect(failed.attemptCount).toBe(3)
  await page.getByRole('button', { name: 'Retry transcription' }).click()
  await expect(page.getByRole('textbox', { name: 'Transcript' })).toHaveValue('A useful original transcript.', { timeout: 10000 })
  expect(page.url()).toBe(url)
  // A delayed replay of the old retry must not restart an already completed transcription.
  expect((await page.request.post(`/api/recordings/${id}/retry`, { data: { expectedRetryCount: 3 } })).status()).toBe(409)
})
