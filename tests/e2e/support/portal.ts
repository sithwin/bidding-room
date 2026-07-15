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
        // Ask the child to run its graceful-shutdown path via IPC rather
        // than a direct OS signal — see portal-child.cjs for why a signal
        // (even self-directed) is unsafe on Windows and would drop the
        // NODE_V8_COVERAGE dump.
        child.send('shutdown');
      } else {
        // Fallback only if the IPC channel is unavailable. On POSIX this is
        // still a graceful SIGTERM; on Windows it is abrupt (see
        // portal-child.cjs) and should not be relied on to preserve
        // coverage.
        child.kill('SIGTERM');
      }
      const timedOut = Symbol('timed-out');
      const result = await Promise.race([exited.then(() => undefined), sleep(15_000).then(() => timedOut)]);
      if (result === timedOut && child.exitCode === null) {
        // Graceful shutdown didn't finish in time — either the IPC message
        // was never honoured, or the SIGTERM listener threw/hung before
        // calling process.exit(). Escalate to a real OS SIGTERM as a
        // fail-safe so the child is never left running silently (see
        // portal-child.cjs for why a plain SIGTERM still isn't used
        // up-front). Never escalate further to SIGKILL — that risks losing
        // the NODE_V8_COVERAGE dump entirely.
        console.warn(
          `[portal] graceful shutdown of ${child.pid ?? '(unknown pid)'} did not complete within 15s; ` +
            'sending SIGTERM as a fallback',
        );
        child.kill('SIGTERM');
        await Promise.race([exited, sleep(15_000)]);
      }
    },
  };
}
