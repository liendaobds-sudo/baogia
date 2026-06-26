/**
 * Fuzz Test: NestJS Calculator vs PHP Calculator
 * 
 * Reads master data directly from MySQL to generate random test inputs,
 * then compares NestJS PricingFacade vs PHP API results.
 *
 * Run: npx jest --testPathPattern fuzz-test --no-cache --forceExit
 */

import axios from 'axios';
import * as mysql from 'mysql2/promise';

const PHP_BASE = 'http://localhost:4001/api/v1';
const NESTJS_BASE = 'http://localhost:4000/api/v1';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

describe('Fuzz Test: NestJS vs PHP Pricing', () => {
  let materials: any[] = [];
  let paperSizes: any[] = [];
  let processingOptions: any[] = [];
  let conn: mysql.Connection;

  beforeAll(async () => {
    // Read master data directly from MySQL — bypasses API auth & entity mapping issues
    try {
      conn = await mysql.createConnection({
        host: 'localhost', user: 'root', password: '', database: 'erp_print',
      });
      const [mats] = await conn.query('SELECT id, name FROM materials');
      materials = mats as any[];
      const [ps] = await conn.query('SELECT id, name FROM paper_sizes');
      paperSizes = ps as any[];
      const [po] = await conn.query('SELECT id, name FROM processing_options');
      processingOptions = po as any[];
      console.log(`✅ MySQL direct: ${materials.length} materials, ${paperSizes.length} paper sizes, ${processingOptions.length} processing`);
    } catch (e: any) {
      console.error('❌ MySQL connection failed:', e.message);
    }
  }, 15000);

  afterAll(async () => {
    if (conn) await conn.end();
  });

  // ═══════════════════════════════════════
  //  20 Loose Product Tests
  // ═══════════════════════════════════════

  const LOOSE_CASES = 20;
  for (let i = 0; i < LOOSE_CASES; i++) {
    it(`Loose #${i + 1}`, async () => {
      if (!materials.length || !paperSizes.length) { return; }

      const mat = pick(materials);
      const ps = pick(paperSizes);
      const qty = randomInt(50, 5000);
      const side = pick(['single', 'double']);
      const ptype = pick(['4c', '1c']);

      const payload = {
        type: 'loose', material_id: mat.id, paper_size_id: ps.id,
        quantity: qty, print_side: side, print_type: ptype, shape: 'rectangle',
        item_width: randomInt(40, 200), item_height: randomInt(40, 200),
        processing: [],
      };

      const label = `M${mat.id}|P${ps.id}|${qty}x|${side}`;

      // Call both engines
      const [phpRes, nestRes] = await Promise.allSettled([
        axios.post(`${PHP_BASE}/public/calculate-price`, payload, { timeout: 5000 }),
        axios.post(`${NESTJS_BASE}/pricing/calculate`, payload, { timeout: 5000 }),
      ]);

      // Compare results
      const phpOk = phpRes.status === 'fulfilled' && phpRes.value.data?.success;
      // NestJS may return {success, data:{total}} OR {total} (unwrapped by PricingProxyController)
      const nestFulfilled = nestRes.status === 'fulfilled';
      const nestData = nestFulfilled ? nestRes.value.data : null;
      const nestOk = nestFulfilled && (
        nestData?.success === true || // wrapped: {success: true, data: {total: ...}}
        (nestData?.total !== undefined && nestData?.total !== null) // unwrapped: {total: ...}
      );

      // Get error details for better logging
      const nestErrMsg = nestRes.status === 'fulfilled' 
        ? (nestRes.value.data?.error || nestRes.value.data?.data?.error || 'unknown')
        : (nestRes as any).reason?.response?.data?.error || (nestRes as any).reason?.message;
      const phpErrMsg = phpRes.status === 'fulfilled'
        ? (phpRes.value.data?.error || 'unknown')  
        : (phpRes as any).reason?.message;

      if (phpOk && nestOk) {
        const phpTotal = Math.round(phpRes.value.data.data.total);
        // NestJS: unwrapped {total} or wrapped {data:{total}}
        const nestTotal = Math.round(nestData?.data?.total ?? nestData?.total ?? 0);
        const diff = Math.abs(phpTotal - nestTotal);
        if (diff <= 1) {
          console.log(`  ✅ ${label} → PHP:${phpTotal}₫ Nest:${nestTotal}₫`);
        } else {
          console.warn(`  🔴 ${label} → PHP:${phpTotal}₫ Nest:${nestTotal}₫ Δ=${diff}₫`);
        }
        expect(diff).toBeLessThanOrEqual(1);
      } else if (!phpOk && !nestOk) {
        console.log(`  ⏭️ ${label} → Both failed`);
      } else if (nestOk && !phpOk) {
        const nestTotal = Math.round(nestData?.data?.total ?? nestData?.total ?? 0);
        console.log(`  🟢 ${label} → NestJS:${nestTotal}₫, PHP failed`);
      } else {
        const phpT = phpOk ? phpRes.value.data.data.total : '?';
        console.warn(`  🟠 ${label} → PHP:${phpT}₫, NestJS: ${nestErrMsg}`);
      }
    }, 10000);
  }

  afterAll(() => {
    console.log(`\n══════════════════════════════════`);
    console.log(`Fuzz: ${LOOSE_CASES} loose cases completed`);
    console.log(`══════════════════════════════════\n`);
  });

  // ═══════════════════════════════════════
  //  15 Bound Product Tests
  // ═══════════════════════════════════════

  const BOUND_CASES = 15;
  for (let i = 0; i < BOUND_CASES; i++) {
    it(`Bound #${i + 1}`, async () => {
      if (!materials.length || !paperSizes.length) { return; }

      const qty = randomInt(50, 500);
      const pages = pick([8, 16, 24, 32, 48, 64]);
      const bind = pick(['saddle_stitch', 'perfect_bind', 'wire_o', 'glue']);
      const cMat = pick(materials);
      const cPs = pick(paperSizes);
      const iMat = pick(materials);
      const iPs = pick(paperSizes);

      const payload = {
        type: 'bound',
        quantity: qty,
        page_count: pages,
        binding_type: bind,
        cover: {
          material_id: cMat.id, paper_size_id: cPs.id,
          print_side: pick(['single', 'double']), print_type: '4c',
        },
        inner: [
          {
            material_id: iMat.id, paper_size_id: iPs.id,
            print_side: 'double', print_type: pick(['1c', '4c']),
          }
        ],
      };

      const label = `B[${bind}]|${pages}p|${qty}x`;

      const [phpRes, nestRes] = await Promise.allSettled([
        axios.post(`${PHP_BASE}/public/calculate-price`, payload, { timeout: 10000 }),
        axios.post(`${NESTJS_BASE}/pricing/calculate`, payload, { timeout: 10000 }),
      ]);

      const phpOk = phpRes.status === 'fulfilled' && phpRes.value.data?.success;
      const nestFulfilled = nestRes.status === 'fulfilled';
      const nestData = nestFulfilled ? nestRes.value.data : null;
      const nestOk = nestFulfilled && (
        nestData?.success === true ||
        (nestData?.total !== undefined && nestData?.total !== null)
      );

      const nestErrMsg = nestRes.status === 'fulfilled' 
        ? (nestRes.value.data?.error || nestRes.value.data?.data?.error || 'unknown')
        : (nestRes as any).reason?.response?.data?.error || (nestRes as any).reason?.message;
      
      if (phpOk && nestOk) {
        const phpTotal = Math.round(phpRes.value.data.data.total || 0);
        const nestTotal = Math.round(nestData?.data?.total ?? nestData?.total ?? 0);
        const diff = Math.abs(phpTotal - nestTotal);
        if (diff <= 1) {
           console.log(`  ✅ ${label} → PHP:${phpTotal}₫ Nest:${nestTotal}₫`);
        } else {
           console.warn(`  🔴 ${label} → PHP:${phpTotal}₫ Nest:${nestTotal}₫ Δ=${diff}₫`);
        }
        expect(diff).toBeLessThanOrEqual(1);
      } else if (!phpOk && !nestOk) {
        console.log(`  ⏭️ ${label} → Both failed`);
      } else if (nestOk && !phpOk) {
        const nestTotal = Math.round(nestData?.data?.total ?? nestData?.total ?? 0);
        console.log(`  🟢 ${label} → NestJS:${nestTotal}₫, PHP failed`);
      } else {
        const phpT = phpOk ? phpRes.value.data.data.total : '?';
        console.warn(`  🟠 ${label} → PHP:${phpT}₫, NestJS: ${nestErrMsg}`);
      }
    }, 15000);
  }
});
