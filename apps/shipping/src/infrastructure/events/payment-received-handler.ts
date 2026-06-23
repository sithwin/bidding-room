import { PaymentReceivedPayload } from '@carat-room/shared-types';
import { CreateFulfilmentUseCase } from '../../application/create-fulfilment.use-case';

export class PaymentReceivedHandler {
  constructor(private readonly createFulfilment: CreateFulfilmentUseCase) {}

  async handle(payload: PaymentReceivedPayload): Promise<void> {
    await this.createFulfilment.execute({
      lotId: payload.lotId,
      userId: payload.winnerUserId,
    });
  }
}
