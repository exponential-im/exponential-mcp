#!/usr/bin/env node
// Fails with a plain-language error when this repo's exponential-sdk dependency can't
// be installed from npm as written. ci.yml runs it before `npm ci`.
//
// Why it exists: this repo and exponential-sdk are released together, and it is easy to
// merge a change here that needs an SDK version nobody has published yet (or to commit a
// lockfile made against a local build of the SDK). `npm ci` does fail on that, but with
// "package.json and package-lock.json are not in sync" or a tarball 404, which reads
// like a tooling glitch. This names the cause and the fix.
//
// It needs no dependencies and no node_modules: Node 18+ and network access to the
// registry. Run it by hand from the repo root: node .github/scripts/check-sdk-pin.mjs

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PKG = 'exponential-sdk';
const REGISTRY = 'https://registry.npmjs.org';
const root = process.argv[2] ?? process.cwd();

function fail(title, message) {
  // An annotation on the PR when run by GitHub Actions; plain text everywhere else.
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::error title=${title}::${message.replace(/%/g, '%25').replace(/\r?\n/g, '%0A')}`);
  }
  console.error(`\n✖ ${title}\n\n${message}\n`);
  process.exit(1);
}

function readJson(name) {
  try {
    return JSON.parse(readFileSync(join(root, name), 'utf8'));
  } catch (error) {
    fail(`Can't read ${name}`, String(error?.message ?? error));
  }
}

// x.y.z with no prerelease or build part, as [x, y, z]; anything else is null.
function parseVersion(text) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text.trim());
  return match ? match.slice(1).map(Number) : null;
}

function compare(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

// A test for the ranges this repo actually writes: `^x.y.z`, `~x.y.z`, `>=x.y.z` and an
// exact `x.y.z`. Returns null for anything else, and the range checks are then skipped
// (npm ci still decides).
function rangeTest(range) {
  const match = /^(\^|~|>=|=)?\s*(\d+\.\d+\.\d+)$/.exec(range.trim());
  if (!match) return null;
  const [, operator = '=', text] = match;
  const min = parseVersion(text);
  let below = null;
  if (operator === '^') {
    if (min[0] > 0) below = [min[0] + 1, 0, 0];
    else if (min[1] > 0) below = [0, min[1] + 1, 0];
    else below = [0, 0, min[2] + 1];
  } else if (operator === '~') {
    below = [min[0], min[1] + 1, 0];
  }
  return version => {
    const parsed = parseVersion(version);
    if (!parsed) return false;
    if (operator === '=') return compare(parsed, min) === 0;
    return compare(parsed, min) >= 0 && (below === null || compare(parsed, below) < 0);
  };
}

async function fetchPackument() {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(`${REGISTRY}/${PKG}`, {
        headers: { accept: 'application/vnd.npm.install-v1+json' },
      });
      if (response.ok) return await response.json();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, attempt * 2000));
  }
  fail(
    `Couldn't reach the npm registry`,
    `Fetching ${REGISTRY}/${PKG} failed three times (${lastError?.message ?? lastError}), so the ${PKG} ` +
      `version can't be checked. Re-run this job.`,
  );
}

const pkg = readJson('package.json');
const lock = readJson('package-lock.json');

const range = pkg.dependencies?.[PKG];
if (typeof range !== 'string') {
  fail(`${PKG} is not a dependency`, `package.json has no dependencies["${PKG}"]. This check expects one.`);
}

// file:, link:, git, URLs, workspace:, npm: aliases and GitHub shorthand all resolve
// somewhere other than the registry, where CI and people installing from npm can't follow.
if (/^(file|link|workspace|npm|git|git\+\w+|https?|github):/i.test(range) || range.includes('/')) {
  fail(
    `${PKG} doesn't come from npm`,
    `package.json depends on ${PKG} as "${range}", which isn't a version on npm. CI can't rely on it, and ` +
      `neither can anyone who installs this package.\n` +
      `Publish the SDK change, then point package.json at the published version:\n` +
      `  npm install ${PKG}@latest`,
  );
}

const packument = await fetchPackument();
const published = Object.keys(packument.versions ?? {});
const latest = packument['dist-tags']?.latest ?? '(unknown)';
const justPublished =
  `If that version was published in the last few minutes the registry may not list it yet: re-run this job.`;

const satisfies = rangeTest(range);
if (!satisfies) {
  console.log(`package.json's range "${range}" isn't one this check can read; skipping the range checks.`);
} else if (!published.some(satisfies)) {
  fail(
    `${PKG} ${range} isn't published`,
    `package.json asks for ${PKG} ${range}, but no version on npm satisfies it (the newest is ${latest}).\n` +
      `Publish that SDK version first, then here:\n` +
      `  npm install\n` +
      `and commit package-lock.json. ${justPublished}`,
  );
}

const entry = lock.packages?.[`node_modules/${PKG}`];
if (!entry) {
  fail(
    `package-lock.json doesn't pin ${PKG}`,
    `There is no "node_modules/${PKG}" entry in package-lock.json. Run \`npm install\` and commit package-lock.json.`,
  );
}

const locked = entry.version;
const tarball = `${REGISTRY}/${PKG}/-/${PKG}-${locked}.tgz`;
if (entry.link || entry.resolved !== tarball) {
  fail(
    `package-lock.json doesn't take ${PKG} from npm`,
    `package-lock.json resolves ${PKG} from ${entry.link ? 'a local link' : `"${entry.resolved}"`}` +
      `${entry.link && entry.resolved ? ` ("${entry.resolved}")` : ''}, not from the npm registry.\n` +
      `That is what \`npm link\`, \`npm install ../exponential-sdk\` or a local tarball leaves behind. ` +
      `Publish the SDK change, then:\n` +
      `  npm install ${PKG}@latest\n` +
      `and commit package.json and package-lock.json.`,
  );
}

if (satisfies && !satisfies(locked)) {
  fail(
    `package-lock.json doesn't match package.json`,
    `package.json asks for ${PKG} ${range}, but package-lock.json pins ${locked}, so \`npm ci\` refuses to install.\n` +
      `Run \`npm install\` and commit package-lock.json.`,
  );
}

const release = packument.versions?.[locked];
if (!release) {
  fail(
    `${PKG} ${locked} isn't published`,
    `package-lock.json pins ${PKG} ${locked}, which is not on npm (the newest is ${latest}).\n` +
      `Publish that SDK version first. ${justPublished}`,
  );
}

if (entry.integrity && release.dist?.integrity && entry.integrity !== release.dist.integrity) {
  fail(
    `package-lock.json has a different ${PKG} ${locked} than npm`,
    `The integrity hash for ${PKG} ${locked} in package-lock.json isn't the one npm serves, so the ` +
      `lockfile was written against a local build of the SDK and \`npm ci\` will refuse the tarball.\n` +
      `Regenerate it from the registry:\n` +
      `  npm install ${PKG}@${locked}\n` +
      `and commit package-lock.json.`,
  );
}

console.log(`✔ ${PKG} ${locked} (package.json: ${range}) is published on npm and matches package-lock.json.`);
