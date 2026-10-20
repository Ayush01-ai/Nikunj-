import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useEffect, useState } from 'react';

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
      // Rehydrated after mount (see Providers) so SSR and the first client render agree.
      skipHydration: true,
    },
  ),
);

/** True once the saved wishlist has been loaded from localStorage. */
export function useWishlistHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(useWishlistStore.persist.hasHydrated());
    return useWishlistStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);
  return hydrated;
}