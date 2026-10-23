---
inclusion: manual
---

# Quy tắc Audit / Review — ZeplaoPrint (BẮT BUỘC)

> Kích hoạt file này bằng `#audit-rules` mỗi khi được yêu cầu "audit", "review",
> "đánh giá", "rà soát" một tính năng hoặc một vùng code.
>
> Mục tiêu: KHÔNG được kết luận sơ sài. Mọi nhận định phải truy đến tận cùng
> (verify-to-ground-truth) trước khi gắn mức độ nghiêm trọng.
>
> Stack dự án: **Backend** NestJS + TypeORM + PostgreSQL (multi-tenant RLS) tại `backend/`;
> **Frontend** Next.js (App Router) + React tại `frontend/`. KHÔNG có Python/venv,
> KHÔNG có Rust, KHÔNG phải app desktop/anticrack — nếu thấy quy tắc nào nhắc tới
> những thứ đó là tàn dư, bỏ qua.

---

## 0. Nguyên tắc cốt lõi

1. **Không suy đoán từ bề mặt.** Một dòng `import`, một tên hàm, một docstring/JSDoc
   KHÔNG đủ để kết luận hành vi. Phải đọc tới phần thân thực thi.
2. **Không gắn severity trước khi xác minh.** Cấm dùng nhãn 🔴/🟠/Nghiêm trọng
   cho tới khi đã chứng minh bằng code thật (đường chạy + thân hàm + dữ liệu).
3. **Tách bạch "đã xác minh" và "nghi ngờ".** Mỗi finding phải ghi rõ
   `[VERIFIED]` (đã đọc/chạy chứng minh) hay `[SUSPECTED]` (mới thấy dấu hiệu).
4. **Sai thì sửa ngay, không phòng thủ.** Nếu user hoặc bằng chứng mới phủ nhận
   một finding, rút lại công khai và ghi lý do.
5. **Tiền bạc/giá là vùng tới hạn.** Mọi thay đổi chạm engine giá, VAT, chiết khấu,
   markup, bù hao phải xác minh bằng test hồi quy (golden/property) + đối chiếu số thật.

---

## 1. Trace-to-ground-truth (quy trình bắt buộc)

Trước khi nói "X gây ra Y" hoặc "đường chạy là Z", phải đi HẾT chuỗi:

1. **Tìm entry point thật:** HTTP route (`@Controller`/`@Post`), event/queue handler
   (BullMQ), interceptor, hoặc nút bấm/hook ở frontend.
2. **Lần theo từng mắt xích** tới nơi thực sự làm việc (sink): controller → service →
   engine/calculator → repository/SQL. Ghi lại `file:line` từng bước.
3. **Phân giải re-export / wrapper / facade ĐẾN CÙNG.** Khi gặp `export { x } from './y'`
   hay một `*.facade.service.ts` / `*-api.service.ts` (vd `PricingApiService` gọi
   `PricingFacadeService`), mở ra xem hàm gốc nằm đâu. Đặc biệt cảnh giác các lớp
   "thin wrapper" và `index.ts` re-export.
4. **Xác nhận live vs dead:** một file/hàm chỉ "đáng lo" nếu nằm trên đường chạy thực.
   Kiểm: ai import nó? Route nào chạm tới? Code trong `dist/`, `*.spec.ts` fixtures,
   file untracked rác, hoặc module legacy không còn được module nào nạp = KHÔNG tính
   là lỗi production (nhưng ghi nhận để dọn).
5. Chỉ khi đã nối được entry → sink mới được phát biểu về hành vi/ảnh hưởng.

> Lưu ý ZeplaoPrint có NHIỀU đường vào cùng một engine (xem §6). Trước khi kết luận
> "luồng tính giá là …", phải xác định đang nói về đường nào (chatbot / mini / chi tiết).

---

## 2. Xác minh bằng thực thi — đúng stack ZeplaoPrint

- **Đúng workspace + đúng lệnh.** Lệnh phải chạy trong thư mục con đúng (`backend/`
  hoặc `frontend/`), KHÔNG ở gốc repo. Dùng script trong `package.json` của workspace
  đó, không giả định môi trường toàn cục.
- **Backend** (cwd `backend/`):
  - Typecheck: `npx tsc --noEmit -p tsconfig.json` → phải 0 lỗi.
  - Test: `npx jest --runInBand`.
  - Property test (fast-check) nằm trong suite jest — xem §8.2 về seed.
- **Frontend** (cwd `frontend/`):
  - Typecheck: `npx tsc --noEmit`.
  - Build production: `npm run build` (Next/Turbopack).
  - Test: `npx jest`.
- **Mốc số lượng test — KHÔNG hardcode ở đây.** Bản trước ghi "~789 test / 87 suite" (backend) và
  "~307 test / 55 suite" (frontend); đến 2026-08-29 thực tế đã là hơn 1300 và gần 400. Mốc lạc hậu
  làm quy tắc "kết quả < mốc phải truy nguyên test mất/skip" mất tác dụng (mọi kết quả đều > mốc).
  👉 Lấy mốc từ **`docs/PRODUCTION-SMOKE.md`** (bảng "Kết quả test tự động", có ghi ngày) hoặc từ
  lần chạy xanh gần nhất trên `main`. So sánh theo DELTA của phiên làm việc, không theo số tuyệt đối.
- **Cài đặt sạch:** `npm ci` thuần (KHÔNG `--legacy-peer-deps`) phải chạy được từ lockfile
  ở cả hai workspace (xem §12.2). ERESOLVE = tín hiệu lệch peer cần truy nguyên.
- Reproduce lỗi bằng test/ca biên: số lượng = 0/âm, thiếu vật liệu, khổ quá nhỏ,
  VAT 0%, đa item trộn offset+digital, tenant khác nhau.
- Dọn sạch file tạm/log sau khi xong.
- Mọi kết luận "đã đóng / đã xanh / không hồi quy" phải `[VERIFIED]` bằng output lệnh
  THẬT (đúng cwd), chưa chỉnh sửa, kèm timestamp.

---

## 3. Phân biệt code sống / chết / trùng lặp

- Trùng lặp: nếu thấy 2 hàm/2 service cùng vai trò, **diff** rồi xác định khác biệt thực
  chất. "Trùng lặp gây rủi ro bảo trì" KHÁC "gây sai kết quả" — chỉ gọi là bug correctness
  khi chứng minh được hai bên cho kết quả khác nhau trên đường chạy.
- Tàn dư build: `backend/dist/` là output biên dịch — KHÔNG audit như source, KHÔNG sửa
  trực tiếp. Sửa ở `src/`.
- File untracked/`.bak`/scratch → liệt kê để dọn, không tính lỗi production.
- Migration/seed cũ trong `db/`, `migrations/` đã chạy: phân biệt "lịch sử đã áp" với
  "còn được nạp lúc bootstrap".

---

## 4. An toàn khi đề xuất xóa / sửa

- Trước khi xóa: phân loại **tracked vs untracked** (`git ls-files`).
  - Tracked → khôi phục được bằng `git checkout` (rủi ro thấp).
  - Untracked + gitignored → **mất vĩnh viễn**, cảnh báo rõ và confirm.
- Xóa hàng loạt / blast radius rộng → liệt kê danh sách + confirm trước.
- **Sửa nhạy cảm về GIÁ** (engine offset/digital, VAT, chiết khấu, markup, bù hao,
  dieline/khổ) → trình bày diff dự kiến + ảnh hưởng tới golden/property test, xin xác
  nhận hướng trước khi áp dụng. Nếu golden đổi số: phải giải thích vì sao đổi là đúng,
  KHÔNG sửa expected/tolerance để "cho xanh".
- **Sửa nhạy cảm về CÔ LẬP DỮ LIỆU** (tenant context, RLS, `SET LOCAL app.current_tenant`,
  bypass) → coi như high-risk, xác minh bằng test tenant + RLS runbook.

---

## 5. Định dạng báo cáo audit

```
## Kiến trúc / Đường chạy (đã trace)
<entry point> → ... → <sink>   (kèm file:line từng mắt xích)

## Phát hiện
[VERIFIED] 🔴/🟠/🟢 <mô tả> — bằng chứng: <file:line + cách đã chứng minh>
[SUSPECTED] <mô tả> — dấu hiệu: <...>; cần kiểm tra thêm: <...>

## Rút lại (nếu có)
<finding cũ> — lý do sai: <...>

## Đề xuất (ưu tiên + mức rủi ro)
```

Quy ước mức độ (chỉ gắn sau khi `[VERIFIED]`):
- 🔴 lỗi correctness / crash / mất dữ liệu / rò rỉ tenant / sai tiền trên đường chạy thật.
- 🟠 rủi ro bảo trì / hiệu năng / nợ kỹ thuật / CVE phụ thuộc.
- 🟢 nhận xét nhỏ, gợi ý cải thiện.

---

## 6. Bối cảnh dự án — kiến trúc tính giá (BẮT BUỘC nắm trước khi audit giá)

ZeplaoPrint có **3 đường vào** cùng cụm engine giá (xem `STRUCTURE.md`):

```
(1) Chatbot AI        quote/extractors → QuoteService.calculateFromParsed ─┐
(2) Mini báo giá      POST /quote/pricing-calc → QuoteService.calculateMiniQuote ─┼─► PricingApiService → PricingFacadeService
(3) Báo giá chi tiết  POST /pricing/calculate (facade) ; offset: POST /pricing/offset/calculate (EngineOffset) ┘
```

Hai họ engine:
- **Digital / In nhanh (loose/bound/large_format):** `PricingFacadeService.calculatePrice`
  (`backend/src/modules/pricing/services/pricing-facade.service.ts`). Trả `total` = **giá vốn**,
  `selling_subtotal` = giá bán trước VAT (markup), `grand_total` = giá bán + VAT.
- **Offset:** `EngineOffsetService` + `offset-engine/` (lookups, totals, products/*). `totals.ts`
  trả `tongChuaVAT → vat → tongGomVAT → chietKhau → khachTra → donGia1SP`.

Luồng báo giá hợp nhất (`backend/src/quote/*`): mỗi method (offset/digital) được bọc thành
plugin **VAT-exclusive** (engine `vatRate = 0`); VAT áp MỘT LẦN ở tầng báo giá qua
`applyQuoteVat` (`backend/src/quote/vat.ts`).

Frontend: VAT cấp báo giá ở store `useQuoteCart.vatRate` (mục thông tin khách hàng,
`CustomerInfo.tsx`); offset configurator truyền `vatRate` xuống engine; mini báo giá có
ô VAT riêng (`MiniQuotePanel.tsx`, mặc định từ company-info).

> Trước khi nói bất cứ điều gì về VAT/giá, xác định đang ở đường nào và engine nào — sai
> đường = kết luận sai.

---

## 7. BẤT BIẾN VAT — "VAT chỉ một nguồn" (canonical, 2026-06-28)

> Đây là quy ước bắt buộc sau phiên enforce VAT. Mọi audit chạm VAT phải kiểm theo mục này.

**Quy ước:** VAT chỉ đến từ **thông số VAT nhập lúc báo giá** (mục thông tin khách hàng cho
báo giá chi tiết; ô VAT riêng cho mini). Engine giá phải **VAT-exclusive**; VAT áp đúng MỘT
LẦN ở tầng báo giá. **CẤM** lấy VAT từ `pricing_config`, từ tenant settings, hay hardcode.

Điểm đã enforce (kỳ vọng khi audit):
- `offset-engine/totals.ts`: `vatPct = vatRate ?? 0` (KHÔNG fallback `TyLe_VAT` của pricebook).
- `pricing-facade.service.ts`: VAT lấy từ `input.vat_rate` (request), thiếu/≤0 ⇒ 0; KHÔNG đọc
  `config.vat_rate`. `grand_total = selling_subtotal + VAT`.
- `quote-pdf.service.ts`: VAT lấy từ `quote.vat_rate` qua `Number.isFinite` (0% được tôn trọng,
  KHÔNG dùng `||` coi 0 là thiếu); KHÔNG fallback `pricing_config`.
- `orders.service.ts` `createQuote` + `recomputeOffsetItems`: item lưu **trước VAT**
  (`net = tongChuaVAT − chietKhau`); header VAT = `data.vat_rate` (khách nhập), áp 1 lần.
- `quote/vat.ts applyQuoteVat`, `quote.controller /compare` (`dto.vat_rate ?? 0`),
  offset/digital method plugin (engine `vatRate = 0`): đã đúng — giữ nguyên.
- `tenant.service.ts` default settings `vat_rate: 0` (không gán cứng 10).
- DB `quotes.vat_rate` default 0.

Hệ quả hành vi đã chấp nhận:
- **Mini báo giá & chatbot** không có mục khách hàng → mini có ô VAT riêng (mặc định
  company-info, gửi `vat_rate` xuống facade → `grand_total` gồm VAT); chatbot
  (`calculateFromParsed`) báo giá bán **chưa VAT** trừ khi truyền rate.
- Test khoá VAT từ config cũ đã được cập nhật để **truyền `vat_rate` tường minh** (giữ
  nguyên số), KHÔNG hạ assertion. Golden offset truyền `vatRate: 0.08` để bảo toàn giá pin.

Khi audit VAT, BẮT BUỘC grep các nguồn cấm: `config.vat_rate`, `pricing_config` + `vat`,
`TyLe_VAT` (chỉ được dùng làm dữ liệu cấu hình, KHÔNG được làm nguồn VAT cho `totals`),
hardcode `* 0.08 / * 1.08 / vat.*10`. Mỗi nơi áp VAT phải truy được về `vat_rate` nhập lúc báo giá.

---

## 8. Parity & golden — engine giá và preview offset

### 8.1 Golden / price-preservation là lưới an toàn — đừng làm yếu
- `offset-price-preservation.golden.spec.ts` pin giá engine offset trên input cố định
  (chênh lệch = 0). Nếu một thay đổi làm lệch số → test gãy = TÍN HIỆU, không phải phiền toái.
- Sửa golden CHỈ khi thay đổi hành vi là CHỦ ĐÍCH và đúng: ưu tiên cách **giữ nguyên số pin**
  (vd truyền tham số tường minh) thay vì sửa con số kỳ vọng. Nếu buộc đổi số, giải thích vì sao.
- Property test giá (`break-even.property`, `totals.property`, `vat.property`…): coi fail flaky
  của fast-check là lỗi thật phải đào; CẤM giảm NUM_RUNS / nâng tolerance để dập.

### 8.2 PBT seed ngẫu nhiên: 1 lần xanh KHÔNG phải bằng chứng
fast-check không pin seed → một run xanh chỉ là "may seed". Chạy nhiều lần (hoặc pin seed)
mới kết luận pass. Một fail flaky là tín hiệu lỗi thật.

### 8.3 Float order-of-operations có thể LẬT quyết định rời rạc
`(a-b)*k` và `a*k - b*k` lệch ~1e-13, đủ làm bin-packing/snap khổ "vừa/không vừa" thêm 1 con
→ preview (frontend tính) ≠ kết quả (backend tính). Khi 2 đường tính cùng đại lượng theo thứ
tự khác nhau → snap/round ở biên để triệt nhiễu.

### 8.4 Preview offset ≡ kết quả (dieline/khổ) — xác minh bằng artifact, không bằng công thức
ZeplaoPrint có preview dàn khổ/dieline offset (`OffsetPreviewSVG`, `DielinePreview`,
`imposeFromKhoIn`, `soConKhoTinh`). Khi nghi preview lệch kết quả/PDF:
- XÁC MINH QUY ƯỚC TRỤC (gốc toạ độ, chiều y, đơn vị cm/mm) bằng quan sát artifact thật,
  KHÔNG giả định rồi tự "chứng minh khớp".
- So bằng **số con/tờ, khổ bình, vị trí thật**, không chỉ data trung gian trong log.
- Parity đa trục: cùng INPUT (giá trị + thứ tự float), cùng THUẬT TOÁN dàn khổ, cùng QUY ƯỚC
  toạ độ, cùng cách RENDER (SVG frontend vs PDF backend `quote-pdf.service`). Sửa 1 trục có thể
  lộ sai trục kế — không tuyên bố "đã khớp" tới khi kiểm end-to-end.

---

## 9. Multi-tenant / RLS / Auth (vùng tới hạn)

- ZeplaoPrint là SaaS đa tenant dùng PostgreSQL RLS (xem `backend/db/TENANT-RLS-RUNBOOK.md`,
  `common/tenant/*`, migration `*_tenant_*`). Mỗi request set tenant context
  (`SET LOCAL app.current_tenant`) qua interceptor + transaction.
- Khi audit truy vấn/route trả dữ liệu: kiểm có lọc theo tenant không, hoặc dựa RLS — và RLS
  có thực sự bật cho bảng đó không. Truy vấn bỏ qua tenant context = 🔴 rò rỉ dữ liệu.
- `bypass` RLS (admin/cron) phải có chủ đích và giới hạn; audit xem ai gọi đường bypass.
- Auth: route nhạy cảm phải có guard (JWT/role). Endpoint mới mở mạng mà thiếu auth = 🔴 —
  nêu rõ kể cả khi không được hỏi.

---

## 10. Khi QUAN SÁT của user mâu thuẫn với phân tích của mình

- User **lặp lại** "vẫn sai / vẫn lệch" trong khi mình "đã chứng minh khớp" → giả định của
  mình gần như chắc sai. Dừng lập luận cũ; đổi phương pháp: chạy lại số thật / render artifact.
- User chỉ vào chi tiết cụ thể (vd "giá lệch đúng phần VAT", "offset gồm VAT mà digital không")
  → dùng ngay chi tiết đó làm mốc ground truth.
- Một hướng thất bại 2 lần → chẩn đoán lại ROOT CAUSE từ đầu, đừng vá lớp ngọn.

---

## 11. Kỷ luật logging

- Dùng Nest `Logger` đúng mức: debug/trace dùng `logger.debug`, KHÔNG dùng `warn/error` cho
  log thường (flood + tốn I/O ở vòng lặp nóng như tính nhiều item/candidate khổ).
- Không nuốt lỗi (`catch {}` trống) trên đường chạy thật; cũng không lộ stacktrace/đường dẫn
  nội bộ ra client.
- Khi audit hiệu năng: rà log mức cao trong vòng lặp nóng (offset cascade, sheet-optimizer).

---

## 12. Production Readiness (go/no-go cho web SaaS)

> Vẫn verify-to-ground-truth: mọi nhãn 🔴/🟠 phải có bằng chứng (file:line / output lệnh),
> tách `[VERIFIED]`/`[SUSPECTED]`. "Đạt" chỉ khi đã CHỨNG MINH.

### 12.1 Secrets & Config
- Quét secret tracked: `git ls-files | Select-String -Pattern '\.env$|secret|key|token|\.pem'`.
  `.env` thật KHÔNG được tracked; chỉ `.env.example` (placeholder). Secret từng vào lịch sử =
  coi như **đã lộ** → xoay key, không chỉ xoá file. Lưu ý repo có `.env`, `backend/.env`.
- Config production từ biến môi trường; thiếu biến bắt buộc phải fail-fast khi khởi động.
- `ai-config.json` / `pricing_config` là cấu hình nghiệp vụ — KHÔNG được trở thành nguồn VAT (§7).

### 12.2 Dependencies & Supply Chain
- Lockfile (`backend/package-lock.json`, `frontend/package-lock.json`) phải tracked.
  Version thả nổi trên đường production = 🟠.
- `npm audit --omit=dev` (backend) + `npm audit` (frontend): mục tiêu **0 HIGH**.
  Hiện trạng sau audit 2026-08-29: **backend prod deps = 0 lỗ hổng; frontend = 0 lỗ hổng;
  toàn cây backend = 0 high/critical** (còn low/moderate thuần dev từ chuỗi `sqlite3` → `node-gyp`).
  Cách đạt được: `overrides` nâng lên `socket.io-parser ^4.2.7`, `tar ^7.5.22`,
  `brace-expansion ^5.0.9`, `js-yaml ^4.3.2`, `fast-uri ^3.1.6`, `ip-address ^10.5.0`;
  frontend thêm `nanoid ^3.3.18`; `typeorm ^0.3.31`; chuyển `sqlite3` sang **devDependencies**
  (production dùng `pg`); **gỡ driver không dùng** `mariadb`, `mysql`, `mysql2`, `sql.js`.
  ⚠️ Khi thêm `overrides`, kiểm dải bị ảnh hưởng của advisory là **inclusive** — ghim đúng bằng
  mốc cuối của dải (vd `tar ^7.5.19` cho advisory `≤7.5.20`) là VẪN CÒN LỖ HỔNG.
- `npm ci` thuần (không `--legacy-peer-deps`) phải sạch — CI (`.github/workflows/ci.yml`) đã bỏ cờ.
- Stack ở NestJS 11 / Next 16.2.x / React 19.2.x — **không hardcode patch version vào tài liệu**;
  đọc `package.json`. Bump phá vỡ phải đi kèm regression đầy đủ.

### 12.3 Error Handling & Observability
- Lỗi đường chạy thật được bắt và báo có nghĩa (xem `all-exceptions.filter.ts`), không nuốt im,
  không lộ nội bộ ra client.
- Có log lỗi production để chẩn đoán; tài nguyên (transaction, queue job, file) giải phóng cả nhánh lỗi.

### 12.4 Tests & CI
- Test chạy bằng đúng workspace và đang xanh: backend `npx jest`, frontend `npx jest`,
  `npx tsc --noEmit` cả hai, `npm run build` frontend. Dán output thật.
  (Mốc số lượng: xem §2 — lấy từ `docs/PRODUCTION-SMOKE.md`, không hardcode ở đây.)
- CI có chặn merge khi fail (không chỉ trang trí).
- Vùng lõi (engine giá, VAT một nguồn, parity offset, tenant/RLS) phải có test hồi quy.

### 12.5 Data Safety & Tenant Isolation
- Ghi/đè/xoá dữ liệu có transaction + đường khôi phục.
- Cô lập tenant (§9) là tiêu chí GO: rò rỉ chéo tenant = NO-GO.

### 12.6 Kết luận GO / NO-GO
- **NO-GO** nếu có 🔴: secret đã lộ, sai tiền/VAT trên đường chính, rò rỉ tenant, mất/hỏng dữ
  liệu, crash đường chính, build/`npm ci` không tái lập.
- **GO có điều kiện** nếu chỉ còn 🟠: liệt kê việc phải làm + rủi ro nếu ship luôn.
- **GO** nếu mọi nhóm PASS và test lõi xanh.
> Không tuyên bố GO chỉ vì "không thấy lỗi" — phải CHỦ ĐỘNG kiểm từng nhóm.

---

## 13. Severity = correctness × REACHABILITY × CONSUMPTION

Một finding "đúng ở mức code" CHƯA chắc là lỗi production. Nhân thêm 2 yếu tố:
- **Reachability:** đoạn code có nằm trên đường chạy live không (§1.4)?
- **Consumption:** với lỗi "gán/truyền SAI một giá trị", tìm xem **ai ĐỌC** giá trị đó. Sinh ra
  nhưng không consumer live nào đọc → **moot**, hạ severity. (Vd: một field trên facade result
  nhưng FE chỉ đọc field khác.)

Với mỗi finding về dữ liệu/tham số, ghi thêm:
`Consumer (live): <file:line đọc giá trị>` hoặc `Consumer: KHÔNG → moot`.

Không tin claim của sub-agent / báo cáo cũ — `[SUSPECTED]` cho tới khi TỰ chạy lại artifact và
xác minh đúng số/đúng dòng. Độ sâu mặc định = SÂU ngay lượt đầu, không đợi bị hỏi "kỹ chưa".

Mẫu dán vào báo cáo:
```
[VERIFIED|SUSPECTED] <severity> <mô tả>
  Sink/đường chạy: <entry → ... → file:line>
  Consumer (live): <file:line đọc giá trị>  | hoặc: KHÔNG → moot
  Bằng chứng: <đọc code / lệnh đã chạy đúng workspace + kết quả>
```

---

## 14. Checklist tự kiểm trước khi gửi báo cáo

- [ ] Mỗi finding có `[VERIFIED]`/`[SUSPECTED]` rõ ràng.
- [ ] Mỗi nhãn 🔴/🟠 kèm bằng chứng code (file:line) + đã trace tới sink.
- [ ] Đã phân giải hết re-export/wrapper/facade liên quan.
- [ ] Đã phân biệt live vs dead code (kể cả `dist/`, fixtures, untracked).
- [ ] Lệnh verify chạy đúng workspace (`backend/` hoặc `frontend/`), dán output thật.
- [ ] Đề xuất xóa đã nêu tracked/untracked + mức khôi phục.
- [ ] (Giá/VAT) Đã kiểm bất biến §7: VAT chỉ từ thông số báo giá, engine VAT-exclusive, không
      nguồn config/hardcode; golden/property giá còn xanh hoặc đổi số có giải trình.
- [ ] (Parity offset) Đã so trên artifact thật (số con/tờ, khổ, vị trí), khớp đủ input + thuật
      toán + toạ độ + render.
- [ ] (Float) Đã cân nhắc nhiễu order-of-operations ở quyết định rời rạc/biên.
- [ ] (Tenant) Truy vấn/route nhạy cảm đã kiểm lọc theo tenant / RLS bật thật.
- [ ] (Auth) Route mạng mới có guard; thiếu auth đã nêu kể cả khi không được hỏi.
- [ ] Với "bug truyền sai giá trị": đã xác minh CONSUMER live đọc giá trị đó (không ai đọc = moot).
- [ ] PBT seed ngẫu nhiên: không kết luận pass từ 1 run; fail flaky đã đào tới gốc.
- [ ] Quan sát của user không bị bác bằng "log/test nói khớp" — nếu mâu thuẫn đã đo lại.
- [ ] Đã làm lượt sâu NGAY từ đầu, không đợi user hỏi lại mới đào kỹ.
