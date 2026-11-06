import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CartItem } from '@/types';
import { useCartStore } from '@/frontend/store/cartStore';

vi.hoisted(() => {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    },
  });
});

const item = (id: string): CartItem => ({
  id,
  productId: id,
  name: id,
  slug: id,
  price: 100,
  image: '',
  deity: '',
  quantity: 1,
  stock: 5,
});

describe('cart item selection', () => {
  beforeEach(() => {
    useCartStore.setState({
      items: [item('already-in-cart'), item('buy-now-item')],
      deselectedIds: [],
    });
  });

  it('selects only the requested item and keeps other cart items', () => {
    useCartStore.getState().selectOnly('buy-now-item');

    expect(useCartStore.getState().selectedItems().map((cartItem) => cartItem.id)).toEqual(['buy-now-item']);
    expect(useCartStore.getState().items.map((cartItem) => cartItem.id)).toEqual([
      'already-in-cart',
      'buy-now-item',
    ]);
  });

  it('does not deselect the cart when the requested item is missing', () => {
    useCartStore.getState().selectOnly('missing-item');

    expect(useCartStore.getState().selectedItems().map((cartItem) => cartItem.id)).toEqual([
      'already-in-cart',
      'buy-now-item',
    ]);
  });
});
