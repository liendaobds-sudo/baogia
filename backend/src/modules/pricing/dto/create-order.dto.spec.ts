import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateQuoteDto } from './create-order.dto';
import { OrdersService } from '../services/orders.service';

/**
 * Integration test for the two minimal, schema-safe backend changes (Task 2.3):
 *   B1 — CreateQuoteDto accepts vat_rate / vat_amount / shipping_fee / grand_total
 *   B2 — OrdersService.findAllQuotes builds multi-valued `status` SQL (= ANY) vs single (= CAST)
 *
 * Approach (DB-free): a full Nest e2e would need Postgres/Redis which is not
 * guaranteed in CI. Instead:
 *   - B1 is exercised through the real ValidationPipe primitives
 *     (class-transformer plainToInstance + class-validator validate), which is
 *     exactly what the global pipe (whitelist + forbidNonWhitelisted + transform)
 *     runs per request. No errors => the pipe will no longer strip/400 these fields.
 *   - B2 is exercised by instantiating OrdersService with a mocked DataSource whose
 *     `query` captures the SQL + params, asserting the branch selection.
 *
 * _Requirements: 3.5, 11.3, 1.2, 1.3, 2.2, 2.3_
 */
describe('quote-page-ux backend B1 + B2', () => {
  // ─── B1: CreateQuoteDto accepts the four pricing fields ───
  describe('B1 — CreateQuoteDto validation (Requirements 3.5, 11.3)', () => {
    it('passes validation when vat_rate/vat_amount/shipping_fee/grand_total are numbers', async () => {
      const payload = {
        type: 'In nhanh',
        customer_name: 'Cong ty TNHH ABC',
        customer_phone: '0900000000',
        total: 1_000_000,
        vat_rate: 10,
        vat_amount: 100_000,
        shipping_fee: 30_000,
        grand_total: 1_130_000,
        items: [
          { product_name: 'Name card', item_type: 'namecard', quantity: 100, item_total: 1_000_000 },
        ],
      };

      const dto = plainToInstance(CreateQuoteDto, payload);
      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

      expect(errors).toHaveLength(0);
      expect(dto.vat_rate).toBe(10);
      expect(dto.vat_amount).toBe(100_000);
      expect(dto.shipping_fee).toBe(30_000);
      expect(dto.grand_total).toBe(1_130_000);
    });

    it('coerces string-number inputs via @Type(() => Number) and still validates', async () => {
      const payload = {
        customer_name: 'Khach le',
        vat_rate: '10',
        vat_amount: '100000',
        shipping_fee: '30000',
        grand_total: '1130000',
        items: [{ item_type: 'loose', item_total: 1 }],
      };

      const dto = plainToInstance(CreateQuoteDto, payload);
      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

      expect(errors).toHaveLength(0);
      // @Type(() => Number) converts string-numbers to real numbers before @IsNumber runs
      expect(dto.vat_rate).toBe(10);
      expect(dto.vat_amount).toBe(100000);
      expect(dto.shipping_fee).toBe(30000);
      expect(dto.grand_total).toBe(1130000);
      expect(typeof dto.grand_total).toBe('number');
    });

    it('treats the four pricing output fields as optional when quote has an item', async () => {
      const dto = plainToInstance(CreateQuoteDto, {
        customer_name: 'Only name',
        items: [{ item_type: 'loose', item_total: 1 }],
      });
      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

      expect(errors).toHaveLength(0);
      expect(dto.vat_rate).toBeUndefined();
      expect(dto.grand_total).toBeUndefined();
    });

    it('reports an error when a pricing field is a non-numeric string (guard intact)', async () => {
      const dto = plainToInstance(CreateQuoteDto, {
        vat_amount: 'not-a-number',
        items: [{ item_type: 'loose', item_total: 1 }],
      });
      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'vat_amount')).toBe(true);
    });

    it.each([undefined, []])('requires at least one item (items=%p)', async (items) => {
      const dto = plainToInstance(CreateQuoteDto, { customer_name: 'Khách', items });
      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

      expect(errors.some((e) => e.property === 'items')).toBe(true);
    });

    it('rejects negative shipping and VAT above 100 before reaching OrdersService', async () => {
      const dto = plainToInstance(CreateQuoteDto, {
        shipping_fee: -1,
        vat_rate: 101,
        items: [{ item_type: 'loose', item_total: 1 }],
      });
      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

      expect(errors.some((e) => e.property === 'shipping_fee')).toBe(true);
      expect(errors.some((e) => e.property === 'vat_rate')).toBe(true);
    });
  });

  // ─── B2: findAllQuotes multi-status SQL building ───
  describe('B2 — findAllQuotes status SQL (Requirements 1.2, 1.3, 2.2, 2.3)', () => {
    type Captured = { sql: string; params: unknown[] };

    function buildService() {
      const calls: Captured[] = [];
      const dataSource = {
        // No page/limit is passed below, so only the main SELECT runs; it returns []
        // which makes _attachQuoteItems return early (no further DB access).
        query: jest.fn((sql: string, params: unknown[]) => {
          calls.push({ sql, params });
          return Promise.resolve([]);
        }),
      };
      const service = new OrdersService(
        dataSource as never,
        {} as never, // QuotePdfService — unused in findAllQuotes
        {} as never, // CustomersService — unused in findAllQuotes
        {} as never, // EngineOffsetService — unused in findAllQuotes
      );
      return { service, calls };
    }

    it('single status uses `= CAST($n AS TEXT)` with the scalar param', async () => {
      const { service, calls } = buildService();
      await service.findAllQuotes({ status: 'draft' });

      expect(calls).toHaveLength(1);
      const { sql, params } = calls[0];
      expect(sql).toContain('q.status = CAST(');
      expect(sql).not.toContain('ANY(');
      expect(params).toContain('draft');
    });

    it('multiple statuses use `= ANY($n::text[])` with an array param', async () => {
      const { service, calls } = buildService();
      await service.findAllQuotes({ status: 'draft,sent' });

      expect(calls).toHaveLength(1);
      const { sql, params } = calls[0];
      expect(sql).toContain('ANY(');
      expect(sql).not.toContain('q.status = CAST(');
      expect(params).toContainEqual(['draft', 'sent']);
    });

    it('trims whitespace and drops empty entries before building the ANY array', async () => {
      const { service, calls } = buildService();
      await service.findAllQuotes({ status: 'draft, sent ,' });

      const { sql, params } = calls[0];
      expect(sql).toContain('ANY(');
      expect(params).toContainEqual(['draft', 'sent']);
    });

    it('a single status after trimming falls back to `= CAST` (not ANY)', async () => {
      const { service, calls } = buildService();
      await service.findAllQuotes({ status: 'draft, ,' });

      const { sql, params } = calls[0];
      expect(sql).toContain('q.status = CAST(');
      expect(sql).not.toContain('ANY(');
      expect(params).toContain('draft');
    });

    it('empty status string applies no status filter (backward compatible)', async () => {
      const { service, calls } = buildService();
      await service.findAllQuotes({ status: '' });

      const { sql } = calls[0];
      expect(sql).not.toContain('q.status');
    });

    it('absent status applies no status filter', async () => {
      const { service, calls } = buildService();
      await service.findAllQuotes({});

      const { sql } = calls[0];
      expect(sql).not.toContain('q.status');
    });
  });

  // ─── B2 (pure): the status-splitting expression used for `= ANY` ───
  describe('B2 — status split expression (pure)', () => {
    const split = (status: string) =>
      status.split(',').map((s) => s.trim()).filter(Boolean);

    it.each([
      ['a', ['a']],
      ['a,b', ['a', 'b']],
      ['a, b ,', ['a', 'b']],
      ['', []],
    ])('split(%j) -> %j', (input, expected) => {
      expect(split(input as string)).toEqual(expected);
    });
  });
});
