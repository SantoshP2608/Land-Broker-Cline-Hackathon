import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
after(() => server.close());
const { default: AuthPage } = await server.ssrLoadModule('/src/features/account/AuthPage.jsx');
const renderAuth = journey => renderToStaticMarkup(React.createElement(AuthPage, { journey, onJourneyChange() {}, onContinue() {}, onOpenPanel() {} }));

test('account page renders labelled demo login and navigation', () => {
  const html = renderAuth('buying');
  for (const label of ['Welcome back', 'Email address', 'Password', 'Buying', 'Selling', 'Register', 'Back to home', 'Frontend demo only']) assert.ok(html.includes(label), label);
  assert.ok(html.includes('type="email"'));
  assert.ok(html.includes('type="password"'));
  assert.ok(html.includes('minLength="8"'));
  assert.ok(html.includes('aria-label="Show password"'));
  assert.ok(html.includes('role="tabpanel"'));
  assert.ok(!html.includes('Remember me'));
});

test('buying and selling are selectable contexts, not privileged account roles', () => {
  for (const journey of ['buying', 'selling']) {
    const html = renderAuth(journey);
    assert.match(html, new RegExp(`name="journey"[^>]*checked=""[^>]*value="${journey}"`));
    assert.ok(!html.includes('reviewer'));
    assert.ok(!html.includes('registrar'));
  }
});

test('profile direct preview uses synthetic defaults and no approval claim', async () => {
  const { default: ProfilePage } = await server.ssrLoadModule('/src/features/account/ProfilePage.jsx');
  const html = renderToStaticMarkup(React.createElement(ProfilePage, { account: null, journey: 'buying', onJourneyChange() {}, onSignOut() {}, onOpenPanel() {} }));
  for (const label of ['Personal details', 'Identity evidence', 'Verification status', 'Not submitted', '/assets/cloud-upload.png', '/assets/privacy-shield.png']) assert.ok(html.includes(label), label);
  assert.ok(!html.includes('Identity confirmed'));
});
