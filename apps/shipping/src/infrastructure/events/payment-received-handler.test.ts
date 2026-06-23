import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentReceivedHandler } from './payment-received-handler';
import { CreateFulfilmentUseCase } from '../../application/create-fulfilment.use-case';
import { PaymentReceivedPayload } from '@carat-room/shared-types';

const makeUseCase = () =>
  ({ execute: vi.fn() } as unknown as CreateFulfilmentUseCase);

describe('PaymentReceivedHandler', () => {
  let useCase: CreateFulfilmentUseCase;
  let handler: PaymentReceivedHandler;

  beforeEach(() => {
    useCase = makeUseCase();
    handler = new PaymentReceivedHandler(useCase);
  });

  it('should_createFulfilment_when_paymentReceived', async () => {
    const payload: PaymentReceivedPayload = {
      invoiceId: 'inv-1',
      lotId: 'lot-1',
      winnerUserId: 'user-1',
      amount: 500,
      currency: 'AUD',
      paidAt: '2026-06-20T10:00:00Z',
    };

    await handler.handle(payload);

    expect(useCase.execute).toHaveBeenCalledWith({
      lotId: 'lot-1',
      userId: 'user-1',
    });
  });
});
