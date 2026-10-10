import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateCorrectionFiles, validateListingEdit, CORRECTION_TYPES } from '../src/features/seller/listing-utils.mjs';

test('correction validation accepts only non-empty PDF/JPEG/PNG under 10 MB', () => {
  const file = { name: 'land.pdf', type: 'application/pdf', size: 1024 };
  assert.equal(validateCorrectionFiles([file]), null);
  assert.match(validateCorrectionFiles([]), /at least one/);
  assert.match(validateCorrectionFiles(Array(11).fill(file)), /at most 10/);
  assert.match(validateCorrectionFiles([{ ...file, size: 0 }]), /empty/);
  assert.match(validateCorrectionFiles([{ ...file, size: 10 * 1024 * 1024 + 1 }]), /limit/);
  assert.match(validateCorrectionFiles([{ ...file, name: 'land.exe' }]), /only/);
  assert.match(validateCorrectionFiles([{ ...file, type: 'text/plain' }]), /only/);
});

test('edit validation preserves decimal strings and rejects invalid amounts', () => {
  assert.equal(validateListingEdit('Residential plot', '4800000.00'), null);
  assert.equal(validateListingEdit('Residential plot', '999999999999999999999999.99'), null);
  for (const price of ['0', '0.00', '-1', '1e5', '1.123', 'NaN', '']) assert.match(validateListingEdit('Valid title', price), /positive INR/);
  assert.match(validateListingEdit('AB', '1'), /3–160/);
  assert.match(validateListingEdit('a'.repeat(161), '1'), /3–160/);
  assert.equal(CORRECTION_TYPES.ENCUMBRANCE_CERTIFICATE, 'Encumbrance certificate');
});