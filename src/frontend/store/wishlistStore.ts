import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface WishlistState {
  ids: string[];
  toggleWishlist: (id: string) => void;
  isWishlisted: (id: string) => boolean;
  clearWishlist: () => void;
}

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      ids: [],

      toggleWishlist: (id) => {
        set((state) => ({
          ids: state.ids.includes(id)
            ? state.ids.filter((i) => i !== id)
            : [...state.ids, id],
        }));
      },

      isWishlisted: (id) => get().ids.includes(id),

      clearWishlist: () => set({ ids: [] }),
    }),
    {
      name: 'nikunj-wishlist',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
