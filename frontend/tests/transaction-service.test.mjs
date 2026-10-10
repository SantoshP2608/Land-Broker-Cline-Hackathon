import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createTransactionService, validateEvidenceFiles } from '../src/features/transactions/transaction-service.mjs';

const file = (name = 'synthetic.pdf', type = 'application/pdf', text = '%PDF-1.4 synthetic') => new File([text], name, { type });

test('transaction pages explicitly reject API mode rather than falling back', () => {
  assert.equal(createTransactionService().mode, 'demo');
  for (const mode of ['api', 'automatic', '', null]) assert.throws(() => createTransactionService({ mode }), { code: 'MODE_UNAVAILABLE' });
});
test('transaction seeds preserve screenshot stages and remain isolated', async () => {
  const one = createTransactionService();
  const two = createTransactionService();
  const current = await one.getAgreement();
  assert.equal(current.terms.total, '11250000.00');
  assert.equal(current.terms.remaining, '10250000.00');
  current.confirmations.seller.confirmed = false;
  assert.equal((await one.getAgreement()).confirmations.seller.confirmed, true);
  await one.withdrawCancellation(1);
  assert.equal((await two.getCancellation()).withdrawal_requested, false);
  assert.equal((await one.getAgreement()).status, 'AGREEMENT_PREPARATION');
});
test('terms edits calculate exact decimal amounts and invalidate both current deed confirmations', async () => {
  const service = createTransactionService();
  const next = await service.updateTerms({ price_per_acre: '4500000.02', advance: '1000000.01', payment_mode: 'Bank Transfer' }, 1);
  assert.equal(next.terms.total, '11250000.05');
  assert.equal(next.terms.remaining, '10250000.04');
  assert.equal(next.draft.version, 2);
  assert.equal(next.confirmations.buyer.confirmed, false);
  assert.equal(next.confirmations.seller.confirmed, false);
  assert.equal(next.confirmations.seller.draft_version, null);
  await assert.rejects(service.submitRegistration(2, 2), { code: 'CONFIRMATIONS_REQUIRED' });
});
test('invalid terms never mutate transaction or deed version', async () => {
  const service = createTransactionService();
  const valid = { price_per_acre: '4500000.00', advance: '1000000.00', payment_mode: 'Bank Transfer' };
  for (const patch of [{ price_per_acre: '0' }, { price_per_acre: '1e6' }, { price_per_acre: '-1' }, { price_per_acre: 2 }, { advance: '20000000' }, { advance: '1.001' }, { payment_mode: 'Unknown' }, { seller_confirmed: true }]) {
    await assert.rejects(service.updateTerms({ ...valid, ...patch }, 1), { code: 'VALIDATION_ERROR' });
  }
  assert.equal((await service.getAgreement()).version, 1);
});
test('buyer can confirm current deed only and cannot supply seller confirmation', async () => {
  const service = createTransactionService();
  await service.updateTerms({ price_per_acre: '4600000', advance: '0', payment_mode: 'Bank Transfer' }, 1);
  await assert.rejects(service.confirmDeed(2, 1), { code: 'DRAFT_CHANGED' });
  await assert.rejects(service.confirmDeed(1, 2), { code: 'VERSION_CONFLICT' });
  const next = await service.confirmDeed(2, 2);
  assert.equal(next.confirmations.buyer.confirmed, true);
  assert.equal(next.confirmations.seller.confirmed, false);
  await assert.rejects(service.submitRegistration(next.version, 2), { code: 'CONFIRMATIONS_REQUIRED' });
  await assert.rejects(service.confirmDeed(next.version, 2), { code: 'ALREADY_CONFIRMED' });
});
test('registration queues once and never implies registration completion or title transfer', async () => {
  const service = createTransactionService();
  await assert.rejects(service.submitRegistration(1, 2), { code: 'DRAFT_CHANGED' });
  const next = await service.submitRegistration(1, 1);
  assert.equal(next.status, 'REGISTRATION_PENDING');
  assert.equal(next.registration_status, 'SUBMITTED');
  await assert.rejects(service.submitRegistration(next.version, 1), { code: 'INVALID_TRANSITION' });
  await assert.rejects(service.updateTerms({ price_per_acre: '1', advance: '0', payment_mode: 'Bank Transfer' }, next.version), { code: 'INVALID_TRANSITION' });
});
test('withdrawal is a pending request, never a resolved case or resumed transaction', async () => {
  const service = createTransactionService();
  const next = await service.withdrawCancellation(1);
  assert.equal(next.status, 'WITHDRAWAL_REQUESTED');
  assert.equal(next.withdrawal_requested, true);
  await assert.rejects(service.withdrawCancellation(2), { code: 'INVALID_TRANSITION' });
  assert.equal((await service.getAgreement()).version, 1);
});
test('messages validate length, trim whitespace, escape through React and remain local', async () => {
  const service = createTransactionService();
  for (const text of ['', '   ', 'x'.repeat(2001), null]) await assert.rejects(service.sendMessage(text, 1), { code: 'VALIDATION_ERROR' });
  const next = await service.sendMessage('  <script>synthetic</script>  ', 1);
  assert.equal(next.messages[0].text, '<script>synthetic</script>');
  await assert.rejects(service.sendMessage('stale', 1), { code: 'VERSION_CONFLICT' });
  assert.equal((await createTransactionService().getCancellation()).messages.length, 0);
});
test('evidence validation checks MIME/extension/nonempty/size/path and the whole batch before mutation', async () => {
  assert.equal(validateEvidenceFiles([file(), file('photo.jpg', 'image/jpeg'), file('map.png', 'image/png')]), '');
  const badBatches = [[], [file('bad.exe')], [file('empty.pdf', 'application/pdf', '')], [file('map.png', 'application/pdf')], [file('../bad.pdf')], [file('large.pdf', 'application/pdf', new Uint8Array(10 * 1024 * 1024 + 1))], Array(11).fill(file())];
  for (const batch of badBatches) {
    assert.ok(validateEvidenceFiles(batch));
    const service = createTransactionService();
    await assert.rejects(service.uploadEvidence([file(), ...batch, ...(batch.length ? [] : [file('wrong.exe')])], 1), { code: 'FILE_REJECTED' });
    assert.equal((await service.getCancellation()).evidence.length, 3);
  }
});
test('local evidence saves metadata only and never approves evidence or decides the case', async () => {
  const service = createTransactionService();
  const next = await service.uploadEvidence([file()], 1);
  assert.equal(next.evidence.length, 4);
  assert.equal(next.status, 'UNDER_REVIEW');
  assert.equal(Object.hasOwn(next.evidence[3], 'file'), false);
  const evidence = await service.getEvidence(next.evidence[3].id);
  assert.match(evidence.text, /No real document contents/);
  await assert.rejects(service.getEvidence('missing'), { code: 'NOT_FOUND' });
});
test('draft download is a valid PDF structure with current terms and correct xref offsets', async () => {
  const service = createTransactionService();
  await service.updateTerms({ price_per_acre: '5000000', advance: '0', payment_mode: 'Bank Transfer' }, 1);
  const blob = await service.downloadDraft();
  assert.equal(blob.type, 'application/pdf');
  const text = await blob.text();
  assert.match(text, /^%PDF-1\.4/);
  assert.match(text, /SYNTHETIC DEMONSTRATION ONLY/);
  assert.match(text, /12500000\.00/);
  assert.match(text, /Draft version 2/);
  const offset = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.equal(text.slice(offset, offset + 4), 'xref');
  for (const match of text.matchAll(/(\d{10}) 00000 n/g)) assert.match(text.slice(Number(match[1])), /^\d+ 0 obj/);
});
test('real API contract has registration/current-draft commands but no withdrawal or message command', async () => {
  const contract = JSON.parse(await readFile(new URL('../../contracts/openapi.json', import.meta.url), 'utf8'));
  assert.ok(contract.paths['/api/v1/transactions/{id}/registration-submit'].post);
  assert.ok(contract.paths['/api/v1/transactions/{id}/deed-confirmations'].post);
  assert.equal(Object.keys(contract.paths).some(path => /cancellations.*withdraw|transactions.*messages/.test(path)), false);
});