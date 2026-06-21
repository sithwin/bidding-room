import { type LogLevel } from './logger.js';
import { getLogger } from './context.js';

export interface LogEntry {
  logEvent: string;
  payload?: Record<string, unknown>;
}

export function log(level: LogLevel, entry: LogEntry, description: string): void {
  getLogger()[level](
    { logEvent: entry.logEvent, payload: entry.payload ?? {} },
    description,
  );
}
