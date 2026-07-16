import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

let fileCounter = 0;

export function collectClientCoverage(page: Page, outDir: string) {
  return {
    async start(): Promise<void> {
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
    },
    async flush(): Promise<void> {
      const entries = await page.coverage.stopJSCoverage();
      await mkdir(outDir, { recursive: true });
      const payload = { result: entries };
      fileCounter += 1;
      const file = join(outDir, `client-${process.pid}-${fileCounter}.json`);
      await writeFile(file, JSON.stringify(payload), 'utf8');
    },
  };
}
