import { v4 as uuidv4 } from 'uuid';
import { CollectionSlot } from '../domain/fulfilment';
import { FulfilmentRepository } from '../domain/fulfilment-repository';

interface ChooseCollectDto {
  fulfilmentId: string;
  userId: string;
  slot: {
    location: string;
    date: string;
    timeSlot: string;
  };
}

export class ChooseCollectUseCase {
  constructor(private readonly repo: FulfilmentRepository) {}

  async execute(dto: ChooseCollectDto): Promise<void> {
    const fulfilment = await this.repo.findById(dto.fulfilmentId);
    if (!fulfilment) throw new Error('Fulfilment not found');
    if (fulfilment.userId !== dto.userId) throw new Error('Forbidden');

    const slot: CollectionSlot = {
      id: uuidv4(),
      fulfilmentId: dto.fulfilmentId,
      location: dto.slot.location,
      date: dto.slot.date,
      timeSlot: dto.slot.timeSlot,
    };

    fulfilment.chooseCollect(slot);
    await this.repo.saveWithSlot(fulfilment, slot);
  }
}
