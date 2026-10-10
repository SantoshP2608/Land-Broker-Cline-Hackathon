import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { test, after } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithEsbuild } from 'vite';

const source = await readFile(new URL('../src/features/home/Navbar.jsx', import.meta.url), 'utf8');
const compiled = await transformWithEsbuild(source.replace("import './Navbar.css';", ''), 'Navbar.jsx', { loader: 'jsx', jsx: 'transform' });
const moduleUrl = new URL('./.navbar-compiled.mjs', import.meta.url);
await writeFile(moduleUrl, compiled.code);
after(() => unlink(moduleUrl));
const { default: Navbar } = await import(moduleUrl.href);
const render = () => renderToStaticMarkup(React.createElement(Navbar, { onOpenPanel() {} }));

test('renders reference navigation and actions without branding', () => {
  const html = render();
  for (const label of ['Home', 'How It Works', 'Features', 'About', 'Demo', 'Sign In', 'Get Started']) {
    assert.ok(html.includes(label), `Missing ${label}`);
  }
  assert.ok(html.includes('aria-label="Main navigation"'));
  assert.ok(html.includes('href="#home"'));
  assert.ok(html.includes('href="#features"'));
  assert.ok(html.includes('aria-current="page"'));
  assert.ok(!html.includes('LandShield'));
  assert.ok(!html.includes('<img'));
});

test('mobile menu starts collapsed with an accessible toggle', () => {
  const html = render();
  assert.ok(html.includes('aria-expanded="false"'));
  assert.ok(html.includes('aria-controls="site-nav-menu"'));
  assert.ok(html.includes('id="site-nav-menu"'));
  assert.ok(html.includes('aria-label="Open navigation menu"'));
  assert.ok(!html.includes('site-nav__menu--open'));
});
