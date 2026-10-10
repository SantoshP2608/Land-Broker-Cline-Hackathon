import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createSellerService, sellerMode } from '../src/features/seller/seller-service.mjs';

const ID = '11111111-1111-4111-8111-111111111111';
const INV = '22222222-2222-4222-8222-222222222222';
const BUYER = '33333333-3333-4333-8333-333333333333';
const DOC = '44444444-4444-4444-8444-444444444444';
const FINDING = '55555555-5555-4555-8555-555555555555';
const TX = '66666666-6666-4666-8666-666666666666';
const META = { request_id: 'req_test', contract_version: '0.1' };
const session = { user: { id: ID, display_name: 'Seller', roles: ['CITIZEN'], identity_status: 'CONFIRMED', identity_mode: 'SIMULATED' }, csrf_token: 'real-session-csrf' };
const listing = (changes = {}) => ({
  id: ID, version: 7, status: 'CHANGES_REQUIRED', availability: 'UNCONFIRMED',
  title: 'Synthetic Karnataka parcel', description: 'Whole parcel listing',
  area_sqm: '202.34', land_type: 'DEMO_LAND', asking_price_inr: '4800000.00',
  location: { state_code: 'KA', district_code: 'D1', subdistrict_code: 'S1', village_code: 'V1', survey_number: '128', subdivision_number: '2' },
  photo_urls: [], review_summary: { reviewed_at: '2026-03-20T10:30:00Z', scope: 'Synthetic review only', integration_mode: 'SIMULATED' },
  allowed_actions: ['EDIT_LISTING', 'UPLOAD_DOCUMENT', 'SUBMIT_REVIEW'],
  seller_id: ID, parcel: { id: BUYER, version: 12, status: 'OPEN', active_transaction_id: null, official_check: null },
  document_ids: [DOC], finding_ids: [FINDING], blocked_reason: null, ...changes,
});
const invitation = (changes = {}) => ({ id: INV, version: 3, listing_id: ID, buyer_id: BUYER, status: 'PENDING', created_at: '2026-03-20T08:00:00Z', allowed_actions: ['ACCEPT_INVITATION', 'DECLINE_INVITATION'], ...changes });
const evidence = { document_id: DOC, document_version: 2, page_number: 1, field_name: 'area_sqm', value: '202.34', source_date: '2026-03-19', confidence: '0.98' };
const finding = { id: FINDING, rule_code: 'SOURCE_AREA_SQM', status: 'DISCREPANCY', summary: 'Area differs from source.', left_evidence: evidence, right_evidence: null, reviewer_disposition: null };
const document = { id: DOC, owner_kind: 'LISTING', owner_id: ID, document_type: 'LAND_RECORD', version: 2, filename: 'record.pdf', sha256: 'a'.repeat(64), uploaded_at: '2026-03-20T10:00:00Z', authenticity: { status: 'UNKNOWN', source: 'Synthetic', checked_at: null }, sharing_scope: 'OWNER_AND_OFFICERS' };
const file = (name = 'correction.pdf', content = '%PDF-1.4 synthetic test') => new File([content], name, { type: 'application/pdf' });
const page = (items, next_cursor = null) => ({ items, next_cursor });
const ok = (data, status = 200) => ({ ok: true, status, async json() { return structuredClone({ data, meta: META }); } });
const errorResponse = (code, status = 409, extras = {}) => ({ ok: false, status, async json() { return { error: { code, message: `Server ${code}`, field_errors: {}, retryable: false, ...extras }, meta: META }; } });
function api(handler, baseUrl = 'https://example.test') {
  const calls = [];
  const service = createSellerService({ mode: 'api', baseUrl, fetchImpl: async (url, options) => {
    const call = { url, path: new URL(url, 'https://example.test').pathname.replace('/api/v1', ''), query: new URL(url, 'https://example.test').searchParams, ...options };
    calls.push(call);
    const result = await handler(call, calls);
    if (result !== undefined) return result;
    if (call.path === '/auth/session') return ok(session);
    if (call.path.endsWith('/findings')) return ok(page([finding]));
    if (call.path === `/seller/listings/${ID}`) return ok(listing());
    throw new Error(`Unexpected fetch ${call.method || 'GET'} ${call.path}`);
  } });
  return { service, calls };
}
const mutationCalls = (calls) => calls.filter((call) => call.method);

test('default mode is demo and modes must be explicit (never auto fallback)', async () => {
  assert.equal(sellerMode, 'demo');
  const demo = createSellerService({ fetchImpl() { throw new Error('Demo must not fetch'); } });
  assert.equal((await demo.getListing('LS-2041')).status, 'CHANGES_REQUIRED');
  assert.throws(() => createSellerService({ mode: 'automatic' }), { code: 'CONFIGURATION_ERROR' });
  assert.throws(() => createSellerService({ mode: 'api', fetchImpl: null }), { code: 'CONFIGURATION_ERROR' });
});

test('demo seeds required listing, area discrepancy, missing EC and screenshot requests', async () => {
  const service = createSellerService();
  const current = await service.getListing('LS-2041');
  assert.equal(current.title, 'Madhurawada Residential Plot');
  assert.equal(current.location, 'Madhurawada, Visakhapatnam');
  assert.equal(current.survey, '128/2');
  assert.equal(current.area_display, '240 sq yd');
  assert.equal(current.asking_price_inr, '4800000.00');
  assert.deepEqual(current.findings.map((row) => row.status), ['MATCHES_SOURCE', 'DISCREPANCY', 'EVIDENCE_MISSING']);
  assert.equal(current.findings[1].evidence[1].value, '235 sq yd');
  assert.ok(current.updated_at.startsWith('2026-10-10'));
  const requests = await service.listRequests();
  assert.equal(requests.length, 5);
  assert.deepEqual(requests.filter((row) => row.status === 'PENDING').map((row) => row.initials), ['KA', 'RM', 'PN']);
  assert.equal(requests.find((row) => row.buyer_name === 'Arjun Rao').listing_id, 'LS-2030');
  assert.equal(requests.filter((row) => row.status === 'DECLINED').length, 1);
  assert.equal(requests[0].survey, '76/3');
  assert.equal(requests[0].area_display, '300 sq yd');
  assert.deepEqual(new Set(requests.map((row) => row.image)), new Set(['/assets/seller/coastal-plot.webp', '/assets/seller/farm-plot.webp', '/assets/seller/residential-plot.webp']));
});

test('demo instances and returned snapshots are isolated', async () => {
  const one = createSellerService();
  const two = createSellerService();
  const current = await one.getListing('LS-2041');
  current.findings.length = 0;
  current.allowed_actions.push('PUBLISH_LISTING');
  await one.updateListing(current.id, { title: 'Updated synthetic plot', asking_price_inr: '5000000.00' }, current.version);
  assert.equal((await two.getListing(current.id)).title, 'Madhurawada Residential Plot');
  assert.equal((await one.getListing(current.id)).findings.length, 3);
  assert.equal((await one.getListing(current.id)).allowed_actions.includes('PUBLISH_LISTING'), false);
});

test('demo upload and submission never approve review or resolve findings automatically', async () => {
  const service = createSellerService();
  const current = await service.getListing('LS-2041');
  const uploaded = await service.uploadCorrections(current.id, [{ file: file(), document_type: 'ENCUMBRANCE_CERTIFICATE' }], current.version);
  assert.equal(uploaded.version, current.version + 1);
  assert.equal(uploaded.status, 'CHANGES_REQUIRED');
  assert.equal(uploaded.findings.find((finding) => finding.id === 'F-EC').status, 'EVIDENCE_MISSING');
  const submitted = await service.submitCorrections(current.id, uploaded.version);
  assert.equal(submitted.status, 'UNDER_REVIEW');
  assert.equal(submitted.publication_status, 'NOT_PUBLISHED');
  assert.deepEqual(submitted.allowed_actions, []);
  await assert.rejects(service.publishListing(current.id, submitted.version), { code: 'REVIEW_NOT_CURRENT' });
  await assert.rejects(service.submitCorrections(current.id, submitted.version), { code: 'INVALID_TRANSITION' });
  await assert.rejects(service.updateListing(current.id, { title: 'Changed title' }, submitted.version), { code: 'INVALID_TRANSITION' });
});

test('demo versions, missing resources, field validation and all-files-first validation', async () => {
  const service = createSellerService();
  const current = await service.getListing('LS-2041');
  await assert.rejects(service.updateListing(current.id, { title: 'New title' }, 1), { code: 'VERSION_CONFLICT' });
  await assert.rejects(service.getListing('missing'), { code: 'NOT_FOUND' });
  await assert.rejects(service.getEvidence(current.id, 'missing'), { code: 'NOT_FOUND' });
  for (const values of [{}, { survey: '100' }, { title: 'Hi' }, { asking_price_inr: 1 }, { asking_price_inr: '0' }, { asking_price_inr: '1.001' }, { asking_price_inr: '1e5' }, { asking_price_inr: '10000000000000000' }]) {
    await assert.rejects(service.updateListing(current.id, values, current.version), { code: 'VALIDATION_ERROR' });
  }
  await assert.rejects(service.uploadCorrections(current.id, [
    { file: file(), document_type: 'LAND_RECORD' }, { file: file(), document_type: 'IDENTITY' },
  ], current.version), { code: 'VALIDATION_ERROR' });
  assert.equal((await service.getListing(current.id)).version, current.version);
  for (const files of [[], [{ file: new File([], 'empty.pdf', { type: 'application/pdf' }), document_type: 'LAND_RECORD' }], [{ file: file(), document_type: 'LAND_PHOTO' }]]) {
    await assert.rejects(service.uploadCorrections(current.id, files, current.version));
  }
});

test('demo evidence snapshots are private and cannot mutate stored findings', async () => {
  const service = createSellerService();
  const evidence = await service.getEvidence('LS-2041', { id: 'F-AREA' });
  assert.equal(evidence.length, 2);
  assert.equal(evidence[0].value, '240 sq yd');
  assert.equal(evidence[0].download_url, undefined);
  evidence[0].value = 'tampered';
  assert.equal((await service.getEvidence('LS-2041', 'F-AREA'))[0].value, '240 sq yd');
  assert.deepEqual(await service.getEvidence('LS-2041', 'F-EC'), []);
});

test('demo acceptance requires confirmed stored identity, not caller tampering', async () => {
  const service = createSellerService();
  const request = (await service.listRequests()).find((row) => row.initials === 'PN');
  await assert.rejects(service.acceptRequest({ ...request, identity_status: 'CONFIRMED', allowed_actions: ['ACCEPT_INVITATION'] }), { code: 'IDENTITY_NOT_CONFIRMED' });
  const declined = await service.declineRequest(request);
  assert.equal(declined.status, 'DECLINED');
  await assert.rejects(service.declineRequest(request), { code: 'VERSION_CONFLICT' });
});

test('demo accepting one request locks same parcel but does not silently decline others', async () => {
  const service = createSellerService();
  const requests = await service.listRequests();
  const accepted = await service.acceptRequest(requests[0]);
  assert.equal(accepted.status, 'ACCEPTED');
  assert.ok(accepted.transaction_id);
  const other = (await service.listRequests()).find((row) => row.id === requests[1].id);
  assert.equal(other.status, 'PENDING');
  assert.equal(other.allowed_actions.includes('ACCEPT_INVITATION'), false);
  assert.ok(other.allowed_actions.includes('DECLINE_INVITATION'));
  await assert.rejects(service.acceptRequest(requests[1]), { code: 'INVALID_TRANSITION' });
  assert.equal((await service.declineRequest(other)).status, 'DECLINED');
  await assert.rejects(service.acceptRequest(accepted), { code: 'INVALID_TRANSITION' });
});

test('actual OpenAPI confirms session auth, strict invitation fields and parcel accept versions', async () => {
  const schema = JSON.parse(await readFile(new URL('../../contracts/openapi.json', import.meta.url), 'utf8'));
  assert.ok(schema.paths['/api/v1/auth/session']);
  assert.equal(schema.paths['/api/v1/auth/me'], undefined);
  assert.deepEqual(Object.keys(schema.components.schemas.InvitationDTO.properties), Object.keys(invitation()));
  assert.deepEqual(schema.components.schemas.Accept.required, ['expected_version', 'expected_invitation_version']);
  assert.ok(schema.components.schemas.PrivateListingDTO.properties.parcel);
  assert.equal(schema.components.schemas.PrivateListingDTO.properties.updated_at, undefined);
  assert.deepEqual(Object.keys(schema.components.schemas.FindingDTO.properties), Object.keys(finding));
});

test('normalizes actual listing and finding DTOs without invented dates or publication', async () => {
  const { service, calls } = api(() => undefined);
  const current = await service.getListing(ID);
  assert.equal(current.location, 'V1, S1, D1, KA');
  assert.equal(current.survey, '128/2');
  assert.equal(current.area_display, '202.34 sq m');
  assert.equal(current.updated_at, null);
  assert.equal(current.publication_status, 'NOT_PUBLISHED');
  assert.deepEqual(current.review_progress, [{ label: 'Current review', date: '2026-03-20T10:30:00Z', status: 'CURRENT' }]);
  assert.equal(current.findings[0].detail, finding.summary);
  assert.deepEqual(current.findings[0].evidence, [evidence]);
  assert.ok(calls.every((call) => call.credentials === 'include' && call.cache === 'no-store'));
});

test('listRequests collects all listing/invitation pages and never invents buyer confirmation', async () => {
  const SECOND = '77777777-7777-4777-8777-777777777777';
  const { service, calls } = api((call) => {
    if (call.path === '/seller/listings') return ok(call.query.has('cursor') ? page([listing({ id: SECOND })]) : page([listing()], ID));
    if (call.path === `/seller/listings/${ID}/invitations`) return ok(call.query.has('cursor') ? page([invitation({ id: 'next-invitation', status: 'DECLINED', allowed_actions: [] })]) : page([invitation()], INV));
    if (call.path === `/seller/listings/${SECOND}/invitations`) return ok(page([]));
  });
  const requests = await service.listRequests();
  assert.equal(requests.length, 2);
  assert.equal(requests[0].buyer_name, 'Buyer 33333333');
  assert.equal(requests[0].identity_status, 'UNKNOWN');
  assert.equal(requests[0].note, '');
  assert.equal(requests[0].transaction_id, null);
  assert.equal(requests[0].image, '/assets/seller/residential-plot.webp');
  assert.ok(requests[0].blocked_reason.includes('not confirmed'));
  assert.deepEqual(requests[0].allowed_actions, invitation().allowed_actions);
  await assert.rejects(service.acceptRequest(requests[0]), { code: 'IDENTITY_NOT_CONFIRMED' });
  assert.equal(mutationCalls(calls).length, 0);
  assert.ok(calls.some((call) => call.query.get('cursor') === ID));
  assert.ok(calls.some((call) => call.query.get('cursor') === INV));
});

test('repeated pagination cursor fails instead of looping', async () => {
  const { service } = api(() => ok(page([listing()], ID)));
  await assert.rejects(service.listRequests(), { code: 'INVALID_RESPONSE' });
});

test('API mutation uses real session CSRF, credentials, UUID idempotency and strict edit body', async () => {
  const { service, calls } = api((call) => call.method === 'PATCH' ? ok(listing({ title: 'New title', status: 'DRAFT', version: 8 })) : undefined, 'https://example.test/api/v1/');
  const updated = await service.updateListing(ID, { title: 'New title', asking_price_inr: '5000000.00' }, 7);
  const [mutation] = mutationCalls(calls);
  assert.equal(mutation.url, `https://example.test/api/v1/seller/listings/${ID}`);
  assert.deepEqual(JSON.parse(mutation.body), { expected_version: 7, title: 'New title', asking_price_inr: '5000000.00' });
  assert.equal(mutation.headers['X-CSRF-Token'], 'real-session-csrf');
  assert.equal(mutation.headers['Content-Type'], 'application/json');
  assert.match(mutation.headers['Idempotency-Key'], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(updated.status, 'DRAFT');
  assert.equal(updated.version, 8);
});

test('identical mutation keeps idempotency key after uncertain transport; different input gets different key', async () => {
  let attempts = 0;
  const { service, calls } = api((call) => {
    if (call.method === 'PATCH') {
      attempts += 1;
      if (attempts === 1) throw new TypeError('Lost response after commit');
      return ok(listing({ version: 8, status: 'DRAFT' }));
    }
  });
  await assert.rejects(service.updateListing(ID, { title: 'New title' }, 7), { code: 'TRANSPORT_ERROR', retryable: true, outcome_unknown: true });
  await service.updateListing(ID, { title: 'New title' }, 7);
  await service.updateListing(ID, { title: 'Other title' }, 7);
  const mutations = mutationCalls(calls);
  assert.equal(mutations[0].headers['Idempotency-Key'], mutations[1].headers['Idempotency-Key']);
  assert.notEqual(mutations[1].headers['Idempotency-Key'], mutations[2].headers['Idempotency-Key']);
  assert.equal(calls.filter((call) => call.path === '/auth/session').length, 1);
});

test('concurrent identical mutations share one transport call', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { service, calls } = api(async (call) => {
    if (call.method === 'PATCH') { await gate; return ok(listing({ version: 8 })); }
  });
  const first = service.updateListing(ID, { title: 'New title' }, 7);
  const second = service.updateListing(ID, { title: 'New title' }, 7);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(mutationCalls(calls).length, 1);
  release();
  assert.deepEqual(await first, await second);
});

test('server errors retain codes, field errors, retryability and request correlation without fallback', async () => {
  for (const [code, status] of [['VERSION_CONFLICT', 409], ['IDEMPOTENCY_CONFLICT', 409], ['IDENTITY_NOT_CONFIRMED', 409], ['FILE_REJECTED', 422], ['OFFICIAL_STATUS_UNKNOWN', 503]]) {
    const { service } = api((call) => call.method ? errorResponse(code, status, { retryable: status === 503, field_errors: { title: ['Server reason'] } }) : undefined);
    await assert.rejects(service.updateListing(ID, { title: 'New title' }, 7), (error) => {
      assert.equal(error.code, code); assert.equal(error.status, status);
      assert.deepEqual(error.field_errors, { title: ['Server reason'] });
      assert.equal(error.request_id, 'req_test'); assert.equal(error.retryable, status === 503);
      return true;
    });
  }
  const { service } = api(() => { throw new TypeError('Offline'); });
  await assert.rejects(service.getListing('LS-2041'), { code: 'TRANSPORT_ERROR' });
});

test('unreadable mutation response preserves key and unknown outcome on retry', async () => {
  let attempts = 0;
  const { service, calls } = api((call) => {
    if (call.method) {
      attempts += 1;
      return attempts === 1 ? { ok: true, status: 200, async json() { throw new SyntaxError('Truncated'); } } : ok(listing());
    }
  });
  await assert.rejects(service.updateListing(ID, { title: 'New title' }, 7), { code: 'INVALID_RESPONSE', outcome_unknown: true });
  await service.updateListing(ID, { title: 'New title' }, 7);
  assert.equal(mutationCalls(calls)[0].headers['Idempotency-Key'], mutationCalls(calls)[1].headers['Idempotency-Key']);
});

test('missing CSRF prevents write and rejected auth invalidates cached session', async () => {
  const missing = api((call) => call.path === '/auth/session' ? ok({ user: session.user }) : undefined);
  await assert.rejects(missing.service.updateListing(ID, { title: 'New title' }, 7), { code: 'AUTH_REQUIRED' });
  assert.equal(mutationCalls(missing.calls).length, 0);
  let writes = 0;
  const { service, calls } = api((call) => {
    if (call.method) return ++writes === 1 ? errorResponse('FORBIDDEN', 403) : ok(listing());
  });
  await assert.rejects(service.updateListing(ID, { title: 'New title' }, 7), { code: 'FORBIDDEN' });
  await service.updateListing(ID, { title: 'New title' }, 7);
  assert.equal(calls.filter((call) => call.path === '/auth/session').length, 2);
});

test('successful mutation is not reported as failed if ancillary finding refresh fails', async () => {
  const { service } = api((call) => {
    if (call.method === 'PATCH') return ok(listing({ version: 8, status: 'DRAFT' }));
    if (call.path.endsWith('/findings')) return errorResponse('DEPENDENCY_UNAVAILABLE', 503);
  });
  const updated = await service.updateListing(ID, { title: 'New title' }, 7);
  assert.equal(updated.version, 8);
  assert.equal(updated.refresh_error.code, 'DEPENDENCY_UNAVAILABLE');
});

test('submit uses submit-review endpoint and returns UNDER_REVIEW, never APPROVED', async () => {
  const { service, calls } = api((call) => call.path.endsWith('/submit-review') ? ok({ listing: listing({ status: 'UNDER_REVIEW', version: 8, allowed_actions: [] }), verification_job: { id: FINDING, status: 'QUEUED' } }, 202) : undefined);
  const result = await service.submitCorrections(ID, 7);
  assert.equal(result.status, 'UNDER_REVIEW');
  assert.equal(result.publication_status, 'NOT_PUBLISHED');
  assert.deepEqual(JSON.parse(mutationCalls(calls)[0].body), { expected_version: 7 });
});

test('publication trusts server approval and blocked errors, with no synthetic fallback', async () => {
  let allowed = false;
  const { service } = api((call) => call.path.endsWith('/publish') ? allowed ? ok(listing({ status: 'PUBLISHED', version: 8 })) : errorResponse('REVIEW_NOT_CURRENT') : undefined);
  await assert.rejects(service.publishListing(ID, 7), { code: 'REVIEW_NOT_CURRENT' });
  allowed = true;
  assert.equal((await service.publishListing(ID, 7)).publication_status, 'PUBLISHED');
});

test('submit/publish reject unconfirmed authenticated seller identity before mutation', async () => {
  const { service, calls } = api((call) => call.path === '/auth/session' ? ok({ ...session, user: { ...session.user, identity_status: 'PENDING' } }) : undefined);
  await assert.rejects(service.submitCorrections(ID, 7), { code: 'IDENTITY_NOT_CONFIRMED' });
  await assert.rejects(service.publishListing(ID, 7), { code: 'IDENTITY_NOT_CONFIRMED' });
  assert.equal(mutationCalls(calls).length, 0);
});

test('uploads await backend, chain owner versions, keep multipart private and refresh normalized listing', async () => {
  let uploadCount = 0;
  const { service, calls } = api((call) => {
    if (call.path === '/documents') return ok({ document: { ...document, id: `${DOC}-${++uploadCount}` }, owner: { id: ID, version: 7 + uploadCount } }, 201);
    if (call.path === `/seller/listings/${ID}`) return ok(listing({ version: 9 }));
  });
  const files = [{ file: file('record.pdf'), document_type: 'LAND_RECORD' }, { file: file('ec.pdf'), document_type: 'ENCUMBRANCE_CERTIFICATE' }];
  const result = await service.uploadCorrections(ID, files, 7);
  assert.equal(result.version, 9);
  assert.equal(result.uploaded_documents.length, 2);
  const mutations = mutationCalls(calls);
  assert.deepEqual(mutations.map((call) => call.body.get('expected_version')), ['7', '8']);
  for (const call of mutations) {
    assert.ok(call.body instanceof FormData);
    assert.equal(call.body.get('owner_kind'), 'LISTING');
    assert.equal(call.body.get('owner_id'), ID);
    assert.equal(call.body.get('sharing_scope'), 'OWNER_AND_OFFICERS');
    assert.equal(call.headers['Content-Type'], undefined);
    assert.equal(call.headers['X-CSRF-Token'], session.csrf_token);
    assert.equal(call.body.get('file').type, 'application/pdf');
    assert.deepEqual([...call.body.keys()].sort(), ['document_type', 'expected_version', 'file', 'owner_id', 'owner_kind', 'sharing_scope']);
  }
  assert.equal(calls.some((call) => call.path.includes('submit-review')), false);
});

test('upload does not resolve before backend acknowledgement', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { service, calls } = api(async (call) => {
    if (call.path === '/documents') { await gate; return ok({ document, owner: { id: ID, version: 8 } }, 201); }
  });
  let completed = false;
  const promise = service.uploadCorrections(ID, [{ file: file(), document_type: 'LAND_RECORD' }], 7).then((value) => { completed = true; return value; });
  while (!mutationCalls(calls).length) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(completed, false);
  release();
  await promise;
  assert.equal(completed, true);
});

test('partial upload exposes saved metadata/version, stops, and identical retry resumes safely', async () => {
  let count = 0;
  const { service, calls } = api((call) => {
    if (call.path === '/documents') {
      count += 1;
      if (count === 2) throw new TypeError('Uncertain second upload');
      return ok({ document: { ...document, id: `doc-${count}` }, owner: { id: ID, version: count === 1 ? 8 : count === 3 ? 9 : 10 } }, 201);
    }
    if (call.path === `/seller/listings/${ID}`) return ok(listing({ version: 10 }));
  });
  const descriptors = ['record.pdf', 'ec.pdf', 'support.pdf'].map((name) => ({ file: file(name), document_type: 'SUPPORTING_EVIDENCE' }));
  await assert.rejects(service.uploadCorrections(ID, descriptors, 7), (error) => {
    assert.equal(error.code, 'TRANSPORT_ERROR'); assert.equal(error.partial, true);
    assert.equal(error.current_version, 8); assert.equal(error.failed_index, 1);
    assert.equal(error.uploaded_documents.length, 1); return true;
  });
  assert.equal(mutationCalls(calls).length, 2);
  const result = await service.uploadCorrections(ID, descriptors, 7);
  assert.equal(result.uploaded_documents.length, 3);
  const mutations = mutationCalls(calls);
  assert.deepEqual(mutations.map((call) => call.body.get('expected_version')), ['7', '8', '8', '9']);
  assert.equal(mutations[1].headers['Idempotency-Key'], mutations[2].headers['Idempotency-Key']);
  assert.equal(mutations.filter((call) => call.body.get('file').name === 'record.pdf').length, 1);
});

test('upload validates entire batch before fetching and rejects generated/identity document types', async () => {
  const { service, calls } = api(() => undefined);
  for (const document_type of ['IDENTITY', 'DRAFT_DEED', 'REGISTERED_DEED', 'EC']) {
    await assert.rejects(service.uploadCorrections(ID, [{ file: file(), document_type: 'LAND_RECORD' }, { file: file(), document_type }], 7), { code: 'VALIDATION_ERROR' });
  }
  assert.equal(calls.length, 0);
});

test('evidence combines actual citations with private expiring download grants and checks version', async () => {
  let docVersion = 2;
  const { service, calls } = api((call) => {
    if (call.path === `/documents/${DOC}`) return ok({ ...document, version: docVersion });
    if (call.path === `/documents/${DOC}/download`) return ok({ download_url: 'https://example.test/api/v1/downloads/private-token', expires_at: '2026-03-20T10:02:00Z' });
  });
  const rows = await service.getEvidence(ID, { id: FINDING, evidence: [] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].document_id, DOC);
  assert.equal(rows[0].filename, 'record.pdf');
  assert.equal(rows[0].quote, 'area_sqm: 202.34');
  assert.equal(rows[0].download_url, 'https://example.test/api/v1/downloads/private-token');
  assert.ok(calls.every((call) => call.credentials === 'include'));
  docVersion = 3;
  await assert.rejects(service.getEvidence(ID, FINDING), { code: 'VERSION_CONFLICT' });
  await assert.rejects(service.getEvidence(ID, 'missing'), { code: 'NOT_FOUND' });
});

test('API accept requires explicit buyer identity and allowed action, then sends parcel/invitation versions', async () => {
  const { service, calls } = api((call) => {
    if (call.path.endsWith('/accept')) return ok({ transaction: { id: TX }, listing: listing({ parcel: { id: BUYER, version: 13, status: 'LOCKED', active_transaction_id: TX } }), invitation: invitation({ status: 'ACCEPTED', version: 4, allowed_actions: [] }) }, 201);
  });
  const request = { ...invitation(), identity_status: 'CONFIRMED' };
  await assert.rejects(service.acceptRequest({ ...request, identity_status: 'PENDING' }), { code: 'IDENTITY_NOT_CONFIRMED' });
  await assert.rejects(service.acceptRequest({ ...request, allowed_actions: [] }), { code: 'INVALID_TRANSITION' });
  assert.equal(calls.length, 0);
  const result = await service.acceptRequest(request);
  assert.equal(result.status, 'ACCEPTED');
  assert.equal(result.transaction_id, TX);
  assert.deepEqual(JSON.parse(mutationCalls(calls)[0].body), { expected_version: 12, expected_invitation_version: 3 });
  assert.notEqual(JSON.parse(mutationCalls(calls)[0].body).expected_version, 7);
});

test('evidence rejects unsafe schemes, foreign origins and non-private delivery routes', async () => {
  for (const download_url of ['javascript:alert(1)', 'data:text/plain,private', 'https://foreign.test/api/v1/downloads/token', 'https://user:secret@example.test/api/v1/downloads/token', 'https://example.test/public/record.pdf', null]) {
    const { service } = api((call) => {
      if (call.path === `/documents/${DOC}`) return ok(document);
      if (call.path === `/documents/${DOC}/download`) return ok({ download_url, expires_at: '2026-03-20T10:02:00Z' });
    });
    await assert.rejects(service.getEvidence(ID, FINDING), { code: 'INVALID_RESPONSE' });
  }
});

test('accept retry retains original parcel version and UUID after lost response and refresh', async () => {
  let attempts = 0;
  const { service, calls } = api((call) => {
    if (call.path.endsWith('/accept')) {
      if (++attempts === 1) throw new TypeError('Response lost');
      return ok({ transaction: { id: TX }, listing: listing({ parcel: { id: BUYER, version: 13, active_transaction_id: TX } }), invitation: invitation({ status: 'ACCEPTED', version: 4, allowed_actions: [] }) }, 201);
    }
    if (call.path === `/seller/listings/${ID}`) return ok(listing({ parcel: { id: BUYER, version: attempts ? 13 : 12, active_transaction_id: attempts ? TX : null } }));
  });
  const request = { ...invitation(), identity_status: 'CONFIRMED' };
  await assert.rejects(service.acceptRequest(request), { code: 'TRANSPORT_ERROR' });
  await service.getListing(ID);
  await service.acceptRequest(request);
  const mutations = mutationCalls(calls);
  assert.equal(mutations[0].body, mutations[1].body);
  assert.equal(mutations[0].headers['Idempotency-Key'], mutations[1].headers['Idempotency-Key']);
  assert.equal(JSON.parse(mutations[1].body).expected_version, 12);
});

test('API decline needs action/version, not confirmed buyer identity', async () => {
  const { service, calls } = api((call) => call.path.endsWith('/decline') ? ok(invitation({ status: 'DECLINED', version: 4, allowed_actions: [] })) : undefined);
  const result = await service.declineRequest({ ...invitation(), identity_status: 'UNKNOWN' });
  assert.equal(result.status, 'DECLINED');
  assert.deepEqual(JSON.parse(mutationCalls(calls)[0].body), { expected_version: 3 });
  assert.equal(result.identity_status, 'UNKNOWN');
  await assert.rejects(service.declineRequest(result), { code: 'INVALID_TRANSITION' });
});