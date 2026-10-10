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
  const errors = [], mutations = [], externalMutations = [];
  const base = 'http://127.0.0.1:5180/';
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.method() === 'GET') return;
    // System-installed Edge filtering can inject unrelated external traffic even
    // with extensions disabled. Keep it visible, separate from app mutations.
    (new URL(request.url()).origin === new URL(base).origin ? mutations : externalMutations).push(request.url());
  });
  await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
  const button = name => page.getByRole('button', { name, exact: true });
  const field = name => page.getByLabel(name, { exact: true });
  const status = text => page.getByRole('status').filter({ hasText: text }).waitFor();
  for (const width of [1600, 1280, 1024, 780, 700, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['signin', 'profile']) {
      await page.goto(`${base}#${route}`);
      await page.getByRole('heading', { level: 1 }).waitFor();
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${route} overflow at ${width}`);
      if (route === 'signin') {
        await page.getByRole('tab', { name: 'Register' }).click();
        await field('Full name').waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `register overflow at ${width}`);
        await page.getByRole('tab', { name: 'Login' }).click();
      }
      if ([1600, 390].includes(width)) await page.screenshot({ path: fileURLToPath(new URL(`../artifacts/${route}-${width}.png`, import.meta.url)), fullPage: true });
    }
    console.log(`PASS ${width}px: login/register/profile, page bounds, uploaded icons`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const label of ['Sign In', 'Get Started', 'Demo']) {
    await page.goto(base); await button(label).click();
    await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
    assert.equal(new URL(page.url()).hash, '#signin');
  }
  await field('Selling').check();
  await field('Email address').fill('demo@example.com');
  await field('Password').fill('sample-only');
  await button('Show password').click();
  assert.equal(await field('Password').getAttribute('type'), 'text');
  await button('Hide password').click();
  await button('Forgot password?').click();
  await page.getByRole('heading', { name: 'Password recovery' }).waitFor();
  await page.keyboard.press('Escape'); await button('Sign in').click();
  await page.getByRole('heading', { level: 1 }).waitFor();
  assert.equal(await field('Email address').inputValue(), 'demo@example.com');
  assert.equal(await button('Selling').getAttribute('aria-pressed'), 'true');
  await field('Full name').fill('Sample Citizen');
  await field('Mobile number').fill('+91 0000000000');
  await field('Document type').selectOption({ label: 'Sample identity card' });
  const upload = field('Sample identity evidence file');
  for (const [name,mimeType,buffer,error] of [
    ['bad.txt','text/plain',Buffer.from('bad'),'Only sample PDF'],
    ['fake.png','image/png',Buffer.from('bad'),'does not match'],
    ['large.pdf','application/pdf',Buffer.alloc(10*1024*1024+1),'up to 10 MB'],
  ]) { await upload.setInputFiles({name,mimeType,buffer}); await page.getByRole('alert').filter({hasText:error}).waitFor(); }
  await upload.setInputFiles({name:'sample.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n% synthetic sample\n%%EOF')});
  await status('selected locally'); await page.getByRole('checkbox').check();
  await button('Save draft').click(); await status('page memory');
  await button('Submit for review').click();
  await page.getByRole('dialog', { name: 'Review sample submission' }).waitFor();
  await button('Back to edit').click(); await button('Submit for review').click();
  await button('Finish demo preview').click(); await status('not sent to a reviewer');
  await field('Location').fill('Sample city');
  assert.ok(await page.getByText('Not submitted', {exact:false}).isVisible());
  await button('Remove').click(); await button('Submit for review').click();
  await page.getByRole('alert').filter({hasText:'Choose sample identity evidence'}).waitFor();
  assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0,0]);
  await button('Sign out').click(); await field('Password').waitFor();
  assert.equal(await field('Password').inputValue(), '');
  await page.getByRole('tab', {name:'Register'}).click();
  await field('Full name').fill('Registered Demo'); await field('Email address').fill('sample@example.com');
  await field('Password').fill('sample-only'); await page.getByRole('checkbox').check();
  await button('Create account').click(); await field('Full name').waitFor();
  assert.equal(await field('Full name').inputValue(), 'Registered Demo');
  await page.reload(); await field('Full name').waitFor();
  assert.equal(await field('Full name').inputValue(), 'Santosh Pabolu');
  assert.deepEqual(mutations, []); assert.deepEqual(errors, []);
  if (externalMutations.length) console.log(`ENVIRONMENT NOTICE: ${externalMutations.length} external non-GET requests from browser filtering, outside the application origin: ${[...new Set(externalMutations)].join(', ')}`);
  console.log('PASS routes, login/register, context, passwords, file validation, draft, review/edit, clearing, no storage/application-origin mutations/runtime errors');
} finally { await browser?.close(); await server.close(); }
