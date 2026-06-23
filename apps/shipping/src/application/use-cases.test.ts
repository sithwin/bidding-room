import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CreateFulfilmentUseCase } from './create-fulfilment.use-case';
import { ChooseShipUseCase } from './choose-ship.use-case';
import { ChooseCollectUseCase } from './choose-collect.use-case';
import { MarkDispatchedUseCase } from './mark-dispatched.use-case';
import { MarkCollectedUseCase } from './mark-collected.use-case';
import { GetFulfilmentUseCase } from './get-fulfilment.use-case';
import { Fulfilment, FulfilmentStatus } from '../domain/fulfilment';
import { FulfilmentRepository } from '../domain/fulfilment-repository';

const makeAddress = (fulfilmentId: string) => ({
  id: 'addr-1',
  fulfilmentId,
  fullName: 'Jane Smith',
  line1: '1 Queen St',
  line2: null,
  city: 'Melbourne',
  state: 'VIC',
  postcode: '3000',
  country: 'AU',
});

const makeSlot = (fulfilmentId: string) => ({
  id: 'slot-1',
  fulfilmentId,
  location: 'Sydney Store',
  date: '2026-07-01',
  timeSlot: '10:00-11:00',
});

const makeMockRepo = (): FulfilmentRepository => ({
  findById: vi.fn(),
  findByLotId: vi.fn(),
  save: vi.fn(),
  saveWithAddress: vi.fn(),
  saveWithSlot: vi.fn(),
});

describe('CreateFulfilmentUseCase', () => {
  it('should_createFulfilment_when_paymentReceived', async () => {
    const repo = makeMockRepo();
    const sut = new CreateFulfilmentUseCase(repo);

    await sut.execute({ lotId: 'lot-1', userId: 'user-1' });

    expect(repo.save).toHaveBeenCalledOnce();
    const saved = (repo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Fulfilment;
    expect(saved.lotId).toBe('lot-1');
    expect(saved.status).toBe(FulfilmentStatus.PENDING_CHOICE);
  });
});

describe('ChooseShipUseCase', () => {
  it('should_updateFulfilmentWithAddress_when_shipChosen', async () => {
    const repo = makeMockRepo();
    const fulfilment = Fulfilment.create({ id: 'f-1', lotId: 'lot-1', userId: 'user-1' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(fulfilment);
    const sut = new ChooseShipUseCase(repo);

    await sut.execute({ fulfilmentId: 'f-1', userId: 'user-1', address: makeAddress('f-1') });

    expect(repo.saveWithAddress).toHaveBeenCalledOnce();
  });

  it('should_throwError_when_fulfilmentNotFound', async () => {
    const repo = makeMockRepo();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const sut = new ChooseShipUseCase(repo);

    await expect(
      sut.execute({ fulfilmentId: 'f-1', userId: 'user-1', address: makeAddress('f-1') })
    ).rejects.toThrow('Fulfilment not found');
  });

  it('should_throwError_when_userDoesNotOwnFulfilment', async () => {
    const repo = makeMockRepo();
    const fulfilment = Fulfilment.create({ id: 'f-1', lotId: 'lot-1', userId: 'owner-999' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(fulfilment);
    const sut = new ChooseShipUseCase(repo);

    await expect(
      sut.execute({ fulfilmentId: 'f-1', userId: 'different-user', address: makeAddress('f-1') })
    ).rejects.toThrow('Forbidden');
  });
});

describe('MarkDispatchedUseCase', () => {
  it('should_markDispatched_when_pendingDispatch', async () => {
    const repo = makeMockRepo();
    const fulfilment = Fulfilment.create({ id: 'f-1', lotId: 'lot-1', userId: 'user-1' });
    const address = makeAddress('f-1');
    fulfilment.chooseShip(address);
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(fulfilment);
    const sut = new MarkDispatchedUseCase(repo);

    await sut.execute({ fulfilmentId: 'f-1' });

    expect(repo.save).toHaveBeenCalledOnce();
    const saved = (repo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Fulfilment;
    expect(saved.status).toBe(FulfilmentStatus.DISPATCHED);
  });
});

describe('GetFulfilmentUseCase', () => {
  it('should_returnFulfilment_when_userOwnsIt', async () => {
    const repo = makeMockRepo();
    const fulfilment = Fulfilment.create({ id: 'f-1', lotId: 'lot-1', userId: 'user-1' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(fulfilment);
    const sut = new GetFulfilmentUseCase(repo);

    const result = await sut.execute({ fulfilmentId: 'f-1', userId: 'user-1' });

    expect(result.id).toBe('f-1');
  });

  it('should_throwError_when_userDoesNotOwn', async () => {
    const repo = makeMockRepo();
    const fulfilment = Fulfilment.create({ id: 'f-1', lotId: 'lot-1', userId: 'owner-999' });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(fulfilment);
    const sut = new GetFulfilmentUseCase(repo);

    await expect(
      sut.execute({ fulfilmentId: 'f-1', userId: 'different-user' })
    ).rejects.toThrow('Forbidden');
  });
});
