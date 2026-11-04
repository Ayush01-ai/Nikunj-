import { beforeEach, describe, expect, it, vi } from 'vitest';

const aggregate = vi.fn();
const updateOne = vi.fn();
vi.mock('@/backend/models/Order', () => ({ Order: { aggregate, updateOne } }));

describe('stockHold', () => {
  beforeEach(() => {
    aggregate.mockReset();
    updateOne.mockReset();
  });

  it('sums held quantities per product and per product|option', async () => {
    aggregate.mockResolvedValue([
      { _id: { productId: 'p1', option: 'M' }, qty: 2 },
      { _id: { productId: 'p1', option: 'L' }, qty: 1 },
      { _id: { productId: 'p2', option: null }, qty: 3 },
    ]);
    const { heldQuantities, holdKey } = await import('@/backend/lib/stockHold');
    const held = await heldQuantities(['p1', 'p2']);
    expect(held.get('p1')).toBe(3);
    expect(held.get(holdKey('p1', 'M'))).toBe(2);
    expect(held.get(holdKey('p1', 'L'))).toBe(1);
    expect(held.get('p2')).toBe(3);

    const pipeline = aggregate.mock.calls[0][0];
    expect(pipeline[0].$match.stockHeld).toBe(true);
  });

  it('fails closed when the held-quantity read fails', async () => {
    aggregate.mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { heldQuantities } = await import('@/backend/lib/stockHold');
    await expect(heldQuantities(['p1'])).rejects.toMatchObject({ name: 'StockLockUnavailableError' });
  });

  it('does not run checkout without a MongoDB stock lock', async () => {
    const { withStockLock } = await import('@/backend/lib/stockHold');
    const callback = vi.fn(async () => 'ok');
    await expect(withStockLock(['p1'], callback)).rejects.toMatchObject({ name: 'StockLockUnavailableError' });
    expect(callback).not.toHaveBeenCalled();
  });

  it('releases the hold for a confirmed order', async () => {
    updateOne.mockResolvedValue({});
    const { releaseStockHold } = await import('@/backend/lib/stockHold');
    await releaseStockHold('NS-1');
    expect(updateOne).toHaveBeenCalledWith({ orderId: 'NS-1', stockHeld: true }, { $set: { stockHeld: false } });
  });
});
