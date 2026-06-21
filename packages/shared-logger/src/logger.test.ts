import { describe, it, expect } from 'vitest';
import { createLogger } from './logger.js';

describe('createLogger', () => {
  it('should_createLogger_when_configIsValid', () => {
    const logger = createLogger({ service: 'test' });

    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('should_respectLogLevel_when_levelIsProvided', () => {
    const logger = createLogger({ service: 'test', level: 'warn' });

    expect(logger.level).toBe('warn');
  });

  it('should_includeServiceInBase_when_serviceIsProvided', () => {
    const logger = createLogger({ service: 'catalogue' });

    expect(logger.bindings().service).toBe('catalogue');
  });
});
