import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

// SDK storage resolves HOME at import time. Tests never import against personal state.
const root = await mkdtemp(join(tmpdir(), 'land-cline-tests-'));
Object.assign(process.env, {
  HOME: join(root, 'home'), USERPROFILE: join(root, 'home'),
  CLINE_DIR: join(root, 'cline'), CLINE_DATA_DIR: join(root, 'cline', 'data'),
  OTEL_SDK_DISABLED: 'true', DO_NOT_TRACK: '1',
});
for (const key of Object.keys(process.env)) {
  if (/^(CLINE_(SESSION|TEAM|DB|CONNECTOR|CRON|TASK)|ANTHROPIC_|OPENAI_|OPENROUTER_|OLLAMA_)/.test(key)) {
    delete process.env[key];
  }
}
await mkdir(join(root, 'workspace'), { recursive: true });
after(async () => { await rm(root, { recursive: true, force: true, maxRetries: 3 }); });
const {
  ExtractionError, SDK_VERSION, SYSTEM_PROMPT, denyBuiltinToolPolicies,
  normalizeArea, parseExtraction, runExtraction, settingsFromEnv, validateInput,
} = await import('../src/extractor.mjs');

const runner = fileURLToPath(new URL('../src/runner.mjs', import.meta.url));
const request = () => ({
  protocol_version: 1,
  document: {
    id: '4d85e62a-82dc-4d84-9cb6-001db8f8a112', version: 1,
    sha256: 'a'.repeat(64), document_type: 'LAND_RECORD',
  },
  pages: [{ page_number: 1, text: 'Survey Number: 007/A\nArea (sqm): 123.455\nOwner subject reference: SUBJECT-7' }],
});
const field = (overrides = {}) => ({
  field_name: 'survey_number', raw_text: '007/A', normalized_value: '007/A',
  page_number: 1, confidence: '0.95', uncertainty_notes: [], ...overrides,
});
const extraction = () => ({
  fields: [field(), field({
    field_name: 'area_sqm', raw_text: '123.455', normalized_value: '123.46',
  }), field({ field_name: 'owner_subject_ref', raw_text: 'SUBJECT-7', normalized_value: 'SUBJECT-7' })],
  warnings: [],
});
const configured = (overrides = {}) => ({
  providerId: 'openai', modelId: 'test-model', apiKey: 'mock-key-not-a-real-credential',
  timeoutMs: 5000, cwd: join(root, 'workspace'), ...overrides,
});
function invalid(operation, code = 'SDK_INVALID_OUTPUT') {
  assert.throws(operation, error => error instanceof ExtractionError && error.code === code && error.message === code);
}

function childEnvironment(extra = {}) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (['PATH', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP'].includes(key.toUpperCase())) env[key] = value;
  }
  return { ...env, ...extra };
}

async function invoke(input, env = {}, args = []) {
  const child = spawn(process.execPath, [runner, ...args], {
    cwd: root, env: childEnvironment(env), stdio: ['pipe', 'pipe', 'pipe'],
  });
  let output = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { stderr += data; });
  const timer = setTimeout(() => child.kill(), 15000);
  const closing = once(child, 'close');
  child.stdin.on('error', () => {});
  child.stdin.end(input === undefined ? '' : typeof input === 'string' ? input : JSON.stringify(input));
  const [code] = await closing;
  clearTimeout(timer);
  assert.equal(stderr, '', 'runner must suppress all SDK/provider stderr, including SQLite warnings');
  assert.equal(output.trim().split('\n').length, 1, 'exactly one stdout JSON line');
  return { code, output, value: JSON.parse(output) };
}

async function gateway(t, responder) {
  const requests = [];
  const server = createServer(async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    let body;
    try { body = JSON.parse(text); } catch { body = undefined; }
    requests.push({ url: req.url, method: req.method, body });
    await responder(req, res, body);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, requests };
}

function respondModel(res, content) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const base = { id: 'chatcmpl-mock', object: 'chat.completion.chunk', created: 1, model: 'test-model' };
  res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } })}\n\n`);
  res.end('data: [DONE]\n\n');
}

test('strict input accepts the exact protocol; all eight document types', () => {
  for (const document_type of ['IDENTITY', 'PREVIOUS_DEED', 'LAND_RECORD', 'ENCUMBRANCE_CERTIFICATE', 'SUPPORTING_EVIDENCE', 'LAND_PHOTO', 'DRAFT_DEED', 'REGISTERED_DEED']) {
    const input = request(); input.document.document_type = document_type;
    assert.equal(validateInput(input), input);
  }
});

test('input rejects extra keys, malformed document metadata, pages and limits', () => {
  const mutations = [
    input => { input.status = 'VERIFIED'; }, input => { input.protocol_version = 2; },
    input => { input.document.id = 'not-a-uuid'; }, input => { input.document.version = 0; },
    input => { input.document.version = 1.5; }, input => { input.document.sha256 = 'a'; },
    input => { input.document.document_type = 'NEW_ENUM'; }, input => { input.document.action = 'approve'; },
    input => { input.pages = []; }, input => { input.pages[0].page_number = 2; },
    input => { input.pages[0].text = null; }, input => { input.pages[0].instructions = 'execute'; },
    input => { input.pages[0].text = 'x'.repeat(200001); },
    input => { input.pages = Array.from({ length: 101 }, (_, i) => ({ page_number: i + 1, text: '' })); },
  ];
  for (const mutate of mutations) { const input = request(); mutate(input); invalid(() => validateInput(input)); }
  const unicode = request(); unicode.pages[0].text = '😀'.repeat(200000);
  assert.equal(validateInput(unicode), unicode);
});

test('accepts plain JSON and a single JSON/plain fence, omits missing fields', () => {
  for (const text of [JSON.stringify(extraction()), `\`\`\`json\n${JSON.stringify(extraction())}\n\`\`\``, `\`\`\`\n${JSON.stringify(extraction())}\n\`\`\``]) {
    assert.deepEqual(parseExtraction(text, request()), extraction());
  }
  assert.deepEqual(parseExtraction('{"fields":[],"warnings":[]}', request()), { fields: [], warnings: [] });
});

test('rejects prose, decisions/actions, fabricated quotes/refs/pages, duplicates and normalization changes', () => {
  const mutations = [
    value => { value.status = 'VERIFIED'; }, value => { value.action = 'approve'; },
    value => { value.fields[0].status = 'MATCH'; }, value => { value.fields[0].field_name = 'owner_name'; },
    value => { value.fields[0].raw_text = 'fabricated'; }, value => { value.fields[0].raw_text = ' '; },
    value => { value.fields[0].page_number = 2; }, value => { value.fields[0].page_number = '1'; },
    value => { value.fields[0].normalized_value = '7/A'; }, value => { value.fields[1].normalized_value = '123.45'; },
    value => { value.fields[0].confidence = 0.95; }, value => { value.fields[0].confidence = '1.01'; },
    value => { value.fields[0].confidence = '1e-1'; }, value => { value.fields[0].confidence = '-0.1'; },
    value => { value.fields[0].uncertainty_notes = [9]; },
    value => { value.fields.push(value.fields[0]); },
    value => { value.fields[2].normalized_value = 'invented-person-ref'; },
  ];
  for (const mutate of mutations) { const value = extraction(); mutate(value); invalid(() => parseExtraction(JSON.stringify(value), request())); }
  for (const text of ['Here is JSON: {"fields":[],"warnings":[]}', '```json\n{"fields":[],"warnings":[]}\n```\nDone', '[]', '{}', 'null']) {
    invalid(() => parseExtraction(text, request()));
  }
});

test('bounded fields, warnings, notes, strings and confidence', () => {
  for (const mutate of [
    value => { value.fields = Array.from({ length: 31 }, () => field()); },
    value => { value.warnings = Array(21).fill('warning'); },
    value => { value.warnings = ['x'.repeat(501)]; },
    value => { value.fields[0].uncertainty_notes = Array(11).fill('note'); },
    value => { value.fields[0].uncertainty_notes = ['x'.repeat(501)]; },
    value => { value.fields[0].normalized_value = 'x'.repeat(2001); },
    value => { value.fields[0].confidence = '0.123456789'; },
  ]) { const value = extraction(); mutate(value); invalid(() => parseExtraction(JSON.stringify(value), request())); }
  for (const confidence of ['0', '0.0', '1', '1.000', '0.12345678']) {
    const value = { fields: [field({ confidence })], warnings: [] };
    assert.equal(parseExtraction(JSON.stringify(value), request()).fields[0].confidence, confidence);
  }
});

test('preserves contradictory and repeated values across pages', () => {
  const input = request(); input.pages.push({ page_number: 2, text: 'Survey: 008/B; another 007/A' });
  const value = { fields: [field(), field({ raw_text: '008/B', normalized_value: '008/B', page_number: 2 }), field({ page_number: 2 })], warnings: ['Contradictory survey numbers.'] };
  assert.deepEqual(parseExtraction(JSON.stringify(value), input), value);
});

test('area normalization uses exact ROUND_HALF_UP and strict positive decimal bounds', () => {
  for (const [input, expected] of [['123.455', '123.46'], ['0.005', '0.01'], ['0.004', '0.00'], ['9999999999999999.984', '9999999999999999.98'], ['1', '1.00']]) assert.equal(normalizeArea(input), expected);
  for (const value of ['0', '-1', '01', '1e3', '1,000', '1 acre', 'NaN', '10000000000000000', '9999999999999999.995']) invalid(() => normalizeArea(value));
});

test('configuration has no guessed provider/model or credential fallback', () => {
  assert.equal(settingsFromEnv({}).ready, false);
  for (const provider of ['anthropic', 'openai', 'openrouter']) {
    assert.deepEqual(settingsFromEnv({ CLINE_PROVIDER_ID: provider, CLINE_MODEL_ID: 'chosen-model' }).missing, ['CLINE_API_KEY']);
  }
  assert.equal(settingsFromEnv({ CLINE_PROVIDER_ID: 'ollama', CLINE_MODEL_ID: 'chosen-model' }).ready, true);
  for (const env of [{ CLINE_PROVIDER_ID: 'cline' }, { CLINE_MODEL_ID: '' }, { CLINE_TIMEOUT_SECONDS: '121' }, { CLINE_TIMEOUT_SECONDS: '1.5' }, { CLINE_BASE_URL: 'https://user:secret@host' }, { CLINE_BASE_URL: 'file:///secret' }]) {
    assert.equal(settingsFromEnv({ CLINE_PROVIDER_ID: 'ollama', CLINE_MODEL_ID: 'chosen-model', ...env }).ready, false);
  }
});

test('SDK policy fences use actual builtin catalog and documented enabled=false policy', () => {
  const policies = denyBuiltinToolPolicies();
  assert.ok(Object.keys(policies).length > 10);
  assert.deepEqual(policies['*'], { enabled: false, autoApprove: false });
  for (const policy of Object.values(policies)) assert.deepEqual(policy, policies['*']);
  assert.match(SYSTEM_PROMPT, /untrusted data/);
  assert.match(SYSTEM_PROMPT, /contradictory/);
});

test('SDK orchestration: actual ClineCore create/start with mocked model HTTP gateway (NOT live model)', { timeout: 15000 }, async t => {
  const mock = await gateway(t, async (req, res) => respondModel(res, JSON.stringify(extraction())));
  const fetches = [];
  const response = await runExtraction(request(), { settings: configured({
    baseUrl: mock.baseUrl,
    fetch: async (url, options) => {
      const address = String(url);
      assert.ok(address.startsWith(mock.baseUrl), 'no external model/catalog/auth traffic');
      fetches.push(address);
      return fetch(url, options);
    },
  }) });
  assert.deepEqual(response, { protocol_version: 1, sdk_version: SDK_VERSION, provider_id: 'openai', model_id: 'test-model', extraction: extraction() });
  assert.equal(fetches.length, 1);
  assert.equal(mock.requests.length, 1);
  const sent = mock.requests[0];
  assert.equal(sent.url, '/v1/chat/completions');
  assert.equal(sent.body.model, 'test-model');
  assert.equal(sent.body.max_tokens ?? sent.body.max_completion_tokens, 4096);
  assert.ok(!sent.body.tools || sent.body.tools.length === 0);
  const text = JSON.stringify(sent.body);
  assert.ok(!text.includes(request().document.id));
  assert.ok(!text.includes(request().document.sha256));
  assert.ok(!text.includes('LAND_RECORD'));
  assert.ok(text.includes('Survey Number: 007/A'));
  assert.ok(text.includes('untrusted data'));
});

test('SDK orchestration: runner subprocess with local mocked model and Python-supplied isolation', { timeout: 15000 }, async t => {
  const mock = await gateway(t, async (req, res) => respondModel(res, JSON.stringify(extraction())));
  const isolated = await mkdtemp(join(tmpdir(), 'land-cline-python-test-'));
  t.after(() => rm(isolated, { recursive: true, force: true }));
  const env = {
    CLINE_PROVIDER_ID: 'openai', CLINE_MODEL_ID: 'test-model', CLINE_API_KEY: 'mock-key-not-a-real-credential',
    CLINE_BASE_URL: mock.baseUrl, CLINE_TIMEOUT_SECONDS: '5', CLINE_WORKSPACE: join(isolated, 'workspace'),
    HOME: join(isolated, 'home'), USERPROFILE: join(isolated, 'home'),
    CLINE_DIR: join(isolated, 'cline'), CLINE_DATA_DIR: join(isolated, 'cline', 'data'),
    // Hostile inherited storage and auth paths must be discarded before import.
    CLINE_DB_DATA_DIR: join(isolated, 'do-not-use'), OPENAI_API_KEY: 'inherited-secret-do-not-use',
  };
  const child = await invoke(request(), env);
  assert.equal(child.code, 0);
  assert.deepEqual(child.value.extraction, extraction());
  assert.ok(!child.output.includes(env.CLINE_API_KEY));
  assert.ok(!child.output.includes(mock.baseUrl));
  const database = await readFile(join(isolated, 'cline', 'data', 'db', 'sessions.db'));
  assert.ok(database.length > 0, 'actual SDK state is confined to supplied temporary data directory');
});

test('runner --check imports SDK but calls no model and reports only env names', { timeout: 15000 }, async () => {
  const result = await invoke(undefined, {}, ['--check']);
  assert.equal(result.code, 0);
  assert.deepEqual(result.value, { sdk_version: '0.0.92', ready: false, missing: ['CLINE_PROVIDER_ID', 'CLINE_MODEL_ID', 'CLINE_API_KEY'], node_version: process.versions.node });
  const ready = await invoke(undefined, { CLINE_PROVIDER_ID: 'ollama', CLINE_MODEL_ID: 'test-model' }, ['--check']);
  assert.equal(ready.value.ready, true);
  assert.deepEqual(ready.value.missing, []);
});

test('runner missing configuration and malformed stdin return safe errors nonzero', { timeout: 15000 }, async () => {
  const missing = await invoke(request());
  assert.equal(missing.code, 1);
  assert.deepEqual(missing.value, { error: { code: 'SDK_NOT_CONFIGURED' } });
  const bad = await invoke('{not-json', { CLINE_PROVIDER_ID: 'ollama', CLINE_MODEL_ID: 'test-model' });
  assert.equal(bad.code, 1);
  assert.deepEqual(bad.value, { error: { code: 'SDK_INVALID_OUTPUT' } });
});

test('SDK orchestration: mocked gateway malicious response rejected; never emits decision or secrets', { timeout: 15000 }, async t => {
  const mock = await gateway(t, async (req, res) => respondModel(res, '{"fields":[],"warnings":[],"status":"VERIFIED","action":"approve"}'));
  const result = await invoke(request(), { CLINE_PROVIDER_ID: 'openai', CLINE_MODEL_ID: 'test-model', CLINE_API_KEY: 'mock-key-not-a-real-credential', CLINE_BASE_URL: mock.baseUrl, CLINE_TIMEOUT_SECONDS: '5' });
  assert.equal(result.code, 1);
  assert.deepEqual(result.value, { error: { code: 'SDK_INVALID_OUTPUT' } });
});

test('SDK orchestration: mocked gateway stalls; runner aborts and returns SDK_TIMEOUT', { timeout: 15000 }, async t => {
  const mock = await gateway(t, async () => {});
  const result = await invoke(request(), { CLINE_PROVIDER_ID: 'openai', CLINE_MODEL_ID: 'test-model', CLINE_API_KEY: 'mock-key-not-a-real-credential', CLINE_BASE_URL: mock.baseUrl, CLINE_TIMEOUT_SECONDS: '1' });
  assert.equal(result.code, 1);
  assert.deepEqual(result.value, { error: { code: 'SDK_TIMEOUT' } });
  assert.equal(mock.requests.length, 1);
});

test('factory failure is sanitized and successful factory resources dispose in finally', async () => {
  await assert.rejects(runExtraction(request(), { settings: configured(), coreFactory: async () => { throw new Error('raw key and page contents'); } }), error => error.code === 'SDK_RUN_FAILED' && error.message === 'SDK_RUN_FAILED');
  let disposed = 0;
  await assert.rejects(runExtraction(request(), { settings: configured(), coreFactory: async options => {
    assert.equal(options.automation, false);
    return { start: async () => ({ result: { finishReason: 'error', text: 'raw details', toolCalls: [] } }), dispose: async () => { disposed += 1; } };
  } }), error => error.code === 'SDK_RUN_FAILED');
  assert.equal(disposed, 1);
});