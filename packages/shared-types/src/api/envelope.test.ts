import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { envelope, listEnvelope } from './envelope.js';

describe('envelope', () => {
  it('should_parseSingleResourceEnvelope', () => {
    const schema = envelope(z.object({ id: z.string() }));
    expect(schema.parse({ data: { id: 'a' } }).data.id).toBe('a');
  });

  it('should_rejectMissingData', () => {
    const schema = envelope(z.object({ id: z.string() }));
    expect(schema.safeParse({ id: 'a' }).success).toBe(false);
  });
});

describe('listEnvelope', () => {
  it('should_parseListWithFullMeta', () => {
    const schema = listEnvelope(z.object({ id: z.string() }));
    const parsed = schema.parse({ data: [{ id: 'a' }], meta: { total: 1, limit: 20, offset: 0 } });
    expect(parsed.data).toHaveLength(1);
    expect(parsed.meta.total).toBe(1);
  });

  it('should_parseListWithPageMeta', () => {
    // auction-engine style meta: { page, total }
    const schema = listEnvelope(z.object({ id: z.string() }));
    expect(schema.safeParse({ data: [], meta: { total: 0, page: 1 } }).success).toBe(true);
  });

  it('should_rejectImaginedLotsShape', () => {
    // the exact drift that crashed the home page on 2026-07-08
    const schema = listEnvelope(z.object({ id: z.string() }));
    expect(schema.safeParse({ lots: [{ id: 'a' }] }).success).toBe(false);
  });
});
