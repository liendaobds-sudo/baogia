import { create } from 'zustand';
import type { HeaderDiscountType } from '@/lib/quote/header-discount';

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
  /** Chiết khấu đầu báo giá — tách type/value để edit fixed không bị mất tiền. */
  headerDiscountType: HeaderDiscountType;
  headerDiscountValue: number;
  /** Chiết khấu nội bộ engine Offset (%) — engine chặn trần theo cấu hình. */
  offsetEngineDiscountRate: number;
  /** Phí giao hàng (đ). */
  shippingFee: number;
  /** Cờ: người dùng đã tự chỉnh (để seed mặc định không ghi đè lựa chọn của họ). */
  vatTouched: boolean;
  offsetEngineDiscountTouched: boolean;
  setVatRate: (v: number) => void;
  setHeaderDiscount: (type: HeaderDiscountType, value: number) => void;
  setOffsetEngineDiscountRate: (v: number) => void;
  setShippingFee: (v: number) => void;
  /** Nạp mặc định (từ company-info / pricebook) — chỉ áp khi người dùng CHƯA chỉnh. */
  seedVatRate: (v: number) => void;
  seedOffsetEngineDiscountRate: (v: number) => void;
}

export const useQuoteCart = create<QuoteCartState>((set, get) => ({
  items: [],
  addItem: (item) => set((state) => ({
    items: [...state.items, { ...item, id: crypto.randomUUID() }]
  })),
  removeItem: (id) => set((state) => ({
    items: state.items.filter((i) => i.id !== id)
  })),
  // Bắt đầu báo giá mới phải quay header discount về mặc định; discount engine là
  // cấu hình tính giá riêng nên không bị xoá cùng giỏ hàng.
  clearCart: () => set({ items: [], headerDiscountType: 'percent', headerDiscountValue: 0 }),
  getTotalAmount: () => {
    return get().items.reduce((sum, item) => sum + (item.total || 0), 0);
  },

  /**
   * Audit 2026-08-29 — mặc định 0, KHÔNG phải 10.
   *
   * Bất biến "VAT chỉ một nguồn" (audit-rules §7): VAT đến từ thông số nhập lúc báo giá.
   * `seedVatRate` nạp mặc định từ company-info, nhưng lời gọi đó nằm trong `.catch(() => {})`
   * — fetch lỗi hoặc người dùng lưu trước khi fetch xong thì giá trị khởi tạo được persist.
   * Với default 10, một tenant cấu hình VAT 0% vẫn có thể lưu báo giá +10% VAT. Đây là chỗ
   * hardcode 10 CUỐI CÙNG còn lại sau đợt enforce VAT; 0 là mặc định an toàn (không tự thêm
   * thuế mà người dùng không nhập).
   */
  vatRate: 0,
  headerDiscountType: 'percent',
  headerDiscountValue: 0,
  offsetEngineDiscountRate: 0,
  shippingFee: 0,
  vatTouched: false,
  offsetEngineDiscountTouched: false,
  setVatRate: (v) => set({ vatRate: v, vatTouched: true }),
  setHeaderDiscount: (type, value) => set({ headerDiscountType: type, headerDiscountValue: value }),
  setOffsetEngineDiscountRate: (v) => set({
    offsetEngineDiscountRate: v,
    offsetEngineDiscountTouched: true,
  }),
  setShippingFee: (v) => set({ shippingFee: v }),
  seedVatRate: (v) => set((s) => (s.vatTouched ? {} : { vatRate: v })),
  seedOffsetEngineDiscountRate: (v) => set((s) => (
    s.offsetEngineDiscountTouched ? {} : { offsetEngineDiscountRate: v }
  )),
}));
