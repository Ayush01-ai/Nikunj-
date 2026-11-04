import { describe, expect, it } from 'vitest';
import { buildStockPatches, findInsufficientStockLines } from '@/cms/lib/orderStock';
import { variantStock } from '@/cms/lib/pricing';

describe('order stock helpers', () => {
  it('flags paid items that exceed available stock, including duplicate cart lines', () => {
    const products = [{ _id: 'p1', hasQty: true, hasLegacy: false, stockQuantity: 1 }];
    const lines = [
      { productId: 'p1', quantity: 1 },
      { productId: 'p1', quantity: 1 },
    ];

    expect(findInsufficientStockLines(products, lines)).toMatchObject([{ productId: 'p1', quantity: 2 }]);
    expect(buildStockPatches(products, lines, -1)).toEqual([{ id: 'p1', inc: { stockQuantity: -2 } }]);
  });

  it('flags a tracked variant shortage while leaving its base stock unchanged', () => {
    const products = [{
      _id: 'p1',
      hasQty: true,
      hasLegacy: false,
      stockQuantity: 4,
      variants: [{ label: 'Small', hasStock: true, stock: 0 }],
    }];

    expect(findInsufficientStockLines(products, [{ productId: 'p1', option: 'Small', quantity: 1 }]))
      .toMatchObject([{ productId: 'p1', option: 'Small', quantity: 1 }]);
    expect(buildStockPatches(products, [{ productId: 'p1', option: 'Small', quantity: 1 }], -1))
      .toEqual([{ id: 'p1', inc: { stockQuantity: -1, 'sizes[label=="Small"].stock': -1 } }]);
  });

  it('uses base stock only when variant stock is null or undefined', () => {
    const line = [{ productId: 'p1', option: 'Small', quantity: 1 }];
    const products = [
      {
        _id: 'p1',
        hasQty: true,
        hasLegacy: false,
        stockQuantity: 4,
        variants: [
          { label: 'Small', hasStock: false, stock: null },
          { label: 'Medium', hasStock: false, stock: undefined },
        ],
      },
    ];

    expect(findInsufficientStockLines(products, line)).toEqual([]);
    expect(findInsufficientStockLines(products, [{ productId: 'p1', option: 'Medium', quantity: 1 }])).toEqual([]);
    expect(variantStock(
      { price: 10, stock: 4, sizes: [] },
      { label: 'Small', priceModifier: 0 },
    )).toBe(4);
  });

  it('keeps explicitly zero variant stock out of stock even when base stock is positive', () => {
    expect(variantStock(
      { price: 10, stock: 4, sizes: [] },
      { label: 'Small', priceModifier: 0, stock: 0 },
    )).toBe(0);
  });
});
