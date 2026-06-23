import { FulfilmentRepository } from '../domain/fulfilment-repository';

interface MarkDispatchedDto {
  fulfilmentId: string;
}

export class MarkDispatchedUseCase {
  constructor(private readonly repo: FulfilmentRepository) {}

  async execute(dto: MarkDispatchedDto): Promise<void> {
    const fulfilment = await this.repo.findById(dto.fulfilmentId);
    if (!fulfilment) throw new Error('Fulfilment not found');
    fulfilment.markDispatched();
    await this.repo.save(fulfilment);
  }
}
