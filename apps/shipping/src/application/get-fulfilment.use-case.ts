import { Fulfilment } from '../domain/fulfilment';
import { FulfilmentRepository } from '../domain/fulfilment-repository';

interface GetFulfilmentDto {
  fulfilmentId: string;
  userId: string;
}

export class GetFulfilmentUseCase {
  constructor(private readonly repo: FulfilmentRepository) {}

  async execute(dto: GetFulfilmentDto): Promise<Fulfilment> {
    const fulfilment = await this.repo.findById(dto.fulfilmentId);
    if (!fulfilment) throw new Error('Fulfilment not found');
    if (fulfilment.userId !== dto.userId) throw new Error('Forbidden');
    return fulfilment;
  }
}
