import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const server = await createServer({ server: { host: '127.0.0.1', port: 5182, strictPort: true } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--disable-extensions'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(30000);
  const errors = [], apiRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url()); });
  const base = 'http://127.0.0.1:5182';
  const heading = name => page.getByRole('heading', { name, exact: true }).waitFor();
  for (const [path, title] of [['/page-2', 'Welcome back'], ['/signin', 'Welcome back'], ['/page-3', 'Profile & Identity Verification'], ['/profile', 'Profile & Identity Verification'], ['/page-6', 'Listing Verification & Management'], ['/page-7', 'Buyer Requests'], ['/page-12', 'Agreement & Registration Preparation'], ['/page-13', 'Cancellation / Hold & Resolution']]) {
    await page.goto(`${base}${path}`);
    await heading(title);
    console.log(`PASS integrated direct route ${path}`);
  }
  for (const [route, selector] of [['/#seller-dashboard', '.dashboard-hero'], ['/#seller-list-land', '.list-land-hero'], ['/#marketplace', '.marketplace-hero'], ['/#land-land-1', '.detail-layout'], ['/#outcome', '.outcome-heading'], ['/#reviewer', '.officer-title'], ['/#registrar', '.officer-title']]) {
    await page.goto(`${base}${route}`);
    await page.locator(selector).waitFor();
    assert.ok((await page.getByRole('heading', { level: 1 }).first().textContent()).trim());
    console.log(`PASS preserved teammate route ${route}`);
  }
  await page.goto(base);
  await page.getByRole('button', { name: 'About', exact: true }).click();
  await page.getByRole('button', { name: 'Open page 12 · Agreement preparation', exact: true }).click();
  await heading('Agreement & Registration Preparation');
  await page.getByRole('link', { name: 'LandShield homepage', exact: true }).click();
  await page.getByRole('button', { name: 'Try Demo', exact: true }).click();
  await heading('Welcome back');
  await page.getByLabel('Email address', { exact: true }).fill('integration@example.com');
  await page.getByLabel('Password', { exact: true }).fill('sample-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await heading('Profile & Identity Verification');
  await page.getByRole('button', { name: 'My transactions', exact: true }).click();
  await heading('My transactions preview');
  await page.getByRole('button', { name: 'Open page 13 · Cancellation & resolution', exact: true }).click();
  await heading('Cancellation / Hold & Resolution');
  await page.goBack();
  await heading('Profile & Identity Verification');
  assert.equal(await page.getByLabel('Email address', { exact: true }).inputValue(), 'integration@example.com');
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.goForward();
  await heading('Cancellation / Hold & Resolution');
  assert.deepEqual(errors, []);
  assert.deepEqual(apiRequests, []);
  console.log('PASS homepage/account entry preserved, preview links, back/forward, account memory, no stale dialogs or API requests/runtime errors');
} finally {
  await browser?.close();
  await server.close();
}