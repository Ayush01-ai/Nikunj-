import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { CartItem } from '@/types';
import { cartItemId } from '@/frontend/lib/product';
import { getVariantPricing } from '@/cms/lib/pricing';
import { track } from '@/frontend/lib/analytics';

interface CartState {
  items: CartItem[];
  isOpen: boolean;
  // IDs explicitly opted out of "Buy selected" checkout. Absence from this list means an
  // item is selected, so existing persisted carts (and newly added items) default to fully
  // selected without needing a migration.
  deselectedIds: string[];
  // Actions
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  removeItems: (ids: string[]) => void;
  updateQuantity: (id: string, quantity: number) => void;
  updateItemOptions: (id: string, changes: { size?: string; color?: string }) => void;
  clearCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  toggleSelected: (id: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  isSelected: (id: string) => boolean;
  // Computed
  totalItems: () => number;
  subtotal: () => number;
  selectedItems: () => CartItem[];
  selectedSubtotal: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    immer((set, get) => ({
      items: [],
      isOpen: false,
      deselectedIds: [],

      addItem: (item) => {
        set((state) => {
          const max = Math.max(1, item.stock || 1);
          const existing = state.items.find((i) => i.id === item.id);
          if (existing) {
            existing.quantity = Math.min(existing.quantity + item.quantity, Math.max(1, existing.stock || 1));
          } else {
            state.items.push({ ...item, quantity: Math.max(1, Math.min(item.quantity, max)) });
          }
        });
        track('add_to_cart', { productId: item.productId, productName: item.name });
      },

      removeItem: (id) => {
        set((state) => {
          state.items = state.items.filter((i) => i.id !== id);
          state.deselectedIds = state.deselectedIds.filter((i) => i !== id);
        });
      },

      removeItems: (ids) => {
        set((state) => {
          const idSet = new Set(ids);
          state.items = state.items.filter((i) => !idSet.has(i.id));
          state.deselectedIds = state.deselectedIds.filter((i) => !idSet.has(i));
        });
      },

      updateQuantity: (id, quantity) => {
        set((state) => {
          const item = state.items.find((i) => i.id === id);
          if (!item || !Number.isFinite(quantity)) return;
          if (quantity <= 0) {
            state.items = state.items.filter((i) => i.id !== id);
          } else {
            item.quantity = Math.min(Math.floor(quantity), Math.max(1, item.stock || 1));
          }
        });
      },

      clearCart: () => {
        set((state) => { state.items = []; state.deselectedIds = []; });
      },

      updateItemOptions: (id, changes) => {
        set((state) => {
          const index = state.items.findIndex((i) => i.id === id);
          if (index < 0) return;
          const item = state.items[index];
          const size = 'size' in changes ? changes.size : item.selectedSize;
          const color = 'color' in changes ? changes.color : item.selectedColor;
          const variant = item.options?.find((o) => o.label === size);
          const productStock = item.productStock ?? item.stock;
          const previous = item.options?.find((o) => o.label === item.selectedSize);
          const basePrice =
            item.basePrice ?? (previous && !previous.price ? item.price - (previous.priceModifier ?? 0) : item.price);
          const pricing = getVariantPricing(
            { price: basePrice, originalPrice: item.baseOriginalPrice, stock: productStock, sizes: item.options, colors: item.colors },
            variant?.label,
            color || undefined,
          );
          const newId = cartItemId(item.productId, variant?.label, color);
          const stock = pricing.stock;
          const colourImage = item.colors?.find((c) => c.label === color)?.image?.asset?.url;

          const duplicate = state.items.find((i, idx) => idx !== index && i.id === newId);
          if (duplicate) {
            duplicate.quantity = Math.min(duplicate.quantity + item.quantity, Math.max(1, duplicate.stock || 1));
            state.items.splice(index, 1);
            state.deselectedIds = state.deselectedIds.filter((i) => i !== id);
            return;
          }
          Object.assign(item, {
            id: newId,
            selectedSize: variant?.label,
            selectedColor: color || undefined,
            basePrice,
            productStock,
            price: pricing.price,
            originalPrice: pricing.mrp,
            stock,
            ...(colourImage ? { image: colourImage } : {}),
            quantity: Math.max(1, Math.min(item.quantity, stock || 1)),
          });
          // Carry the selection state over to the renamed id (options change the item's id).
          if (newId !== id) {
            const wasDeselected = state.deselectedIds.includes(id);
            state.deselectedIds = state.deselectedIds.filter((i) => i !== id);
            if (wasDeselected) state.deselectedIds.push(newId);
          }
        });
      },

      openCart: () => set((state) => { state.isOpen = true; }),
      closeCart: () => set((state) => { state.isOpen = false; }),

      toggleSelected: (id) => {
        set((state) => {
          if (state.deselectedIds.includes(id)) {
            state.deselectedIds = state.deselectedIds.filter((i) => i !== id);
          } else {
            state.deselectedIds.push(id);
          }
        });
      },

      selectAll: () => set((state) => { state.deselectedIds = []; }),
      deselectAll: () => set((state) => { state.deselectedIds = state.items.map((i) => i.id); }),
      isSelected: (id) => !get().deselectedIds.includes(id),

      totalItems: () => get().items.reduce((sum, item) => sum + item.quantity, 0),

      subtotal: () =>
        get().items.reduce((sum, item) => sum + item.price * item.quantity, 0),

      selectedItems: () => {
        const { items, deselectedIds } = get();
        return items.filter((i) => !deselectedIds.includes(i.id));
      },

      selectedSubtotal: () =>
        get().selectedItems().reduce((sum, item) => sum + item.price * item.quantity, 0),
    })),
    {
      name: 'nikunj-cart',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items, deselectedIds: state.deselectedIds }),
    },
  ),
);
