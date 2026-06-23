import { v4 as uuidv4 } from 'uuid';
import { ShippingAddress } from '../domain/fulfilment';
import { FulfilmentRepository } from '../domain/fulfilment-repository';

interface AddressInput {
  id?: string;
  fulfilmentId?: string;
  fullName: string;
  line1: string;
  line2?: string | null;
  city: string;
  state?: string | null;
  postcode: string;
  country: string;
}

interface ChooseShipDto {
  fulfilmentId: string;
  userId: string;
  address: AddressInput;
}

export class ChooseShipUseCase {
  constructor(private readonly repo: FulfilmentRepository) {}

  async execute(dto: ChooseShipDto): Promise<void> {
    const fulfilment = await this.repo.findById(dto.fulfilmentId);
    if (!fulfilment) throw new Error('Fulfilment not found');
    if (fulfilment.userId !== dto.userId) throw new Error('Forbidden');

    const address: ShippingAddress = {
      id: dto.address.id ?? uuidv4(),
      fulfilmentId: dto.fulfilmentId,
      fullName: dto.address.fullName,
      line1: dto.address.line1,
      line2: dto.address.line2 ?? null,
      city: dto.address.city,
      state: dto.address.state ?? null,
      postcode: dto.address.postcode,
      country: dto.address.country,
    };

    fulfilment.chooseShip(address);
    await this.repo.saveWithAddress(fulfilment, address);
  }
}
