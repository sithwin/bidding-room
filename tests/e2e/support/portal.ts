import { fork, type ChildProcess } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const currentDir = dirname(fileURLToPath(import.meta.url));

export interface PortalHandle {
  stop(): Promise<void>;
}

interface StartPortalOptions {
  name: 'user-portal' | 'admin-portal';
  port: number;
  coverageDir: string;
  env: Record<string, string>;
  /** 'start' (default, production build) or 'dev' (next dev — see README "Coverage mode"). */
  mode?: 'start' | 'dev';
}

export async function startPortal(opts: StartPortalOptions): Promise<PortalHandle> {
  const mode = opts.mode ?? 'start';
  const repoRoot = join(process.cwd(), '..', '..');
  const appDir = join(repoRoot, 'apps', opts.name);
  const nextBinPath = join(appDir, 'node_modules', 'next', 'dist', 'bin', 'next');
  const childScript = join(currentDir, 'portal-child.cjs');

  // We fork our own bootstrap (portal-child.cjs) instead of spawning
  // `pnpm exec next start` directly. Two reasons:
  //  1. `fork()` gives us an IPC channel to the child for free, which we use
  //     for a cross-platform-safe graceful shutdown (see portal-child.cjs).
  //  2. Spawning through `pnpm exec` (and, on Windows, a shell) adds process
  //     hops that a signal sent to the immediate child never reaches — the
  //     real `next start` process ends up orphaned. Forking the next binary
  //     directly means there is exactly one child process to manage.
  const child: ChildProcess = fork(childScript, [mode, '-p', String(opts.port)], {
    cwd: appDir,
    env: { ...process.env, ...opts.env, NODE_V8_COVERAGE: opts.coverageDir, NEXT_BIN_PATH: nextBinPath },
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  });

  const baseUrl = `http://localhost:${opts.port}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(baseUrl);
      if (res.ok || res.status === 404) {
        break;
      }
    } catch {
      // portal not up yet — keep polling
    }
    await sleep(1000);
  }

  return {
    async stop(): Promise<void> {
      if (child.exitCode !== null) {
        return;
      }
      const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
      if (child.connected) {
        // Ask the child to run its graceful-shutdown path via IPC (see
        // portal-child.cjs). A direct `child.kill('SIGTERM')` from this
        // process — or even a self-directed `process.kill(pid, 'SIGTERM')`
        // inside the child — goes through the OS signal layer, which on
        // Windows forcibly terminates the process before any listener runs
        // (verified empirically), dropping the NODE_V8_COVERAGE dump.
        child.send('shutdown');
      } else {
        // Fallback only if the IPC channel is unavailable. On POSIX this is
        // still a graceful SIGTERM; on Windows it is abrupt (see above) and
        // should not be relied on to preserve coverage.
        child.kill('SIGTERM');
      }
      await Promise.race([exited, sleep(15_000)]);
    },
  };
}
