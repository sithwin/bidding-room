import { describe, it, expect, afterEach } from 'vitest';
import { maxRequestsFromEnv } from './max-requests-from-env';

describe('maxRequestsFromEnv', () => {
  const ENV_VAR = 'MAX_REQUESTS_FROM_ENV_TEST_VAR';

  afterEach(() => {
    delete process.env[ENV_VAR];
  });

  it('should_returnDefault_when_envVarUnset', () => {
    expect(maxRequestsFromEnv(ENV_VAR, 10)).toBe(10);
  });

  it('should_returnParsedValue_when_envVarIsPositiveInteger', () => {
    process.env[ENV_VAR] = '1000';
    expect(maxRequestsFromEnv(ENV_VAR, 10)).toBe(1000);
  });

  it('should_returnDefault_when_envVarIsNotANumber', () => {
    process.env[ENV_VAR] = 'not-a-number';
    expect(maxRequestsFromEnv(ENV_VAR, 10)).toBe(10);
  });

  it('should_returnDefault_when_envVarIsZeroOrNegative', () => {
    process.env[ENV_VAR] = '0';
    expect(maxRequestsFromEnv(ENV_VAR, 10)).toBe(10);

    process.env[ENV_VAR] = '-5';
    expect(maxRequestsFromEnv(ENV_VAR, 10)).toBe(10);
  });
});
