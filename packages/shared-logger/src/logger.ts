import pino, { type Logger } from 'pino';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LoggerConfig {
  service: string;
  level?: LogLevel;
  pretty?: boolean;
}

export function createLogger(config: LoggerConfig): Logger {
  const { service, level = 'info', pretty = false } = config;

  return pino({
    level,
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: pretty
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  });
}
