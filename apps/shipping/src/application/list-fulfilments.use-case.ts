import { Fulfilment } from '../domain/fulfilment';
import { FulfilmentRepository } from '../domain/fulfilment-repository';

export class ListFulfilmentsUseCase {
  constructor(private readonly repo: FulfilmentRepository) {}

  async execute(filter: { status?: string }): Promise<Fulfilment[]> {
    return this.repo.findAll(filter);
  }
}
