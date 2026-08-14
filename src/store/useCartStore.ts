import { create } from 'zustand';

export interface CartItem {
  variantId: number;
  productId: number;
  name: string;
  volume: string;
  price: number;
  quantity: number;
}

interface CartStore {
  items: CartItem[];
  isOpen: boolean;
  addItem: (item: CartItem) => void;
  removeItem: (variantId: number) => void;
  updateQuantity: (variantId: number, quantity: number) => void;
  clearCart: () => void;
  toggleCart: () => void;
}

export const useCartStore = create<CartStore>((set) => ({
  items: [],
  isOpen: false,
  addItem: (item) => set((state) => {
    const existingItem = state.items.find((i) => i.variantId === item.variantId);
    if (existingItem) {
      return {
        items: state.items.map((i) => 
          i.variantId === item.variantId ? { ...i, quantity: i.quantity + item.quantity } : i
        ),
        isOpen: true,
      };
    }
    return { items: [...state.items, item], isOpen: true };
  }),
  removeItem: (variantId) => set((state) => ({
    items: state.items.filter((i) => i.variantId !== variantId)
  })),
  updateQuantity: (variantId, quantity) => set((state) => ({
    items: state.items.map((i) => i.variantId === variantId ? { ...i, quantity } : i)
  })),
  clearCart: () => set({ items: [] }),
  toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),
}));
