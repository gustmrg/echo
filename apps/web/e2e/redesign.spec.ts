import { expect, test } from '@playwright/test'

for (const mobile of [false, true]) {
  test(`redesign navigation and layout on ${mobile ? 'mobile dark' : 'desktop light'}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(
      mobile ? { width: 360, height: 800 } : { width: 1280, height: 900 },
    )
    await page.emulateMedia({ colorScheme: mobile ? 'dark' : 'light' })
    const recording = {
      id: 'design-fixture',
      title: 'A slower, more thoughtful way to work',
      fileName: 'thoughts.webm',
      fileSizeBytes: 2000000,
      contentType: 'audio/webm',
      createdAt: '2026-09-04T12:00:00Z',
      status: 'transcribed',
      transcribedText:
        'I keep coming back to the same idea: make room for the work that matters.\n\nA little space to think can change the shape of an entire day.',
      editedText: null,
      transcriptRevision: 0,
    }
    await page.route(/\/api\/recordings(?:\/|\?|$)/, (route) => {
      const path = new URL(route.request().url()).pathname
      return route.fulfill({
        json: path.endsWith('/refinements')
          ? [
              {
                id: 'output-fixture',
                format: 'notes',
                status: 'completed',
                transcriptRevision: 0,
                content:
                  '# A little space to think\n\nMake room for the work that matters.',
                failureReason: null,
              },
            ]
          : path.endsWith('/design-fixture')
            ? recording
            : [recording],
      })
    })
    async function checkLayout(name: string) {
      await expect(page.locator('main')).toBeVisible()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      await page.screenshot({
        path: testInfo.outputPath(`${name}.png`),
        fullPage: true,
      })
    }
    await page.goto('/')
    await expect(
      page.getByRole('link', { name: /Continue reviewing/ }),
    ).toBeVisible()
    await checkLayout('library')
    await page.getByRole('link', { name: /Continue reviewing/ }).click()
    await expect(page.getByRole('textbox', { name: 'Transcript' })).toHaveValue(
      recording.transcribedText,
    )
    await checkLayout('review')
    await page.getByRole('button', { name: 'Refine with AI' }).click()
    await page.getByRole('button', { name: /^Notes/ }).click()
    await expect(
      page.getByRole('button', { name: 'Download .md' }),
    ).toBeVisible()
    await checkLayout('output')
    const nav = page.getByRole('navigation', {
      name: mobile ? 'Mobile navigation' : 'Workspace',
      exact: true,
    })
    await nav.getByRole('link', { name: /outputs/i }).click()
    await expect(
      page.locator('main').getByRole('link', { name: /A slower/ }),
    ).toBeVisible()
    await checkLayout('saved-outputs')
    await page
      .locator('main')
      .getByRole('link', { name: /A slower/ })
      .click()
    await expect(
      page.getByRole('button', { name: 'Download .md' }),
    ).toBeVisible()
    await page.goto('/record')
    await expect(
      page.getByRole('button', { name: 'Start recording' }),
    ).toBeVisible()
    await checkLayout('capture')
  })
}

test('saved outputs updates when a queued refinement completes', async ({
  page,
}) => {
  let requests = 0
  await page.route(/\/api\/recordings(?:\/|\?|$)/, (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/refinements')) {
      requests++
      return route.fulfill({
        json: [
          {
            id: 'queued-output',
            format: 'notes',
            transcriptRevision: 0,
            status: requests === 1 ? 'processing' : 'completed',
            content: requests === 1 ? null : 'Finished notes.',
            failureReason: null,
          },
        ],
      })
    }
    return route.fulfill({
      json: [
        {
          id: 'queued-recording',
          title: 'A thought in progress',
          status: 'transcribed',
          transcriptRevision: 0,
          createdAt: '2026-09-04T12:00:00Z',
        },
      ],
    })
  })
  await page.goto('/outputs')
  await expect(
    page.locator('main').getByRole('link', { name: /A thought in progress/ }),
  ).toBeVisible()
  expect(requests).toBeGreaterThan(1)
})
