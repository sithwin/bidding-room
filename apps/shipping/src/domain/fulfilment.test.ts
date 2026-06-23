import { describe, it, expect } from 'vitest';
import { Fulfilment, FulfilmentStatus, FulfilmentMethod } from './fulfilment';

describe('Fulfilment', () => {
  const makeNew = () =>
    Fulfilment.create({ id: 'f-1', lotId: 'lot-1', userId: 'user-1' });

  describe('chooseShip', () => {
    it('should_setMethodToShip_when_statusIsPendingChoice', () => {
      const fulfilment = makeNew();
      const address = {
        id: 'addr-1',
        fulfilmentId: 'f-1',
        fullName: 'Jane Smith',
        line1: '1 Queen St',
        line2: null,
        city: 'Melbourne',
        state: 'VIC',
        postcode: '3000',
        country: 'AU',
      };

      fulfilment.chooseShip(address);

      expect(fulfilment.method).toBe(FulfilmentMethod.SHIP);
      expect(fulfilment.status).toBe(FulfilmentStatus.PENDING_DISPATCH);
      expect(fulfilment.shippingAddress).toEqual(address);
    });

    it('should_throwError_when_methodAlreadyChosen', () => {
      const fulfilment = makeNew();
      const address = {
        id: 'addr-1',
        fulfilmentId: 'f-1',
        fullName: 'Jane Smith',
        line1: '1 Queen St',
        line2: null,
        city: 'Melbourne',
        state: 'VIC',
        postcode: '3000',
        country: 'AU',
      };
      fulfilment.chooseShip(address);

      expect(() => fulfilment.chooseShip(address)).toThrow('Fulfilment method already chosen');
    });
  });

  describe('chooseCollect', () => {
    it('should_setMethodToCollect_when_statusIsPendingChoice', () => {
      const fulfilment = makeNew();
      const slot = {
        id: 'slot-1',
        fulfilmentId: 'f-1',
        location: 'Sydney Store',
        date: '2026-07-01',
        timeSlot: '10:00-11:00',
      };

      fulfilment.chooseCollect(slot);

      expect(fulfilment.method).toBe(FulfilmentMethod.COLLECT);
      expect(fulfilment.status).toBe(FulfilmentStatus.PENDING_DISPATCH);
      expect(fulfilment.collectionSlot).toEqual(slot);
    });
  });

  describe('markDispatched', () => {
    it('should_setStatusToDispatched_when_methodIsShipAndPendingDispatch', () => {
      const fulfilment = makeNew();
      const address = {
        id: 'addr-1', fulfilmentId: 'f-1', fullName: 'Jane', line1: '1 St',
        line2: null, city: 'Mel', state: 'VIC', postcode: '3000', country: 'AU',
      };
      fulfilment.chooseShip(address);

      fulfilment.markDispatched();

      expect(fulfilment.status).toBe(FulfilmentStatus.DISPATCHED);
    });

    it('should_throwError_when_notPendingDispatch', () => {
      const fulfilment = makeNew();

      expect(() => fulfilment.markDispatched()).toThrow('Cannot dispatch: fulfilment not pending dispatch');
    });
  });

  describe('markCollected', () => {
    it('should_setStatusToCollected_when_methodIsCollectAndPendingDispatch', () => {
      const fulfilment = makeNew();
      const slot = {
        id: 'slot-1', fulfilmentId: 'f-1', location: 'Sydney Store',
        date: '2026-07-01', timeSlot: '10:00-11:00',
      };
      fulfilment.chooseCollect(slot);

      fulfilment.markCollected();

      expect(fulfilment.status).toBe(FulfilmentStatus.COLLECTED);
    });

    it('should_throwError_when_notPendingDispatch', () => {
      const fulfilment = makeNew();

      expect(() => fulfilment.markCollected()).toThrow('Cannot mark collected: fulfilment not pending dispatch');
    });
  });
});
