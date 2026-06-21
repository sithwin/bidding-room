import { Lot } from '../domain/lot';
import { LotRepository } from '../domain/lot-repository';

export class GetLotUseCase {
  constructor(private readonly lotRepository: LotRepository) {}

  async execute(id: string): Promise<Lot | null> {
    return this.lotRepository.findById(id);
  }
}
