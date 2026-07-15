import { CoverageReport } from 'monocart-coverage-reports';

const serverDir = process.env.SERVER_COVERAGE_DIR ?? '/tmp/e2e-server-cov';
const clientDir = process.env.CLIENT_COVERAGE_DIR ?? '/tmp/e2e-client-cov';
const outDir = process.env.LCOV_OUT_DIR ?? './coverage/spike';
const sourceRoot = process.env.SOURCE_ROOT ?? '../../apps/user-portal';

const report = new CoverageReport({
  name: 'E2E Coverage',
  outputDir: outDir,
  reports: [['lcovonly', { file: 'lcov.info' }]],
  sourceFilter: (path) => path.includes('/src/') && !path.includes('/node_modules/'),
  sourcePath: (filePath) => filePath,
  entryFilter: (entry) => entry.url.includes(sourceRoot) || entry.url.includes('/_next/'),
});

await report.addFromDir(serverDir);
await report.addFromDir(clientDir);
const results = await report.generate();
console.log(`lcov written to ${outDir}/lcov.info — files: ${results.files?.length ?? 0}`);
if (!results.files || results.files.length === 0) {
  console.error('FIDELITY FAILURE: no source files mapped. See fallback in README.');
  process.exit(1);
}
