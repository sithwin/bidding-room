import { FulfilmentRepository } from '../domain/fulfilment-repository';

interface MarkCollectedDto {
  fulfilmentId: string;
}

export class MarkCollectedUseCase {
  constructor(private readonly repo: FulfilmentRepository) {}

  async execute(dto: MarkCollectedDto): Promise<void> {
    const fulfilment = await this.repo.findById(dto.fulfilmentId);
    if (!fulfilment) throw new Error('Fulfilment not found');
    fulfilment.markCollected();
    await this.repo.save(fulfilment);
  }
}
