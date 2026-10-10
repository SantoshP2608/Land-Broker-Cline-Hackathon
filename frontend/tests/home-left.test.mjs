import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { test, after } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithEsbuild } from 'vite';

// Compile the real JSX for server rendering; CSS is verified by the production build.
const source = await readFile(new URL('../src/features/home/HomeLeft.jsx', import.meta.url), 'utf8');
const compiled = await transformWithEsbuild(source.replace("import './HomeLeft.css';", ''), 'HomeLeft.jsx', { loader: 'jsx', jsx: 'transform' });
const moduleUrl = new URL('./.home-left-compiled.mjs', import.meta.url);
await writeFile(moduleUrl, compiled.code);
after(() => unlink(moduleUrl));
const { default: HomeLeft } = await import(moduleUrl.href);
const render = (props = {}) => renderToStaticMarkup(React.createElement(HomeLeft, props));

 test('renders design headline, demo notice, actions, and all four features', () => {
  const html = render({ onTryDemo() {}, onWatchHowItWorks() {} });
  for (const text of ['Verify Property', 'Documents', 'Before You Register', 'Demo version', 'Try Demo', 'Watch How It Works', 'Trusted', 'AI Document', 'Cross-Document', 'Buyer &amp; Seller']) {
    assert.ok(html.includes(text), `Missing ${text}`);
  }
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.equal((html.match(/<li\b/g) || []).length, 4);
  assert.equal((html.match(/<button\b/g) || []).length, 2);
  assert.ok(!html.includes('disabled=""'));
  assert.ok(html.includes('aria-labelledby="home-hero-title"'));
});

 test('actions without parent handlers are explicitly disabled', () => {
  assert.equal((render().match(/disabled=""/g) || []).length, 2);
});

 test('supports supplied background and decorative feature icon assets', () => {
  const html = render({ backgroundImage: '/assets/hero.webp', featureIcons: { trusted: '/assets/trusted.svg' } });
  assert.ok(html.includes('home-hero--with-image'));
  assert.ok(html.includes('/assets/hero.webp'));
  assert.ok(html.includes('src="/assets/trusted.svg"'));
  assert.ok(html.includes('alt=""'));
});

 test('works without external image assets', () => {
  const html = render();
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('home-hero--with-image'));
  assert.equal((html.match(/<svg\b/g) || []).length, 6);
});
