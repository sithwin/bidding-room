import { PostgresEnquiryRepository, ValuationEnquiry } from '../infrastructure/postgres-enquiry-repository';

type PublishFn = (routingKey: string, payload: Record<string, unknown>) => Promise<void>;

export class SubmitValuationEnquiryUseCase {
  constructor(
    private readonly repo: PostgresEnquiryRepository,
    private readonly publish: PublishFn,
  ) {}

  async execute(input: ValuationEnquiry): Promise<{ ok: true }> {
    await this.repo.save(input);
    await this.publish('enquiry.valuation.received', {
      category: input.category,
      name: input.name,
      email: input.email,
    });
    return { ok: true };
  }
}
