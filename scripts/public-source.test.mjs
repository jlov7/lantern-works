import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { checkContent, checkLinks, collectSource, manifest, publicPackage, receiptPaths, safePath, selectedPaths, writeExport } from './public-source.mjs';

function sandbox(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'lantern-export-test-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('selects a sorted allowlist without research, Git history or study entries', () => {
  const paths = ['docs/' + 'private-report.md', 'src/ui/world/preview.tsx', 'progress.md', 'src/main.tsx', '.git/config', 'scripts/panel.ts', 'README.md', 'docs/public/play.md', 'src/main.tsx', 'evals/offers.jsonl', 'evals/private-results.json'];
  assert.deepEqual(selectedPaths(paths), ['README.md', 'docs/public/play.md', 'evals/offers.jsonl', 'src/main.tsx']);
  assert.ok(selectedPaths(['src/ui/portfolio/study.ts', 'src/ui/miniature/study-frames.ts']).length === 2);
});

test('rejects traversal, credentials paths, logs and control characters', () => {
  for (const path of ['../source.ts', '/source.ts', 'src/../secret', 'src//a.ts', 'src\\a.ts', 'src/\u0000a', 'src/.env.local', 'src/.git/config', 'src/run.log', 'public/archive.zip']) {
    assert.throws(() => safePath(path));
  }
});

test('refuses symlink files and symlink parent directories', (t) => {
  const dir = sandbox(t);
  mkdirSync(join(dir, 'real'));
  writeFileSync(join(dir, 'real/a.ts'), 'export const value = 1;');
  symlinkSync(join(dir, 'real'), join(dir, 'src'));
  assert.throws(() => collectSource(dir, ['src/a.ts']), /Symlink refused/);
  symlinkSync(join(dir, 'real/a.ts'), join(dir, 'README.md'));
  assert.throws(() => collectSource(dir, ['README.md']), /Symlink refused/);
});

test('rejects private paths, private report references and credential material without printing it', () => {
  const samples = [
    ['local absolute path', '/' + 'Users/person/file'],
    ['local absolute path', 'C:' + '\\Users\\person'],
    ['private report reference', 'docs/' + 'observations/example.json'],
    ['private key', '-----BEGIN ' + 'PRIVATE KEY-----'],
    ['credential', 'ghp_' + 'a'.repeat(32)],
    ['API credential', 'sk-ant-' + 'a'.repeat(40)],
  ];
  for (const [label, secret] of samples) {
    assert.throws(() => checkContent('README.md', Buffer.from(secret)), (error) => error.message.includes(label) && !error.message.includes(secret));
  }
});

test('allows only exact known invalid keys in the named tests', () => {
  const [path, keys] = Object.entries(manifest.invalidTestKeys)[0];
  checkContent(path, Buffer.from(keys[0]));
  assert.throws(() => checkContent('src/main.tsx', Buffer.from(keys[0])), /API credential/);
  assert.throws(() => checkContent(path, Buffer.from(`${keys[0]}extra`)), /API credential/);
});

test('public documentation permits its exact directory boundary without exempting private neighbours', () => {
  for (const reference of ['docs/public', 'docs/public/play.md', "'docs/public'", '(docs/public)']) {
    checkContent('README.md', Buffer.from(reference));
  }
  for (const suffix of ['private', 'private/report.md', 'public-private', 'public.json', 'publicity/report.md']) {
    assert.throws(() => checkContent('README.md', Buffer.from('docs/' + suffix)), /Public hygiene failed/);
  }
});

test('documentation URLs are distinct from private relative document references', () => {
  checkContent('README.md', Buffer.from('[Vite](https://vercel.com/docs/frameworks/frontend/vite)'));
  for (const prefix of ['', '../', '../../', './']) {
    assert.throws(() => checkContent('README.md', Buffer.from(`[Private](${prefix}docs/` + 'research/report.md)')), /private report reference/);
  }
});

test('exporter source and policy pass their own content hygiene checks', () => {
  for (const name of ['public-source.mjs', 'public-source.test.mjs', 'public-source-manifest.json']) {
    checkContent(`scripts/${name}`, readFileSync(new URL(name, import.meta.url)));
  }
});

test('public package scripts retain the verify command and omit private evaluations', () => {
  const scripts = Object.fromEntries(manifest.packageScripts.map((key) => [key, key === 'verify' ? 'pnpm typecheck && pnpm test' : key]));
  scripts['eval:ai'] = 'private evaluation';
  const pkg = JSON.parse(publicPackage(Buffer.from(JSON.stringify({ name: 'example', scripts }))));
  assert.equal(pkg.scripts.verify, scripts.verify);
  assert.equal(pkg.scripts['eval:ai'], undefined);
  assert.equal(pkg.scripts['public:check'], 'node scripts/public-source.mjs --check');
});

test('checks local documentation and image links against exported paths', () => {
  const entries = new Map([['README.md', Buffer.from('[Play](docs/public/play.md) ![Game](docs/public/game.svg)')], ['docs/public/play.md', Buffer.from('[Back](../../README.md#play)')], ['docs/public/game.svg', Buffer.from('<svg/>')]]);
  checkLinks(entries);
  entries.delete('docs/public/game.svg');
  assert.throws(() => checkLinks(entries), /Broken public document link/);
});

test('maps public agent instructions while preserving their documentation source', (t) => {
  const dir = sandbox(t);
  mkdirSync(join(dir, 'docs/public'), { recursive: true });
  writeFileSync(join(dir, 'docs/public/AGENTS.md'), 'Public instructions.\n');
  const entries = collectSource(dir, ['docs/public/AGENTS.md', 'AGENTS.md']);
  assert.equal(entries.get('AGENTS.md').toString(), 'Public instructions.\n');
  assert.equal(entries.get('docs/public/AGENTS.md').toString(), 'Public instructions.\n');
});

test('writes identical exports and verifies each output digest', (t) => {
  const dir = sandbox(t);
  const entries = new Map([['README.md', Buffer.from('Public source.\n')], ['src/main.ts', Buffer.from('export const value = 1;\n')]]);
  const first = writeExport(join(dir, 'first'), entries);
  const second = writeExport(join(dir, 'second'), entries);
  assert.deepEqual(first, second);
  assert.deepEqual(readFileSync(join(dir, 'first/PUBLIC-SOURCE-RECEIPT.json')), readFileSync(join(dir, 'second/PUBLIC-SOURCE-RECEIPT.json')));
  for (const file of first.files) assert.equal(createHash('sha256').update(readFileSync(join(dir, 'first', file.path))).digest('hex'), file.sha256);
});

test('refuses existing destinations, dangling symlinks and symlink parents', (t) => {
  const dir = sandbox(t);
  const entries = new Map([['README.md', Buffer.from('Source.\n')]]);
  const output = join(dir, 'existing');
  mkdirSync(output);
  writeFileSync(join(output, 'keep'), 'unchanged');
  assert.throws(() => writeExport(output, entries), /already exists/);
  assert.equal(readFileSync(join(output, 'keep'), 'utf8'), 'unchanged');
  symlinkSync(join(dir, 'missing'), join(dir, 'dangling'));
  assert.throws(() => writeExport(join(dir, 'dangling'), entries), /already exists/);
  symlinkSync(output, join(dir, 'linked'));
  assert.throws(() => writeExport(join(dir, 'linked/new'), entries), /symlinks/);
});

test('validates clean-export receipts and detects later file modifications', (t) => {
  const dir = sandbox(t);
  const output = join(dir, 'source');
  writeExport(output, new Map([['README.md', Buffer.from('Public source.\n')]]));
  assert.deepEqual(receiptPaths(output), ['README.md']);
  writeFileSync(join(output, 'README.md'), 'Changed.\n');
  assert.throws(() => receiptPaths(output), /receipt mismatch/);
});

test('clean-export inventory rejects unexpected root and nested files before reading payloads', (t) => {
  const dir = sandbox(t);
  for (const extra of ['extra.txt', '.env.local', 'docs/' + 'private-review.md', 'docs/public/extra.md']) {
    const output = join(dir, `source-${extra.replaceAll(/[^a-z]/g, '-')}`);
    writeExport(output, new Map([['README.md', Buffer.from('Source.\n')], ['docs/public/play.md', Buffer.from('Play.\n')]]));
    mkdirSync(dirname(join(output, extra)), { recursive: true });
    writeFileSync(join(output, extra), 'Unexpected.\n');
    writeFileSync(join(output, 'README.md'), 'Changed payload must not be read before inventory rejection.\n');
    assert.throws(() => receiptPaths(output), /Unexpected public source path/);
  }
});

test('clean-export inventory rejects extra symlinks and missing receipt files', (t) => {
  const dir = sandbox(t);
  const output = join(dir, 'source');
  writeExport(output, new Map([['README.md', Buffer.from('Source.\n')]]));
  symlinkSync(join(dir, 'missing'), join(output, 'extra-link'));
  assert.throws(() => receiptPaths(output), /Symlink refused/);
  rmSync(join(output, 'extra-link'));
  symlinkSync(join(dir, 'missing'), join(output, 'node_modules'));
  assert.throws(() => receiptPaths(output), /Symlink refused/);
  rmSync(join(output, 'node_modules'));
  rmSync(join(output, 'README.md'));
  assert.throws(() => receiptPaths(output), /Missing public source path/);
});

test('clean-export inventory permits only named root verification outputs and balance report', (t) => {
  const dir = sandbox(t);
  const output = join(dir, 'source');
  writeExport(output, new Map([['README.md', Buffer.from('Source.\n')]]));
  for (const generated of ['node_modules', 'dist', 'test-results', 'playwright-report', 'coverage', 'scratch']) {
    mkdirSync(join(output, generated));
    writeFileSync(join(output, generated, 'generated.txt'), 'Generated.\n');
  }
  mkdirSync(join(output, 'docs'));
  writeFileSync(join(output, 'docs/BALANCE.md'), 'Balance.\n');
  assert.deepEqual(receiptPaths(output), ['README.md']);
  mkdirSync(join(output, 'docs/public'));
  mkdirSync(join(output, 'docs/public/scratch'));
  assert.throws(() => receiptPaths(output), /Unexpected public source path/);
});

test('synthetic fixture manifest matches all 17 fixture hashes and native container shapes', () => {
  const provenance = JSON.parse(readFileSync(new URL('../test-fixtures/manifest.json', import.meta.url), 'utf8'));
  assert.equal(provenance.formatVersion, 1);
  assert.equal(provenance.fixtures.length, 17);
  for (const fixture of provenance.fixtures) {
    safePath(fixture.file);
    const bytes = readFileSync(new URL(`../test-fixtures/${fixture.file}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), fixture.sha256);
    checkContent(`test-fixtures/${fixture.file}`, bytes);
    assert.deepEqual(Object.keys(fixture).sort(), ['file', 'purpose', 'rulesVersions', 'sha256']);
  }
  const readFixture = (name) => JSON.parse(readFileSync(new URL(`../test-fixtures/replays/${name}.json`, import.meta.url), 'utf8'));
  assert.ok(Array.isArray(readFixture('early-workboard')));
  assert.equal(typeof readFixture('continuing-storage')['lantern.runs.v1'], 'string');
  const production = readFixture('production-day');
  assert.deepEqual(Object.keys(production).sort(), ['commands', 'config', 'name', 'rules', 'v']);
});
