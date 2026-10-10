import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const server = await createServer({ server: { host: '127.0.0.1', port: 5180, strictPort: true } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--disable-extensions'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
  const goto = path => page.goto(`http://127.0.0.1:5180${path}`);
  for (const width of [1600, 1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, title, number] of [['/page-6', 'Listing Verification & Management', 6], ['/page-7', 'Buyer Requests', 7]]) {
      await goto(path);
      await page.getByRole('heading', { name: title, exact: true }).waitFor();
      await page.getByRole('button', { name: number === 6 ? 'Choose files' : 'Accept request', exact: true }).waitFor();
      await page.waitForFunction(() => !document.querySelector('[role="status"]')?.textContent.includes('Loading'));
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
      });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Page ${number} overflow at ${width}`);
      assert.equal(await page.locator('img').evaluateAll(images => images.filter(image => !image.naturalWidth).length), 0);
      if ([1600, 390].includes(width)) await page.screenshot({ path: fileURLToPath(new URL(`../artifacts/page-${number}-${width}.png`, import.meta.url)), fullPage: true });
      console.log(`PASS page ${number}, ${width}px: no horizontal overflow, assets loaded`);
    }
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await goto('/page-6');
  await page.getByRole('button', { name: 'Choose files' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Publish listing', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'View evidence' }).click();
  await page.getByRole('dialog').waitFor({ state: 'visible' });
  assert.match(await page.getByRole('dialog').textContent(), /128\/2/);
  await page.keyboard.press('Escape');
  await page.locator('input[type="file"]').setInputFiles({ name: 'bad.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('bad') });
  await page.getByRole('alert').filter({ hasText: /only PDF/ }).waitFor();
  await page.locator('input[type="file"]').setInputFiles({ name: 'synthetic-corrected-record.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nSynthetic demonstration only') });
  await page.getByRole('button', { name: 'Submit corrections', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm submission' }).click();
  await page.getByRole('status').filter({ hasText: /Submitted for review/ }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Publish listing', exact: true }).isDisabled(), true);
  await goto('/page-6');
  await page.getByRole('button', { name: 'Edit listing', exact: true }).click();
  await page.getByLabel('Listing title', { exact: true }).fill('Synthetic updated residential plot');
  await page.getByLabel('Asking price (INR)', { exact: true }).fill('4900000.00');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('heading', { name: 'Synthetic updated residential plot' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Publish listing', exact: true }).isDisabled(), true);
  console.log('PASS page 6: private evidence, invalid file rejection, upload/review, editing, publication guard');

  await goto('/page-7');
  await page.getByRole('tab', { name: 'Pending (3)' }).waitFor();
  await page.getByLabel('Search buyers').fill('Priya');
  await page.getByRole('heading', { name: 'Selected request' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Accept request', exact: true }).isDisabled(), true);
  await page.getByLabel('Search buyers').fill('not-a-buyer');
  assert.match(await page.locator('.buyer-page').textContent(), /no|nothing|match/i);
  await page.getByLabel('Search buyers').fill('');
  await page.getByRole('button', { name: 'Accept request', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'visible' });
  await page.getByRole('dialog').getByRole('button', { name: /confirm.*accept|accept.*confirm|accept request/i }).click();
  await page.getByRole('tab', { name: 'Accepted (2)' }).waitFor();
  await page.getByRole('tab', { name: 'Pending' }).click();
  await page.getByLabel('Search buyers').fill('Ravi');
  assert.equal(await page.getByRole('button', { name: 'Accept request', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'Decline', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm decline', exact: true }).click();
  await page.getByRole('tab', { name: 'Declined (2)' }).waitFor();
  await page.getByLabel('Search buyers').fill('');
  await page.getByRole('tab', { name: 'Pending' }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('tab', { name: 'Accepted (2)' }).getAttribute('aria-selected'), 'true');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole('button', { name: 'Toggle seller navigation' }).click();
  assert.equal(await page.getByRole('button', { name: 'Toggle seller navigation' }).getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button', { name: 'Toggle seller navigation' }).getAttribute('aria-expanded'), 'false');
  console.log('PASS page 7: search/empty states, identity gate, confirmed acceptance/decline, competing lock, keyboard tabs/mobile navigation');
  assert.deepEqual(errors, []);
  console.log('PASS no browser runtime errors');
} finally {
  await browser?.close();
  await server.close();
}