import { create } from 'zustand';

export interface QuoteCartItem {
  id: string;
  name: string; // "Tên File/Sản phẩm"
  type: 'loose' | 'bound' | 'large_format' | 'offset';
  quantity: number;
  total: number;
  unitPrice: number;
  details: any; // The calculated pricing result payload
  configParams: any; // The original parameters
  /** Payload GỐC đã gửi /pricing/calculate — để backend replay xác thực giá (chống sửa giá). */
  pricingPayload?: Record<string, unknown>;
  imageUrl?: string; // Image base64 for preview
}

interface QuoteCartState {
  items: QuoteCartItem[];
  addItem: (item: Omit<QuoteCartItem, 'id'>) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  getTotalAmount: () => number;

  // ── Thông số giá cấp BÁO GIÁ — ĐI THEO UI, không gán cứng trong engine ──
  /** Thuế VAT (%) — 0/5/8/10. Áp cho tính giá từng món + báo giá. */
  vatRate: number;
  /** Chiết khấu (%) — áp trên chi phí SX+thiết kế (engine chặn trần theo cấu hình). */
  chietKhauRate: number;
  /** Phí giao hàng (đ). */
  shippingFee: number;
  /** Cờ: người dùng đã tự chỉnh (để seed mặc định không ghi đè lựa chọn của họ). */
  vatTouched: boolean;
  discountTouched: boolean;
  setVatRate: (v: number) => void;
  setChietKhauRate: (v: number) => void;
  setShippingFee: (v: number) => void;
  /** Nạp mặc định (từ company-info / pricebook) — chỉ áp khi người dùng CHƯA chỉnh. */
  seedVatRate: (v: number) => void;
  seedChietKhauRate: (v: number) => void;
}

export const useQuoteCart = create<QuoteCartState>((set, get) => ({
  items: [],
  addItem: (item) => set((state) => ({
    items: [...state.items, { ...item, id: crypto.randomUUID() }]
  })),
  removeItem: (id) => set((state) => ({
    items: state.items.filter((i) => i.id !== id)
  })),
  clearCart: () => set({ items: [] }),
  getTotalAmount: () => {
    return get().items.reduce((sum, item) => sum + (item.total || 0), 0);
  },

  vatRate: 10,
  chietKhauRate: 0,
  shippingFee: 0,
  vatTouched: false,
  discountTouched: false,
  setVatRate: (v) => set({ vatRate: v, vatTouched: true }),
  setChietKhauRate: (v) => set({ chietKhauRate: v, discountTouched: true }),
  setShippingFee: (v) => set({ shippingFee: v }),
  seedVatRate: (v) => set((s) => (s.vatTouched ? {} : { vatRate: v })),
  seedChietKhauRate: (v) => set((s) => (s.discountTouched ? {} : { chietKhauRate: v })),
}));
