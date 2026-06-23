import { v4 as uuidv4 } from 'uuid';
import { Fulfilment } from '../domain/fulfilment';
import { FulfilmentRepository } from '../domain/fulfilment-repository';

interface CreateFulfilmentDto {
  lotId: string;
  userId: string;
}

export class CreateFulfilmentUseCase {
  constructor(private readonly repo: FulfilmentRepository) {}

  async execute(dto: CreateFulfilmentDto): Promise<void> {
    const fulfilment = Fulfilment.create({
      id: uuidv4(),
      lotId: dto.lotId,
      userId: dto.userId,
    });
    await this.repo.save(fulfilment);
  }
}
