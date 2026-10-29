// Export only reviewed, tracked source. No Git metadata or development reports are copied.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const manifest = JSON.parse(readFileSync(new URL('./public-source-manifest.json', import.meta.url), 'utf8'));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const forbiddenPart = /^(?:\.git|\.env(?:\..*)?|\.aws|\.ssh|\.secrets|node_modules|scratch|worktrees|logs?|coverage|dist|test-results|playwright-report)$/i;

export function safePath(path) {
  // oxlint-disable-next-line no-control-regex -- Export paths must reject all control characters.
  if (typeof path !== 'string' || !path || isAbsolute(path) || /[\\\x00-\x1f\x7f]/.test(path)) throw new Error('Invalid export path.');
  const parts = path.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || forbiddenPart.test(part)) || /\.(?:log|zip|tar|gz|tsbuildinfo)$/i.test(path)) throw new Error(`Rejected export path: ${path}`);
  return path;
}

export function selectedPaths(tracked, rules = manifest) {
  const selected = tracked.filter((path) => rules.files.includes(path) || rules.directories.some((prefix) => path.startsWith(prefix)));
  return [...new Set(selected.filter((path) => !rules.exclude.includes(path)).map(safePath))].sort();
}

function regularFile(sourceRoot, path) {
  // Check each component so even a symlinked parent directory is refused.
  let target = sourceRoot;
  for (const part of safePath(path).split('/')) {
    target = join(target, part);
    if (lstatSync(target).isSymbolicLink()) throw new Error(`Symlink refused: ${path}`);
  }
  if (!lstatSync(target).isFile()) throw new Error(`Not a regular file: ${path}`);
  return target;
}

export function checkContent(path, bytes, rules = manifest) {
  const text = bytes.toString('utf8');
  const checks = [
    ['local absolute path', /(?:\/(?:Users|home|private|Volumes)\/[^\s'"<>]+|[A-Z]:\\Users\\)/i],
    ['private report reference', /(?:^|[\s'"`(<])(?:\.\.?\/)*docs\/(?!public(?:\/|$|[\s'"`)<>])|BALANCE\.md\b|METRICS\.md\b)[a-z0-9][^\s'"`)<>]*/i],
    ['private key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
    ['credential', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/],
  ];
  for (const [label, pattern] of checks) if (pattern.test(text)) throw new Error(`Public hygiene failed (${label}): ${path}`);
  const keys = text.match(/\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b/g) ?? [];
  const allowedKeys = path === 'scripts/public-source-manifest.json' ? Object.values(rules.invalidTestKeys).flat() : rules.invalidTestKeys[path] ?? [];
  if (keys.some((key) => !allowedKeys.includes(key))) throw new Error(`Public hygiene failed (API credential): ${path}`);
}

export function publicPackage(bytes, rules = manifest) {
  const pkg = JSON.parse(bytes.toString('utf8'));
  pkg.scripts = Object.fromEntries(rules.packageScripts.map((name) => {
    if (typeof pkg.scripts[name] !== 'string') throw new Error(`Missing public package script: ${name}`);
    return [name, pkg.scripts[name]];
  }));
  pkg.scripts['public:check'] = 'node scripts/public-source.mjs --check';
  pkg.scripts['public:export'] = 'node scripts/public-source.mjs';
  pkg.scripts['test:public-source'] = 'node --test scripts/public-source.test.mjs';
  return Buffer.from(`${JSON.stringify(pkg, null, 2)}\n`);
}

export function collectSource(sourceRoot, tracked, rules = manifest) {
  const entries = new Map();
  for (const path of selectedPaths(tracked, rules)) {
    let bytes = readFileSync(regularFile(sourceRoot, path));
    if (path === 'package.json') bytes = publicPackage(bytes, rules);
    checkContent(path, bytes, rules);
    for (const outputPath of new Set([path, rules.map[path] ?? path])) {
      safePath(outputPath);
      if (entries.has(outputPath)) throw new Error(`Duplicate export target: ${outputPath}`);
      entries.set(outputPath, bytes);
    }
  }
  return new Map([...entries].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}

export function checkLinks(entries) {
  for (const [path, bytes] of entries) {
    if (!path.endsWith('.md')) continue;
    const text = bytes.toString('utf8');
    for (const match of text.matchAll(/!?\[[^\]]*\]\(<?([^\s)>]+)>?(?:\s+"[^"]*")?\)/g)) {
      const target = match[1];
      if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(target)) continue;
      const pathname = decodeURIComponent(target.split(/[?#]/)[0]);
      const destination = relative('.', join(dirname(path), pathname)).split(sep).join('/');
      if (pathname.startsWith('/') || destination.startsWith('../') || !entries.has(destination)) throw new Error(`Broken public document link in ${path}`);
    }
  }
}

export function writeExport(destination, entries) {
  const target = resolve(destination);
  // Existing destinations, including dangling symlinks, must never be overwritten.
  let exists = false;
  try { lstatSync(target); exists = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (exists) throw new Error('Export destination already exists.');
  const parent = dirname(target);
  if (realpathSync(parent) !== parent) throw new Error('Export destination parent must not contain symlinks.');
  const files = [];
  for (const [path, bytes] of entries) {
    safePath(path);
    checkContent(path, bytes);
    files.push({ path, bytes: bytes.length, sha256: digest(bytes) });
  }
  const receipt = { format: 1, algorithm: 'sha256', files, sourceSha256: digest(JSON.stringify(files)) };
  mkdirSync(target); // No recursive flag: races and missing parents fail closed.
  for (const [path, bytes] of entries) {
    mkdirSync(join(target, dirname(path)), { recursive: true });
    writeFileSync(join(target, path), bytes, { flag: 'wx', mode: 0o644 });
  }
  writeFileSync(join(target, 'PUBLIC-SOURCE-RECEIPT.json'), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx', mode: 0o644 });
  return receipt;
}

export function receiptPaths(sourceRoot) {
  const receipt = JSON.parse(readFileSync(regularFile(sourceRoot, 'PUBLIC-SOURCE-RECEIPT.json'), 'utf8'));
  if (receipt.format !== 1 || receipt.algorithm !== 'sha256' || !Array.isArray(receipt.files) || digest(JSON.stringify(receipt.files)) !== receipt.sourceSha256) throw new Error('Invalid public source receipt.');
  const paths = receipt.files.map((file) => safePath(file.path));
  if (new Set(paths).size !== paths.length) throw new Error('Duplicate public source receipt entry.');
  // Inventory first: unexpected files must never be opened, including credentials or private reports.
  const expected = new Set([...paths, 'PUBLIC-SOURCE-RECEIPT.json']);
  const generatedDirectories = new Set(['node_modules', 'dist', 'test-results', 'playwright-report', 'coverage', 'scratch']);
  const generatedFiles = new Set(['docs/BALANCE.md']);
  const directories = new Set();
  for (const path of [...expected, ...generatedFiles]) {
    for (let dir = dirname(path); dir !== '.'; dir = dirname(dir)) directories.add(dir);
  }
  const seen = new Set();
  function inspect(directory = '') {
    for (const name of readdirSync(join(sourceRoot, directory)).sort()) {
      const path = directory ? `${directory}/${name}` : name;
      const stat = lstatSync(join(sourceRoot, path));
      if (stat.isSymbolicLink()) throw new Error(`Symlink refused: ${path}`);
      if (stat.isDirectory()) {
        if (generatedDirectories.has(path)) continue;
        if (!directories.has(path)) throw new Error(`Unexpected public source path: ${path}`);
        inspect(path);
      } else {
        if (!stat.isFile() || (!expected.has(path) && !generatedFiles.has(path))) throw new Error(`Unexpected public source path: ${path}`);
        seen.add(path);
      }
    }
  }
  inspect();
  for (const path of expected) if (!seen.has(path)) throw new Error(`Missing public source path: ${path}`);
  for (const file of receipt.files) {
    const bytes = readFileSync(regularFile(sourceRoot, file.path));
    if (bytes.length !== file.bytes || digest(bytes) !== file.sha256) throw new Error(`Public source receipt mismatch: ${file.path}`);
  }
  return paths;
}

function run() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0] === '--help') throw new Error('Usage: node scripts/public-source.mjs <new-directory> | --check');
  let tracked;
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (realpathSync(top) !== realpathSync(root)) throw new Error('Export is inside another checkout.');
    tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\0').filter(Boolean);
  } catch {
    // A clean export has no Git directory. Its receipt is the exact inventory.
    tracked = receiptPaths(root);
  }
  const entries = collectSource(root, tracked);
  checkLinks(entries);
  if (args[0] === '--check') {
    console.log(`Public source check passed: ${entries.size} files.`);
  } else {
    const receipt = writeExport(args[0], entries);
    console.log(`Public source exported: ${receipt.files.length} files; SHA-256 ${receipt.sourceSha256}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { run(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
