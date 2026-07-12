# Requirements Document

## Introduction

Phiên production-audit của dự án ZeplaoPrint (backend NestJS + frontend Next.js) đã đóng các lỗ hổng dependency KHÔNG-breaking (bump `ws` 8.21.0, fail-fast DB creds, sửa test frontend — đã commit). Phần còn lại là các CVE mức HIGH chỉ vá được bằng nâng cấp BREAKING.

Feature này thực hiện nâng cấp dependency mang tính breaking để đóng các CVE HIGH còn lại, đồng thời chứng minh KHÔNG hồi quy ở bốn trục bắt buộc của `audit-rules.md`: (1) parity giá (engine tính giá/offset/quote), (2) cô lập tenant/RLS (TypeORM + `typeorm-transactional`), (3) toàn bộ test backend (hiện 789) và frontend vẫn xanh, (4) build tái lập (lockfile commit, `tsc`/`jest`/`next build`).

Phạm vi gồm bốn nhóm công việc:
1. Nâng cấp `@nestjs/typeorm` 10 → 11 và đồng bộ toàn hệ NestJS (core/common/swagger/typeorm + uuid an toàn).
2. Nâng cấp Next.js (16.1.6 → bản vá CVE) và hệ sinh thái frontend (eslint-config-next).
3. Xác minh không hồi quy (giá, RLS, test, build) bằng artifact thật.
4. Đóng CVE HIGH (đo `npm audit` trước/sau bằng số thật) và cập nhật CI để bỏ `--legacy-peer-deps`.

Phương pháp tuân thủ `audit-rules.md`: mọi nhận định "đã đóng / đã xanh / không hồi quy" phải `[VERIFIED]` bằng kết quả lệnh thật, không suy đoán bề mặt.

## Glossary

- **Backend**: Dịch vụ API NestJS/TypeScript tại `backend/`, chạy test bằng `jest`, typecheck bằng `tsc --noEmit`.
- **Frontend**: Ứng dụng Next.js tại `frontend/`, build bằng `next build`, typecheck bằng `tsc`.
- **NestJS_Suite**: Tập gói NestJS cần đồng bộ version: `@nestjs/core`, `@nestjs/common`, `@nestjs/swagger`, `@nestjs/typeorm`, cùng các gói nền tảng liên quan (`@nestjs/platform-express`, `@nestjs/platform-socket.io`, `@nestjs/websockets`, `@nestjs/testing`, `@nestjs/cli`).
- **Pricing_Engine**: Cụm tính giá/offset/quote của Backend, được bảo vệ bởi golden test price-preservation và property test VAT/break-even.
- **RLS_Layer**: Cơ chế cô lập dữ liệu theo tenant dựa trên TypeORM + `typeorm-transactional`, gồm `tenant-connection.interceptor` và helper `runInTransaction`/`tenantTransaction` (xem `backend/db/TENANT-RLS-RUNBOOK.md`).
- **CVE_High**: Lỗ hổng bảo mật mức severity "high" báo cáo bởi `npm audit`.
- **Audit_Baseline**: Số liệu `npm audit` đo TRƯỚC khi nâng cấp (backend: `npm audit --omit=dev` = 18 lỗ hổng / 5 high / 13 moderate; frontend: 2-3 high).
- **Audit_Result**: Số liệu `npm audit` đo SAU khi nâng cấp.
- **Lockfile**: `package-lock.json` của Backend và Frontend.
- **CI**: GitHub Actions workflow tại `.github/workflows/ci.yml`.
- **Legacy_Peer_Deps**: Cờ `--legacy-peer-deps` đang dùng trong CI do xung đột peer `@nestjs/swagger@11` vs `@nestjs/common@10`.
- **Backend_Test_Count**: Số test backend cơ sở phải giữ xanh sau nâng cấp (hiện 789).

## Requirements

### Requirement 1: Nâng cấp @nestjs/typeorm và đồng bộ hệ NestJS

**User Story:** As a maintainer, I want @nestjs/typeorm nâng lên 11 và toàn bộ NestJS_Suite đồng bộ version, so that các CVE high phụ thuộc vào tầng TypeORM/NestJS được đóng và peer dependency không còn xung đột.

#### Acceptance Criteria

1. THE Backend SHALL khai báo `@nestjs/typeorm` ở major version 11 trong `backend/package.json`.
2. THE Backend SHALL khai báo các gói NestJS_Suite ở các version tương thích peer với nhau (cụ thể `@nestjs/common`, `@nestjs/core`, `@nestjs/swagger`, `@nestjs/typeorm` không xung đột peer range).
3. WHEN `npm install` chạy trong thư mục `backend` mà KHÔNG dùng Legacy_Peer_Deps, THE Backend SHALL hoàn tất cài đặt mà không phát sinh lỗi peer dependency `ERESOLVE`.
4. THE Backend SHALL khai báo `uuid` ở version không nằm trong danh sách CVE_High của Audit_Baseline.
5. WHEN `npx tsc --noEmit -p tsconfig.json` chạy trong thư mục `backend`, THE Backend SHALL biên dịch không phát sinh lỗi type.
6. IF việc nâng cấp NestJS_Suite làm thay đổi API mà code hiện tại đang dùng, THEN THE Backend SHALL được điều chỉnh mã nguồn để tương thích API mới mà vẫn giữ nguyên hành vi runtime.

### Requirement 2: Nâng cấp Next.js và hệ sinh thái frontend

**User Story:** As a maintainer, I want Next.js và eslint-config-next nâng lên bản vá bảo mật, so that các CVE high phía frontend được đóng.

#### Acceptance Criteria

1. THE Frontend SHALL khai báo `next` ở version đã vá các CVE_High xuất hiện trong Audit_Baseline của Frontend.
2. THE Frontend SHALL khai báo `eslint-config-next` ở version khớp với version của `next`.
3. WHEN `npm run build` chạy trong thư mục `frontend`, THE Frontend SHALL hoàn tất build thành công.
4. WHEN `npx tsc --noEmit` chạy trong thư mục `frontend`, THE Frontend SHALL biên dịch không phát sinh lỗi type.
5. IF việc nâng cấp `next` làm thay đổi API mà code hiện tại đang dùng, THEN THE Frontend SHALL được điều chỉnh mã nguồn để tương thích API mới mà vẫn giữ nguyên hành vi runtime.

### Requirement 3: Xác minh không hồi quy giá (parity Pricing_Engine)

**User Story:** As a maintainer, I want chứng minh Pricing_Engine giữ parity sau nâng cấp, so that nâng cấp dependency không làm sai giá/offset/quote.

#### Acceptance Criteria

1. WHEN bộ test backend chạy bằng `npx jest --runInBand` sau khi nâng cấp, THE Pricing_Engine SHALL làm cho 100% golden test price-preservation đạt trạng thái pass với 0 test thất bại và 0 test bị skip.
2. WHEN bộ test backend chạy bằng `npx jest --runInBand` sau khi nâng cấp, THE Pricing_Engine SHALL tạo ra giá/offset/quote khớp chính xác từng giá trị kỳ vọng đã ghi trong golden test, không có sai lệch ngoài tolerance đã định nghĩa sẵn trong test trước khi nâng cấp.
3. WHEN bộ test backend chạy bằng `npx jest --runInBand` sau khi nâng cấp, THE Pricing_Engine SHALL làm cho 100% property test VAT và break-even hiện có đạt trạng thái pass với 0 test thất bại và 0 test bị skip.
4. WHEN bộ test backend chạy sau khi nâng cấp, THE Backend SHALL giữ tổng số test thực thi không nhỏ hơn Backend_Test_Count (789), không loại bỏ hay vô hiệu hoá bất kỳ golden test hoặc property test giá nào đang tồn tại trước khi nâng cấp.
5. THE maintainer SHALL KHÔNG sửa giá trị kỳ vọng của golden test, KHÔNG nâng giá trị tolerance của property test, và KHÔNG skip/disable test để làm test chuyển sang trạng thái pass.
6. IF một golden test hoặc property test giá thất bại sau nâng cấp, THEN THE maintainer SHALL truy nguyên root cause và sửa nguyên nhân gốc trong mã nguồn hoặc cấu hình thay vì điều chỉnh giá trị kỳ vọng hoặc tolerance của test.

### Requirement 4: Xác minh không vỡ cô lập tenant (RLS_Layer)

**User Story:** As a maintainer, I want xác minh RLS_Layer vẫn hoạt động sau nâng cấp TypeORM, so that cô lập dữ liệu theo tenant không bị phá vỡ.

#### Acceptance Criteria

1. WHEN bộ test backend chạy sau khi nâng cấp, THE RLS_Layer SHALL vượt qua toàn bộ test của `tenant-connection.interceptor`, `tenant-context.service`, và `tenant-transaction`.
2. THE RLS_Layer SHALL giữ helper `runInTransaction`/`tenantTransaction` hoạt động với `typeorm-transactional` ở phiên bản tương thích `@nestjs/typeorm` 11.
3. WHEN một request có tenant context chạy qua `tenant-connection.interceptor` sau nâng cấp, THE RLS_Layer SHALL set tenant context theo request đúng như hành vi trước nâng cấp.
4. IF `typeorm-transactional` không tương thích với version TypeORM mới, THEN THE Backend SHALL nâng `typeorm-transactional` lên version tương thích mà vẫn giữ ký hợp đồng API `runInTransaction`.

### Requirement 5: Giữ toàn bộ test xanh (Backend + Frontend)

**User Story:** As a maintainer, I want toàn bộ test backend và frontend vẫn xanh sau nâng cấp, so that nâng cấp không gây hồi quy ở bất kỳ vùng chức năng nào.

#### Acceptance Criteria

1. WHEN `npx jest --runInBand` chạy trong thư mục `backend` sau khi nâng cấp, THE Backend SHALL báo số test passed bằng hoặc lớn hơn Backend_Test_Count (789) và số test failed bằng 0.
2. WHEN bộ test frontend chạy sau khi nâng cấp, THE Frontend SHALL báo số test failed bằng 0.
3. THE maintainer SHALL ghi lại output thật của lệnh test (số passed/failed) làm bằng chứng `[VERIFIED]`.
4. IF số test passed sau nâng cấp nhỏ hơn Backend_Test_Count, THEN THE maintainer SHALL truy nguyên test nào bị mất hoặc bị skip và khôi phục trước khi kết luận hoàn tất.

### Requirement 6: Đóng CVE high và đo lường trước/sau

**User Story:** As a maintainer, I want đo `npm audit` trước và sau bằng số thật, so that chứng minh các CVE_High đã được đóng.

#### Acceptance Criteria

1. THE System SHALL định nghĩa CVE_High là lỗ hổng có mức severity bằng "high" theo phân loại trong output của `npm audit`.
2. WHEN maintainer chạy `npm audit --omit=dev` trong thư mục `backend` và `npm audit` trong thư mục `frontend` trước khi nâng cấp, THE maintainer SHALL ghi lại Audit_Baseline gồm output thật chưa chỉnh sửa kèm số lượng lỗ hổng theo từng mức severity (critical, high, moderate, low) và mốc thời gian thực hiện cho cả Backend và Frontend.
3. WHEN `npm audit --omit=dev` chạy trong thư mục `backend` sau khi nâng cấp, THE Backend SHALL báo số CVE_High bằng 0.
4. WHEN `npm audit` chạy trong thư mục `frontend` sau khi nâng cấp, THE Frontend SHALL báo số CVE_High bằng 0.
5. WHEN maintainer chạy `npm audit` cho cả Backend và Frontend sau khi nâng cấp, THE maintainer SHALL ghi lại Audit_Result gồm output thật chưa chỉnh sửa kèm số lượng lỗ hổng theo từng mức severity (critical, high, moderate, low) và mốc thời gian thực hiện.
6. THE maintainer SHALL ghi lại bảng so sánh Audit_Baseline với Audit_Result, thể hiện số CVE_High trước và sau cho cả Backend và Frontend.
7. IF còn ít nhất một CVE_High không thể đóng bằng nâng cấp, THEN THE maintainer SHALL ghi lại với mỗi CVE_High đó: mã định danh CVE, lý do không thể đóng bằng nâng cấp, và đường dẫn khai thác (reachability) tương ứng để đánh giá rủi ro.

### Requirement 7: Build tái lập và cập nhật CI

**User Story:** As a maintainer, I want lockfile được commit và CI bỏ được `--legacy-peer-deps`, so that build tái lập và pipeline phản ánh cây phụ thuộc đã đồng bộ.

#### Acceptance Criteria

1. THE maintainer SHALL commit Lockfile đã cập nhật của cả Backend và Frontend.
2. WHEN `npm ci` chạy trong thư mục `backend` mà KHÔNG dùng Legacy_Peer_Deps sau khi đồng bộ version, THE Backend SHALL cài đặt thành công từ Lockfile.
3. WHEN `npm ci` chạy trong thư mục `frontend` mà KHÔNG dùng Legacy_Peer_Deps, THE Frontend SHALL cài đặt thành công từ Lockfile.
4. WHERE việc đồng bộ NestJS_Suite thành công, THE CI SHALL loại bỏ cờ Legacy_Peer_Deps khỏi các bước `npm ci`/`npm install` của job backend.
5. IF việc bỏ Legacy_Peer_Deps làm CI thất bại bước cài đặt, THEN THE maintainer SHALL giữ nguyên cờ và ghi rõ xung đột peer còn lại làm việc tồn đọng.
