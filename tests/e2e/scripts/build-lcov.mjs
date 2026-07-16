import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { CoverageReport } from 'monocart-coverage-reports';

// PORTAL selects which portal's coverage to merge. Only 'user-portal' has an
// E2E flow today (see tests/e2e/README.md) — 'admin-portal' is supported so
// this script keeps working unmodified once an admin flow is added.
const portal = process.env.PORTAL ?? 'user-portal';

// Defaults mirror the dirs that global-setup.ts (server) and fixtures.ts
// (client) actually write to. On Windows, a leading '/tmp/...' path resolves
// inconsistently between a Git-Bash shell and a native node.exe child
// process (see tests/e2e/README.md "A Windows-specific pitfall") — os.tmpdir()
// is the convention the rest of the suite already uses, so we follow it here
// too rather than introducing a second path convention.
const serverDir = process.env.SERVER_COVERAGE_DIR ?? join(tmpdir(), 'e2e-cov', portal, 'server');
const clientDir = process.env.CLIENT_COVERAGE_DIR ?? join(tmpdir(), 'e2e-cov', portal, 'client');
const outDir = process.env.LCOV_OUT_DIR ?? `./coverage/${portal}`;
const sourceRoot = `apps/${portal}/src`;

// entryRoot (no '/src') matches the *raw*, pre-source-map V8 entry URLs — a
// production Next build's server bundles live under
// apps/<portal>/.next/server/**, not apps/<portal>/src/**, so filtering
// entries on the '/src/' suffix here would drop every entry before it gets
// a chance to resolve through its sourcemap back to the original source
// path. sourceFilter below runs *after* that resolution and is what
// actually restricts the generated report to real source files (confirmed
// against tests/e2e/coverage/spike/lcov.info from the Task 4 coverage spike,
// which used SOURCE_ROOT=apps/user-portal — no '/src' — for this same reason).
const entryRoot = `apps/${portal}`;

const report = new CoverageReport({
  name: `E2E Coverage (${portal})`,
  outputDir: outDir,
  reports: [['lcovonly', { file: 'lcov.info' }]],
  sourceFilter: (path) => path.includes(`${sourceRoot}/`) && !path.includes('/node_modules/'),
  sourcePath: (filePath) => filePath,
  entryFilter: (entry) => entry.url.includes(entryRoot) || entry.url.includes('/_next/'),
});

// Server-side V8 coverage (from NODE_V8_COVERAGE, dumped by Node itself) can
// go through addFromDir: monocart-coverage-reports' readFromDir() only
// accepts entries whose url starts with 'file:', which every Node-dumped
// entry does.
await report.addFromDir(serverDir);

// Client-side V8 coverage (from Playwright's page.coverage.startJSCoverage,
// flushed by collectClientCoverage() in support/coverage.ts) is written in
// the same raw-V8-list shape ({ result: [{ url, scriptId, source, functions
// }, ...] }), but every entry's url is a browser 'http://localhost:3000/...'
// URL, not 'file:' — readFromDir's file-scheme filter silently drops 100% of
// it. report.add() (used directly here, bypassing addFromDir/readFromDir)
// has no such filter — it accepts the raw V8 list as-is and resolves each
// entry's embedded inline sourcemap comment back to the original
// apps/<portal>/src/** file, exactly like the server-side entries do.
const clientFiles = await readdir(clientDir).catch(() => []);
for (const file of clientFiles.filter((name) => name.endsWith('.json'))) {
  const { result } = JSON.parse(await readFile(join(clientDir, file), 'utf8'));
  if (Array.isArray(result) && result.length > 0) {
    await report.add(result);
  }
}

const results = await report.generate();
const mapped = (results.files ?? []).filter((f) => f.sourcePath?.includes(sourceRoot));
console.log(`[${portal}] mapped src files: ${mapped.length}`);
if (mapped.length === 0) {
  console.error(`FIDELITY FAILURE for ${portal}: no ${sourceRoot} files in lcov`);
  process.exit(1);
}
