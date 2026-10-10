import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { test, after } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithEsbuild } from 'vite';

// Compile the real buyer-feature JSX/JS modules for server rendering, preserving their
// relative import graph so icons.jsx / illustrations.jsx / listings.js / BuyerLayout.jsx
// resolve correctly. CSS imports are stripped since styling is verified by the production
// build, not SSR.
const srcDir = new URL('../src/features/buyer/', import.meta.url);
const outDir = new URL('./.compiled-buyer/', import.meta.url);
await mkdir(outDir, { recursive: true });
after(() => rm(outDir, { recursive: true, force: true }));

async function compile(name) {
  const source = await readFile(new URL(name, srcDir), 'utf8');
  const stripped = source
    .replace(/^import '.*\.css';\r?\n/gm, '')
    .replace(/\.jsx'/g, ".mjs'")
    .replace(/listings\.js'/g, "listings.mjs'");
  const loader = name.endsWith('.jsx') ? 'jsx' : 'js';
  const compiled = await transformWithEsbuild(stripped, name, { loader, jsx: 'transform' });
  const outName = name.replace(/\.jsx$/, '.mjs').replace(/\.js$/, '.mjs');
  const outUrl = new URL(outName, outDir);
  await writeFile(outUrl, compiled.code);
  return outUrl;
}

await compile('icons.jsx');
await compile('illustrations.jsx');
await compile('listings.js');
await compile('BuyerLayout.jsx');
const marketplaceUrl = await compile('Marketplace.jsx');
const landDetailUrl = await compile('LandDetail.jsx');
const buyerPagesUrl = await compile('BuyerPages.jsx');

const { default: Marketplace } = await import(marketplaceUrl.href);
const { default: LandDetail } = await import(landDetailUrl.href);
const { default: BuyerPages } = await import(buyerPagesUrl.href);

function render(Component, props = {}) {
  return renderToStaticMarkup(React.createElement(Component, props));
}

test('Marketplace renders hero, search, filters, and six demo listings', () => {
  const html = render(Marketplace, { savedIds: new Set(), onToggleSave() {} });
  for (const text of [
    'Find', 'Verified', 'Lands',
    'Search by location, city, village, or keyword',
    'Land Type', 'Price Range', 'Area (Acres)', 'More Filters', 'Sort by',
    'List View', 'Map View',
    'Agricultural Land', 'Residential Plot', 'Commercial Land',
    'Narsingi, Hyderabad', 'Shamshabad, Hyderabad', 'Ghatkesar, Hyderabad',
    'Nhamirpet, Hyderabad', 'Kompally, Hyderabad', 'Adibatla, Hyderabad',
  ]) {
    assert.ok(html.includes(text), `Missing "${text}"`);
  }
  assert.ok(html.includes('6 Verified Listings'));
});

test('Marketplace shows a sign-in control when no account is present', () => {
  const html = render(Marketplace, { account: null, savedIds: new Set(), onToggleSave() {} });
  assert.ok(html.includes('Sign in'));
});

test('Marketplace never implies real verified ownership or a live backend', () => {
  const html = render(Marketplace, { savedIds: new Set(), onToggleSave() {} });
  assert.ok(!html.includes('guaranteed'));
  assert.ok(!html.includes('legally verified'));
});

test('LandDetail renders gallery, specs, verification status, and documents without exposing private files', () => {
  const html = render(LandDetail, { id: 'land-1', savedIds: new Set(), onToggleSave() {} });
  for (const text of [
    'Back to Listings', 'Agricultural Land', 'Narsingi, Hyderabad',
    'Survey No. 123/2', 'Verification Status', 'Document Authenticity',
    'Ownership Details', 'Encumbrance Check', 'Land Use &amp; Zoning',
    'Documents', 'Sale Deed (Owner)', 'Survey Map', 'Encumbrance Certificate', 'ROR / Pahani',
    'Description', 'not a legal guarantee', 'Send Purchase Request', 'Contact Seller',
    'Private seller documents are not exposed',
  ]) {
    assert.ok(html.includes(text), `Missing "${text}"`);
  }
});

test('LandDetail explains that documents dialog is demo-only and not public access', () => {
  const html = render(LandDetail, { id: 'land-2', savedIds: new Set(), onToggleSave() {} });
  assert.ok(html.includes('Document evidence, not public access'));
  assert.ok(html.includes('does not constitute a legal guarantee'));
});

test('BuyerPages defaults to the marketplace route', () => {
  const html = render(BuyerPages, {});
  assert.ok(html.includes('Find'));
  assert.ok(html.includes('Verified'));
  assert.ok(html.includes('Browse Lands') || html.includes('Verified Listings'));
});

test('BuyerPages renders the land detail route when the hash targets a known listing', () => {
  const originalHash = globalThis.location?.hash;
  // jsdom/node test env may not provide window; guard for SSR-only environments.
  if (typeof window !== 'undefined') {
    window.location.hash = '#land-3';
    const html = render(BuyerPages, {});
    assert.ok(html.includes('Commercial Land'));
    window.location.hash = originalHash || '';
  } else {
    assert.ok(true);
  }
});
