import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBuyerWorkspaceService } from '../src/features/buyer/buyer-workspace-service.mjs';
test('proceed unlocks preparation while preserving reservation and rejecting stale decisions', () => {
  const s = createBuyerWorkspaceService();
  const next = s.decide('PROCEED', 1);
  assert.equal(next.stage, 'AGREEMENT_READY');
  assert.equal(next.reserved, true);
  assert.throws(() => s.decide('DISCUSS', 1), /changed/);
  assert.throws(() => s.decide('DISCUSS', 2), /no longer/);
});
test('cancellation after proceed holds the parcel and never releases it', () => {
  const s = createBuyerWorkspaceService();
  s.decide('PROCEED', 1);
  const next = s.cancel('Area needs further review', 2);
  assert.equal(next.stage, 'ON_HOLD');
  assert.equal(next.reserved, true);
  assert.throws(() => s.decide('PROCEED', 3), /no longer/);
  assert.throws(() => s.cancel('Again', 3), /already/);
});
test('invalid input and returned snapshots cannot change the transaction', () => {
  const s = createBuyerWorkspaceService();
  assert.throws(() => s.cancel(' ', 1));
  assert.throws(() => s.decide('SOLD', 1));
  const copy = s.getSnapshot(); copy.reserved = false;
  assert.equal(s.getSnapshot().reserved, true);
  assert.equal(s.getSnapshot().version, 1);
  assert.equal(s.decide('DISCUSS', 1).stage, 'DISCUSSION');
});
