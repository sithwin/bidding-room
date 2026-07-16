'use strict';

// Thin bootstrap forked by support/portal.ts to run `next start` (or `next dev`)
// in-process, with an IPC channel available.
//
// Why this exists: Node's child_process.kill('SIGTERM') is a forceful, abrupt
// termination on Windows regardless of the signal name passed (see Node docs
// for ChildProcess#kill — "on Windows... the process will be killed forcefully
// and abruptly, similar to 'SIGKILL'"). That loses the NODE_V8_COVERAGE dump,
// which only flushes on a graceful process exit.
//
// Empirically (verified against this exact Node/Windows build), even a
// *self-directed* `process.kill(process.pid, 'SIGTERM')` goes through the
// same OS-level uv_kill() path on Windows and forcibly terminates the process
// before any 'SIGTERM' listener runs — there is no special-case for
// self-signalling. `process.emit('SIGTERM')`, by contrast, never touches the
// OS signal layer at all: it just invokes the same JS listeners
// (`process.on('SIGTERM', cleanup)`, which Next.js's own server registers)
// synchronously in-process. That is portable — it produces the identical
// graceful-shutdown code path on POSIX too — so we use it unconditionally
// rather than branching on `process.platform`.
const nextBinPath = process.env.NEXT_BIN_PATH;

process.on('message', (msg) => {
  if (msg === 'shutdown') {
    process.emit('SIGTERM');
  }
});

require(nextBinPath);
