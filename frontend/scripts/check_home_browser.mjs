import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

// Optional real-browser check: uses installed Microsoft Edge, no browser download.
const server = await createServer({ server: { host: '127.0.0.1', port: 5179, strictPort: true } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
  for (const width of [1600, 1280, 1024, 780, 700, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:5179/');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.home-hero__features img').last().waitFor();
    await page.evaluate(() => document.fonts.ready);
    const layout = await page.evaluate(async () => {
      const images = [...document.querySelectorAll('.home-hero__features img')];
      await Promise.all(images.map(image => image.decode()));
      const gradient = document.querySelector('.home-hero__gradient');
      const range = document.createRange();
      range.selectNodeContents(gradient);
      const text = range.getBoundingClientRect();
      const box = gradient.getBoundingClientRect();
      const hero = document.querySelector('.home-hero').getBoundingClientRect();
      const features = document.querySelector('.home-hero__features').getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        textFits: text.left >= box.left - 1 && text.right <= box.right + 1 && text.bottom <= box.bottom + 1,
        featuresFit: features.bottom <= hero.bottom,
        loadedIcons: images.filter(image => image.naturalWidth > 0).length,
        background: getComputedStyle(document.querySelector('.home-hero'), '::before').backgroundImage,
      };
    });
    assert.equal(layout.overflow, false, `Horizontal overflow at ${width}px`);
    assert.ok(layout.textFits, `Gradient text clipped at ${width}px`);
    assert.ok(layout.featuresFit, `Features clipped at ${width}px`);
    assert.equal(layout.loadedIcons, 4);
    assert.ok(layout.background.includes('Main-hero.png'));
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    const toggle = nav.locator('.site-nav__toggle');
    if (width <= 900) {
      assert.equal(await nav.getByRole('link', { name: 'Home', exact: true }).isVisible(), false);
      await toggle.click();
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
      await page.keyboard.press('Escape');
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      assert.ok(await toggle.evaluate(element => element === document.activeElement));
      await toggle.click();
    }
    for (const [label, title] of [['How It Works', 'How verification works'], ['About', 'About this platform']]) {
      if (width <= 900 && !(await nav.getByRole('button', { name: label, exact: true }).isVisible())) await toggle.click();
      await nav.getByRole('button', { name: label, exact: true }).click();
      await page.getByRole('heading', { name: title, exact: true }).waitFor();
      await page.keyboard.press('Escape');
      if (width <= 900) assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    }
    if (width <= 900) await toggle.click();
    await nav.getByRole('link', { name: 'Features', exact: true }).click();
    assert.equal(new URL(page.url()).hash, '#features');
    if (width <= 900) await toggle.click();
    await nav.getByRole('link', { name: 'Home', exact: true }).click();
    assert.equal(new URL(page.url()).hash, '#home');
    if (width <= 900) {
      await toggle.click();
      await page.mouse.click(5, 300);
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      await toggle.click();
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.waitForFunction(() => document.querySelector('.site-nav__toggle').getAttribute('aria-expanded') === 'false');
      await page.setViewportSize({ width, height: 900 });
    }
    const navFits = await page.evaluate(() => {
      const header = document.querySelector('.site-header').getBoundingClientRect();
      const notice = document.querySelector('.home-hero__notice').getBoundingClientRect();
      return header.bottom <= notice.top && document.documentElement.scrollWidth <= innerWidth;
    });
    assert.ok(navFits, `Navbar overlaps hero or overflows at ${width}px`);
    if ([1600, 780, 390].includes(width)) {
      await page.screenshot({ path: fileURLToPath(new URL(`../artifacts/home-${width}.png`, import.meta.url)), fullPage: true });
    }
    console.log(`PASS ${width}px: headline, page bounds, four icons, hero background`);
  }
  await page.getByRole('button', { name: 'Try Demo' }).click();
  await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
  await page.getByRole('link', { name: 'Back to home' }).click();
  await page.getByRole('button', { name: 'Watch How It Works' }).click();
  await page.getByRole('heading', { name: 'How verification works' }).waitFor();
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  console.log('PASS both dialogs, Escape dismissal, no browser runtime errors');
} finally {
  await browser?.close();
  await server.close();
}
