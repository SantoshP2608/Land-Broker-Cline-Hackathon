import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Install the output fence BEFORE any SDK import. Arbitrary SDK diagnostics,
// warnings and provider exceptions must never become protocol output or logs.
const stdout = process.stdout.write.bind(process.stdout);
const discard = (...args) => {
  const callback = args.at(-1);
  if (typeof callback === 'function') queueMicrotask(callback);
  return true;
};
process.stdout.write = discard;
process.stderr.write = discard;
for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir']) console[method] = () => {};

const SDK_VERSION = '0.0.92';
const SAFE_CODES = new Set(['SDK_NOT_CONFIGURED', 'SDK_TIMEOUT', 'SDK_INVALID_OUTPUT', 'SDK_RUN_FAILED']);
let ownedDirectory;
let finished = false;
let hardTimeout;

async function finish(value, exitCode = 0) {
  if (finished) return;
  finished = true;
  clearTimeout(hardTimeout);
  // The parent also kills the whole subprocess on a deadline. This fallback
  // covers persistent SDK handles or a stalled output/cleanup operation.
  setTimeout(() => process.exit(exitCode), 1200);
  if (ownedDirectory) await rm(ownedDirectory, { recursive: true, force: true }).catch(() => {});
  stdout(`${JSON.stringify(value)}\n`, () => process.exit(exitCode));
}

function fail(code) {
  return finish({ error: { code: SAFE_CODES.has(code) ? code : 'SDK_RUN_FAILED' } }, 1);
}

process.on('uncaughtException', () => { void fail('SDK_RUN_FAILED'); });
process.on('unhandledRejection', () => { void fail('SDK_RUN_FAILED'); });
process.on('SIGTERM', () => { void fail('SDK_TIMEOUT'); });
process.on('SIGINT', () => { void fail('SDK_TIMEOUT'); });

function contained(root, candidate) {
  if (!candidate || !isAbsolute(candidate)) return false;
  const remainder = relative(resolve(root), resolve(candidate));
  return remainder !== '' && !remainder.startsWith('..') && !isAbsolute(remainder);
}

async function isolateEnvironment() {
  const current = { ...process.env };
  const workspace = current.CLINE_WORKSPACE;
  const root = workspace && isAbsolute(workspace) ? dirname(workspace) : undefined;
  const paths = ['CLINE_WORKSPACE', 'HOME', 'USERPROFILE', 'CLINE_DIR', 'CLINE_DATA_DIR'];
  const supplied = root && contained(tmpdir(), root)
    && paths.every(name => contained(root, current[name]))
    && resolve(current.HOME) === resolve(current.USERPROFILE)
    && contained(current.CLINE_DIR, current.CLINE_DATA_DIR);
  const isolationRoot = supplied ? root : await mkdtemp(join(tmpdir(), 'land-cline-node-'));
  if (!supplied) ownedDirectory = isolationRoot;
  const allowed = new Set([
    'PATH', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP',
    'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
    'CLINE_PROVIDER_ID', 'CLINE_MODEL_ID', 'CLINE_API_KEY', 'CLINE_BASE_URL', 'CLINE_TIMEOUT_SECONDS',
  ]);
  for (const name of Object.keys(process.env)) {
    if (!allowed.has(name.toUpperCase())) delete process.env[name];
  }
  const home = supplied ? current.HOME : join(isolationRoot, 'home');
  const cline = supplied ? current.CLINE_DIR : join(isolationRoot, 'cline');
  const data = supplied ? current.CLINE_DATA_DIR : join(cline, 'data');
  const cwd = supplied ? workspace : join(isolationRoot, 'workspace');
  Object.assign(process.env, {
    HOME: home, USERPROFILE: home, APPDATA: join(isolationRoot, 'appdata'),
    LOCALAPPDATA: join(isolationRoot, 'localappdata'),
    CLINE_DIR: cline, CLINE_DATA_DIR: data, CLINE_WORKSPACE: cwd,
    CLINE_SESSION_DATA_DIR: join(data, 'sessions'), CLINE_TEAM_DATA_DIR: join(data, 'teams'),
    CLINE_DB_DATA_DIR: join(data, 'db'), CLINE_CONNECTOR_DATA_DIR: join(data, 'connectors'),
    CLINE_CONNECTORS_DB_PATH: join(data, 'db', 'connectors.db'),
    CLINE_CRON_DB_PATH: join(data, 'db', 'cron.db'), CLINE_TASKS_DB_PATH: join(data, 'db', 'tasks.db'),
    CLINE_CONNECTOR_SETTINGS_PATH: join(data, 'connectors', 'settings.json'),
    OTEL_SDK_DISABLED: 'true', DO_NOT_TRACK: '1', NO_COLOR: '1',
  });
  await Promise.all([home, cline, data, cwd, process.env.APPDATA, process.env.LOCALAPPDATA]
    .map(path => mkdir(path, { recursive: true, mode: 0o700 })));
  process.chdir(cwd);
  return cwd;
}

async function readInput(maximumBytes) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > maximumBytes) throw { code: 'SDK_INVALID_OUTPUT' };
    chunks.push(chunk);
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } catch { throw { code: 'SDK_INVALID_OUTPUT' }; }
}

async function main() {
  const seconds = Number(process.env.CLINE_TIMEOUT_SECONDS ?? 60);
  const boundedSeconds = Number.isInteger(seconds) && seconds >= 1 && seconds <= 120 ? seconds : 60;
  hardTimeout = setTimeout(() => { void fail('SDK_TIMEOUT'); }, boundedSeconds * 1000 + 1500);
  const cwd = await isolateEnvironment();
  // Dynamic import is essential: shared SDK storage captures HOME at import time.
  const sdk = await import('@cline/sdk');
  const sdkPackagePath = join(dirname(dirname(fileURLToPath(import.meta.resolve('@cline/sdk')))), 'package.json');
  const manifest = JSON.parse(await readFile(sdkPackagePath, 'utf8'));
  if (manifest.version !== SDK_VERSION || typeof sdk.ClineCore?.create !== 'function'
    || Number(process.versions.node.split('.')[0]) !== 24) return fail('SDK_RUN_FAILED');
  const extractor = await import('./extractor.mjs');
  if (!extractor.sdkSupportsSelectedProviders()) return fail('SDK_RUN_FAILED');
  const configuration = extractor.settingsFromEnv();
  const arguments_ = process.argv.slice(2);
  if (arguments_.length === 1 && arguments_[0] === '--check') {
    return finish({
      sdk_version: SDK_VERSION, ready: configuration.ready,
      missing: configuration.missing, node_version: process.versions.node,
    });
  }
  if (arguments_.length !== 0) return fail('SDK_RUN_FAILED');
  if (!configuration.ready) return fail('SDK_NOT_CONFIGURED');
  const input = await readInput(extractor.MAX_INPUT_BYTES);
  const response = await extractor.runExtraction(input, { settings: { ...configuration.settings, cwd } });
  return finish(response);
}

await main().catch(error => fail(error?.code));