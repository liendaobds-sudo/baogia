import { renderHook, act, waitFor } from '@testing-library/react';
import { useQuoteConfigurator } from './useQuoteConfigurator';

// Mock API_URL
jest.mock('../../../../lib/api', () => ({
  API_URL: 'http://localhost:3000/api'
}));

// Mock useQuoteCart store
const mockAddItem = jest.fn();
jest.mock('../_store/useQuoteCart', () => ({
  useQuoteCart: () => ({
    addItem: mockAddItem,
    items: []
  })
}));

describe('useQuoteConfigurator', () => {
  const token = 'fake-token';

  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn((url: string) => {
      if (url.includes('/pricing/master-data')) {
        return Promise.resolve({
          json: () => Promise.resolve({
            success: true,
            data: {
              materials: [
                { id: 1, name: 'C300', paper_size_id: 1 },
                { id: 2, name: 'F250', paper_size_id: 2 }
              ],
              paper_sizes: [
                { id: 1, name: '65x86', width_mm: 650, height_mm: 860, margin_left: 5, margin_right: 5, margin_top: 5, margin_bottom: 5 },
                { id: 2, name: 'A3', width_mm: 297, height_mm: 420, margin_left: 0, margin_right: 0, margin_top: 0, margin_bottom: 0 }
              ],
              processing_options: []
            }
          })
        } as any);
      }
      if (url.includes('/quote-templates') && !url.includes('/quote-templates/defaults')) {
        return Promise.resolve({
          json: () => Promise.resolve({
            success: true,
            data: { categories: [] }
          })
        } as any);
      }
      if (url.includes('/pricing/calculate')) {
        return Promise.resolve({
          json: () => Promise.resolve({
            success: true,
            data: { total: 100000, price_per_item: 1000, type: 'loose' }
          })
        } as any);
      }
      if (url.includes('/quote-templates/defaults')) {
        return Promise.resolve({
          json: () => Promise.resolve({
            template_name: 'Test Template',
            form_config: { item_width: 100, item_height: 50, shape: 'circle' },
            allowed_materials: ['1'],
            allowed_paper_sizes: ['1']
          })
        } as any);
      }
      return Promise.resolve({ json: () => Promise.resolve({}) } as any);
    });
  });

  it('initializes with default tab and fetches master data', async () => {
    const { result } = renderHook(() => useQuoteConfigurator(token, 'loose'));
    
    expect(result.current.tab).toBe('loose');
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.masterData).toBeTruthy();
    expect((result.current.masterData as any).materials.length).toBe(2);
    // Auto selects first material
    expect(result.current.materialId).toBe('1');
  });

  it('updates allowed filters when template changes', async () => {
    const { result } = renderHook(() => useQuoteConfigurator(token, 'loose'));
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.handleTemplateChange({ target: { value: 'TEMP_CODE' } } as any);
    });

    await waitFor(() => expect(result.current.productName).toBe('Test Template'));
    expect(result.current.itemWidth).toBe(100);
    expect(result.current.shape).toBe('circle');
    expect(result.current.allowedMaterialIds).toEqual(['1']);
    expect(result.current.allowedPaperSizeIds).toEqual(['1']);
  });

  it('calculates optimal paper sizes based on efficiency', async () => {
    const { result } = renderHook(() => useQuoteConfigurator(token, 'loose'));
    
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Strict whitelist: phải chọn mẫu sản phẩm để nạp allowed_paper_sizes (['1']) trước,
    // nếu không dropdown/khổ giấy sẽ rỗng (đi đúng theo cài đặt, không fallback).
    await act(async () => {
      await result.current.handleTemplateChange({ target: { value: 'TEMP_CODE' } } as any);
    });
    await waitFor(() => expect(result.current.allowedPaperSizeIds).toEqual(['1']));

    // Force values that make optimization calculate
    act(() => {
      result.current.setItemWidth(90);
      result.current.setItemHeight(54);
      result.current.setQuantity(500);
      result.current.setMaterialId('1'); // Maps to paper_size 1 (650x860)
    });

    await waitFor(() => {
      expect(result.current.optimizedSizes.length).toBeGreaterThan(0);
    });

    const bestSize = result.current.optimizedSizes[0];
    expect(bestSize.eff).toBeGreaterThan(0);
    expect(bestSize.itemsPerSheet).toBeGreaterThan(0);
  });

  it('triggers calculation payload after state change (debounce)', async () => {
    jest.useFakeTimers();
    
    const { result } = renderHook(() => useQuoteConfigurator(token, 'loose'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setQuantity(200);
      result.current.setMaterialId('2');
      result.current.setPaperSizeId('2');
    });

    // Fast-forward debounce timeout
    act(() => {
      jest.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/pricing/calculate'),
        expect.objectContaining({ method: 'POST' })
      );
      expect(result.current.pricingResult).toEqual({
        total: 100000,
        price_per_item: 1000,
        type: 'loose'
      });
    });

    jest.useRealTimers();
  });
});
