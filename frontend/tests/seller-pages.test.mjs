import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { test, after } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithEsbuild } from 'vite';

// Compile the real seller-feature JSX modules for server rendering, preserving their
// relative import graph so icons.jsx / SellerLayout.jsx resolve correctly. CSS imports
// are stripped since styling is verified by the production build, not SSR.
const srcDir = new URL('../src/features/seller/', import.meta.url);
const outDir = new URL('./.compiled-seller/', import.meta.url);
await mkdir(outDir, { recursive: true });
after(() => rm(outDir, { recursive: true, force: true }));

async function compile(name) {
  const source = await readFile(new URL(name, srcDir), 'utf8');
  const stripped = source
    .replace(/^import '.*\.css';\r?\n/gm, '')
    .replace(/\.jsx'/g, ".mjs'");
  const compiled = await transformWithEsbuild(stripped, name, { loader: 'jsx', jsx: 'transform' });
  const outUrl = new URL(name.replace('.jsx', '.mjs'), outDir);
  await writeFile(outUrl, compiled.code);
  return outUrl;
}

await compile('icons.jsx');
await compile('SellerLayout.jsx');
const dashboardUrl = await compile('SellerDashboard.jsx');
const formUrl = await compile('ListLandForm.jsx');

const { default: SellerDashboard } = await import(dashboardUrl.href);
const { default: ListLandForm } = await import(formUrl.href);

function render(Component, props = {}) {
  return renderToStaticMarkup(React.createElement(Component, props));
}

test('Seller Dashboard renders welcome, stats, listings, and buyer requests', () => {
  const html = render(SellerDashboard, { onNavigate() {}, onListMyLand() {} });
  for (const text of ['Welcome back', 'Total Listings', 'Approved', 'Under Verification', 'Buyer Requests', 'List My Land', 'Submit for verification', 'Agricultural Land', 'Residential Plot', 'Commercial Land', 'Arjun Mehta', 'Verification Progress']) {
    assert.ok(html.includes(text), `Missing "${text}"`);
  }
  assert.ok(html.includes('Switch to'));
});

test('Seller Dashboard shows a buyer-request badge count on the sidebar', () => {
  const html = render(SellerDashboard, {});
  assert.ok(html.includes('seller-sidebar__badge'));
});

test('List Land Form starts on step 1 (Location & Survey) with the four-step tracker', () => {
  const html = render(ListLandForm, {});
  for (const text of ['List Your', 'Land', 'Location &amp; Survey', 'Area &amp; Pricing', 'Photos &amp; Documents', 'Review &amp; Submit', 'Location &amp; Survey Details', 'Survey Number', 'Map Location', 'Tips for this step']) {
    assert.ok(html.includes(text), `Missing "${text}"`);
  }
});

test('List Land Form never claims publication before backend approval', () => {
  const html = render(ListLandForm, {});
  assert.ok(!html.includes('is now live'));
  assert.ok(!html.includes('published successfully'));
});
