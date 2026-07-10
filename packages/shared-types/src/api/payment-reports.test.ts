import { describe, it, expect } from 'vitest';
import { revenueReportResponseSchema, pendingInvoiceCountResponseSchema } from './payment-reports.js';

describe('revenueReportResponseSchema', () => {
  it('should_parseRevenueReportEnvelope', () => {
    const parsed = revenueReportResponseSchema.parse({ data: { byCurrency: { GBP: 1500, USD: 200 } } });
    expect(parsed.data.byCurrency['GBP']).toBe(1500);
    expect(parsed.data.byCurrency['USD']).toBe(200);
  });

  it('should_parseEmptyByCurrency', () => {
    const parsed = revenueReportResponseSchema.parse({ data: { byCurrency: {} } });
    expect(parsed.data.byCurrency).toEqual({});
  });

  it('should_rejectMissingData', () => {
    expect(revenueReportResponseSchema.safeParse({ byCurrency: { GBP: 1500 } }).success).toBe(false);
  });
});

describe('pendingInvoiceCountResponseSchema', () => {
  it('should_parsePendingInvoiceCountEnvelope', () => {
    const parsed = pendingInvoiceCountResponseSchema.parse({ data: { count: 4 } });
    expect(parsed.data.count).toBe(4);
  });

  it('should_rejectMissingData', () => {
    expect(pendingInvoiceCountResponseSchema.safeParse({ count: 4 }).success).toBe(false);
  });
});
